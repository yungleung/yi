import { unified } from 'unified';
import remarkDeflist from 'remark-deflist';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import type { Root, RootContent } from 'mdast';
import { restoreEmptyItems } from './empty_items';
import { remarkCitation } from '../plugins/remark-citation/index';
import { remarkWikilink } from '../plugins/remark-wikilink/index';

const parseProcessor = unified()
  .use(remarkParse)
  .use(remarkDeflistCompat)
  .use(remarkDeflist)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkCitation)
  .use(remarkWikilink);

/** Re-parses a description detail's raw content with the full pipeline. */
const fragmentProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDeflist)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkCitation)
  .use(remarkWikilink);

const stringifyProcessor = unified()
  .use(remarkStringify as any, {
    fences: true,
    bullet: '-',
    incrementListMarker: false,
    closeAtx: true,
    listItemIndent: 'one',
    handlers: {
      descriptionlist(node: any, _parent: any, state: any, info: any): string {
        return state.containerFlow(node, info);
      },
      descriptionterm(node: any, _parent: any, state: any, info: any): string {
        return state.containerPhrasing(node, info);
      },
      descriptiondetails(node: any, _parent: any, state: any, info: any): string {
        return `: ${state.containerPhrasing(node, info)}`;
      },
      delete(node: any, _parent: any, state: any, info: any): string {
        return `~~${state.containerPhrasing(node, info)}~~`;
      }
    }
  })
  .use(remarkGfm)
  .use(remarkDeflist)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkCitation)
  .use(remarkWikilink);

export function parseMarkdown(markdown: string): Root {
  const tree = parseProcessor.parse(markdown) as Root;
  const root = parseProcessor.runSync(tree) as Root;
  fixDescriptionPositions(root, markdown);
  restoreEmptyItems(root, markdown);
  return root;
}

/**
 * remark-deflist serializes deflist paragraphs with a CommonMark-only
 * `toMarkdown` that throws on GFM nodes (strikethrough is parsed into a
 * `delete` node by remark-gfm's parser extensions before deflist runs).
 * Convert those nodes back to their raw markdown text inside deflist
 * paragraphs; the details are re-parsed with the full pipeline afterwards
 * (see {@link fixDescriptionPositions}), restoring the GFM constructs.
 */
function remarkDeflistCompat() {
  return (tree: Root): void => {
    walk(tree, (node) => {
      if (node.type !== 'paragraph') {
        return;
      }
      const text = String(stringifyProcessor.stringify(node as never));
      if (!/^:\s/.test(text) && !/\n:\s/.test(text)) {
        return;
      }
      flattenDeleteNodes(node);
    });
  };
}

/** Replaces `delete` nodes with text containing their raw `~~…~~` markers. */
function flattenDeleteNodes(node: unknown): void {
  const children = (node as { children?: unknown[] }).children;
  if (!Array.isArray(children)) {
    return;
  }
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index] as { type?: string; children?: unknown[] };
    if (child.type === 'delete') {
      children[index] = {
        type: 'text',
        // Stringify appends a document-level trailing newline; without
        // trimming it, the marker could land on a fresh line and make the
        // detail fragment parse as a paragraph plus a list item.
        value: String(stringifyProcessor.stringify(child as never)).trimEnd()
      };
    } else if (Array.isArray(child.children)) {
      flattenDeleteNodes(child);
    }
  }
}

/**
 * remark-deflist rebuilds description lists by re-parsing their fragments
 * with plain CommonMark, so the term/details nodes have no positions, their
 * descendants carry 0-based fragment-relative ones, and GFM constructs
 * (strikethrough, ...) are dropped. Reconstruct each element's span against
 * the source document and re-parse the terms' and details' raw content with
 * the full pipeline, so rendering and offset mapping see correct absolute
 * positions like every other node.
 */
