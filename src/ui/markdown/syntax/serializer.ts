/**
 * Serializes mdast nodes back to the markdown source the editor owns.
 *
 * Example: a revealable link node is written back as its original
 * `[title](destination)` source instead of a normalized rendering.
 *
 * May import: remark stringify and the plugins that define custom node output.
 * Upholds: serialization preserves editor-owned source for custom nodes.
 */

import remarkDeflist from 'remark-deflist';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import type { Root, RootContent } from 'mdast';
import { remarkCitation } from '../plugins/remark-citation/index';
import { remarkWikilink } from '../plugins/remark-wikilink/index';

const stringifyProcessor = unified()
  .use(remarkStringify as any, {
    fences: true,
    bullet: '-',
    incrementListMarker: false,
    closeAtx: true,
    listItemIndent: 'one',
    handlers: {
      autoReference(node: any): string {
        return String(node.value ?? `[#${node.id}]`);
      },
      figure(node: any): string {
        return `${String(node.source ?? '').trimEnd()}\n`;
      },
      listing(node: any): string {
        return `${String(node.source ?? '').trimEnd()}\n`;
      },
      table(node: any): string {
        return `${String(node.source ?? '')}\n`;
      },
      tableCaption(node: any): string {
        return `${String(node.source ?? '')}\n`;
      },
      list(node: any, _parent: any, state: any, info: any): string {
        return typeof node.source === 'string'
          ? `${node.source}\n`
          : state.containerFlow(node, info);
      },
      heading(node: any, _parent: any, state: any, info: any): string {
        const depth = Math.max(1, Math.min(6, Number(node.depth) || 1));
        const content = state.containerPhrasing(node, info);
        const attributes = node.headingAttributes;
        return `${'#'.repeat(depth)} ${content}${attributes ? attributes.separator + attributes.source : ''}\n`;
      },
      descriptionlist(node: any, _parent: any, state: any, info: any): string {
        return state.containerFlow(node, info);
      },
      descriptionterm(node: any, _parent: any, state: any, info: any): string {
        return state.containerPhrasing(node, info);
      },
      descriptiondetails(node: any, _parent: any, state: any, info: any): string {
        return `: ${state.containerPhrasing(node, info)}`;
      },
      callout(node: any): string {
        return `${String(node.callout?.source ?? '').trimEnd()}\n`;
      },
      delete(node: any, _parent: any, state: any, info: any): string {
        return `~~${state.containerPhrasing(node, info)}~~`;
      }
    }
  })
  .use(remarkGfm)
  .use(remarkDeflist)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkCitation)
  .use(remarkWikilink);

/**
 * Writes one node as markdown.
 *
 * Example: the description-list compatibility layer writes an inline citation
 * from its original source before the plain list writer sees it as text.
 */
export function stringifyMarkdownNode(node: unknown): string {
  return String(stringifyProcessor.stringify(node as never));
}

/**
 * The node types that plain list writer cannot serialize.
 *
 * Example: a `wikilink` is replaced by the text of its original `[[target]]`
 * source before a description term is re-parsed.
 */
const UNWRITABLE_NODES = new Set([
  'delete',
  'citation',
  'wikilink',
  'inlineMath',
  'footnoteReference'
]);

/** Replaces nodes the list writer cannot serialize with the text they came from. */
export function flattenUnwritableNodes(node: unknown): void {
  const children = (node as { children?: unknown[] }).children;
  if (!Array.isArray(children)) {
    return;
  }
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index] as { type?: string; children?: unknown[] };
    if (child.type !== undefined && UNWRITABLE_NODES.has(child.type)) {
      children[index] = {
        type: 'text',
        value: stringifyMarkdownNode(child).trimEnd()
      };
    } else if (Array.isArray(child.children)) {
      flattenUnwritableNodes(child);
    }
  }
}

/** Copies only the tree shape, leaving non-node values and prototypes behind. */
function sanitizeNode(node: any): any {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node.children)) {
    return {
      ...node,
      children: node.children.map((child: any) => sanitizeNode(child))
    };
  }
  return node;
}

/**
 * Serializes one tree or node list as markdown.
 *
 * Example: `serializeMarkdown([linkNode])` returns the link's original source
 * with one trailing document newline.
 */
export function serializeMarkdown(tree: Root | RootContent[]): string {
  const sanitizedTree = Array.isArray(tree)
    ? ({ type: 'root', children: tree.map((node) => sanitizeNode(node)) } as Root)
    : sanitizeNode(tree);
  return stringifyMarkdownNode(sanitizedTree);
}