function fixDescriptionPositions(tree: Root, markdown: string): void {
  walk(tree, (node) => {
    if (node.type !== 'descriptionlist') {
      return;
    }
    const list = node as RootContent & {
      children: RootContent[];
      position?: { start: { offset: number }; end: { offset: number } };
    };
    const terms = list.children.filter((child) => child.type === 'descriptionterm');
    const details = list.children.filter((child) => child.type === 'descriptiondetails');
    if (terms.length === 0) {
      return;
    }
    // Locate the list by its first term at a line boundary, then walk the
    // source lines in order: non-blank lines are terms, `: ` lines are
    // details. This stays correct even when GFM markers (dropped by the
    // plugin's fragment re-parse) differ between the source and the tree.
    const firstTerm = String(stringifyProcessor.stringify(terms[0] as never)).trim();
    const listStart = findLineStart(markdown, firstTerm);
    if (listStart < 0) {
      return;
    }
    let termIndex = 0;
    let detailIndex = 0;
    let lineStart = listStart;
    let lastEnd = listStart;
    while (termIndex < terms.length || detailIndex < details.length) {
      const nextNewline = markdown.indexOf('\n', lineStart);
      const lineEnd = nextNewline < 0 ? markdown.length : nextNewline;
      const sourceLine = markdown.slice(lineStart, lineEnd);
      if (/^:\s+/.test(sourceLine) && detailIndex < details.length) {
        const detail = details[detailIndex++];
        if (detail) {
          const content = sourceLine.replace(/^:\s+/, '');
          (detail as { position?: unknown }).position = {
            start: { offset: lineStart },
            end: { offset: lineEnd }
          };
          reparseDescriptionContent(detail, content, lineStart + sourceLine.length - content.length);
        }
      } else if (sourceLine.trim() !== '' && termIndex < terms.length) {
        const term = terms[termIndex++];
        if (term) {
          (term as { position?: unknown }).position = {
            start: { offset: lineStart },
            end: { offset: lineEnd }
          };
          // Only the indentation is dropped: the term's trailing spaces are
          // kept (as the non-breaking spaces `trailing_spaces.ts` writes) so a
          // space typed at the end of a term stays visible and editable.
          const content = sourceLine.trimStart();
          reparseDescriptionContent(term, content, lineStart + sourceLine.length - content.length);
        }
      }
      lastEnd = lineEnd;
      if (nextNewline < 0) {
        break;
      }
      lineStart = nextNewline + 1;
    }
    list.position = {
      start: { offset: listStart },
      end: { offset: lastEnd }
    };
  });
}

/** The offset of the first line of `content` in `markdown`, or -1. */
function findLineStart(markdown: string, content: string): number {
  if (content === '') {
    return -1;
  }
  if (markdown.startsWith(content)) {
    return 0;
  }
  const index = markdown.indexOf('\n' + content);
  return index < 0 ? -1 : index + 1;
}

/**
 * Replaces a term/details element's children with the full-pipeline parse of
 * its raw content, shifting the fragment-relative positions to absolute.
 */
function reparseDescriptionContent(
  element: RootContent & { children: RootContent[] },
  source: string,
  absoluteStart: number
): void {
  const root = fragmentProcessor.runSync(fragmentProcessor.parse(source)) as Root;
  const children = root.children.flatMap((child) =>
    child.type === 'paragraph' ? (child.children ?? []) : [child]
  );
  for (const child of children) {
    walk(child, (desc) => {
      const position = (
        desc as { position?: { start: { offset: number }; end: { offset: number } } }
      ).position;
      if (position) {
        position.start.offset += absoluteStart;
        position.end.offset += absoluteStart;
      }
    });
  }
  element.children = children;
}

/** Depth-first walk over a tree node and its descendants. */
function walk(node: unknown, callback: (node: any) => void): void {
  callback(node);
  const children = (node as { children?: unknown[] }).children;
  if (Array.isArray(children)) {
    for (const child of children) {
      walk(child, callback);
    }
  }
}

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

export function serializeMarkdown(tree: Root | RootContent[]): string {
  const sanitizedTree = Array.isArray(tree)
    ? { type: 'root', children: tree.map((node) => sanitizeNode(node)) } as Root
    : sanitizeNode(tree);

  return String(stringifyProcessor.stringify(sanitizedTree));
}
