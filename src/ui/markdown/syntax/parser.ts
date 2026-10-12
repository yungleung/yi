/**
 * The markdown pipeline: parse one slice of raw text into an mdast tree, and
 * serialize a node back to markdown.
 *
 * Every block is parsed from its own slice, with the repairs markdown needs to
 * survive block-by-block parsing applied around the parse (see
 * `bare_markers.ts`, `empty_items.ts`, `footnotes.ts`), and the plugins the editor added
 * (citations, wikilinks, description lists) mounted here once.
 *
 * May import: the parser libraries, the remark plugins that extend them, and the
 * syntax modules that repair their output. Upholds: one fact about markdown
 * syntax has one home — this module says which pipeline turns text into nodes,
 * and nothing else in the editor parses markdown.
 */

import { unified } from 'unified';
import remarkDeflist from 'remark-deflist';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import type { Root, RootContent } from 'mdast';
import { restoreEmptyItems } from './empty_items';
import { restoreBareMarkers } from './bare_markers';
import { restoreImagePaths } from './image_paths';
import { footnoteLabels, isOwnNode, withFootnoteDefinitions } from './footnotes';
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
  restoreBareMarkers(root, markdown);
  restoreEmptyItems(root, markdown);
  restoreImagePaths(root, markdown);
  return root;
}

/**
 * remark-deflist serializes deflist paragraphs with a CommonMark-only `toMarkdown`,
 * and everything the editor's pipeline adds to a line is a node that writer does not
 * know: it throws on GFM's `delete`, on a citation, a wikilink, inline math and a
 * footnote reference (all of them parsed before deflist runs, because they are
 * micromark constructs rather than transformers).
 *
 * So a description list holding any of them is rewritten as its own text first, and
 * the terms and details are re-parsed with the full pipeline afterwards
 * ({@link fixDescriptionPositions}), where the nodes come back.
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
      flattenUnwritableNodes(node);
    });
  };
}

/**
 * The node types that writer cannot serialize. `delete` is GFM's; the rest are this
 * editor's own (a citation, a wikilink), remark-math's and remark-gfm's — each one a
 * node `stringifyProcessor` can write back as the source it was parsed from.
 */
const UNWRITABLE_NODES = new Set([
  'delete',
  'citation',
  'wikilink',
  'inlineMath',
  'footnoteReference'
]);

/** Replaces the nodes the list writer cannot serialize with the text they came from. */
function flattenUnwritableNodes(node: unknown): void {
  const children = (node as { children?: unknown[] }).children;
  if (!Array.isArray(children)) {
    return;
  }
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index] as { type?: string; children?: unknown[] };
    if (child.type !== undefined && UNWRITABLE_NODES.has(child.type)) {
      children[index] = {
        type: 'text',
        // Stringify appends a document-level trailing newline; without
        // trimming it, the marker could land on a fresh line and make the
        // detail fragment parse as a paragraph plus a list item.
        value: String(stringifyProcessor.stringify(child as never)).trimEnd()
      };
    } else if (Array.isArray(child.children)) {
      flattenUnwritableNodes(child);
    }
  }
}

/**
 * remark-deflist rebuilds description lists by re-parsing their fragments with plain
 * CommonMark, so the term/details nodes have no positions, their descendants carry
 * 0-based fragment-relative ones, and the constructs the editor adds are dropped (or,
 * with `remarkDeflistCompat`, flattened to text). Reconstruct each element's span
 * against the source document and re-parse the terms' and details' raw content with the
 * full pipeline, so rendering and offset mapping see correct absolute positions like
 * every other node.
 */
function fixDescriptionPositions(tree: Root, markdown: string): void {
  // A term or a detail is re-parsed from its own line, which is a fragment: the
  // definitions its references need are borrowed here, exactly as a whole block borrows
  // them (`footnotes.ts`), so the borrow is read once for the whole document.
  const definitions = footnoteLabels(markdown);
  /** Visits every child list of `children`, which are one parent's. */
  const visit = (children: RootContent[]): void => {
    children.forEach((child, index) => {
      const node = child as RootContent & { children?: RootContent[]; position?: NodePosition };
      if (Array.isArray(node.children)) {
        visit(node.children);
      }
      if (node.type !== 'descriptionlist' || !node.children) {
        return;
      }
      const terms = node.children.filter((entry) => entry.type === 'descriptionterm');
      const details = node.children.filter((entry) => entry.type === 'descriptiondetails');
      if (terms.length === 0) {
        return;
      }
      // The plugin swaps the paragraphs it rewrote for the list, so the list covers the
      // gap between its neighbours — one paragraph (`term\n: detail`) or two, split by a
      // blank line (`term\n\n: detail`), with every gap between them inside it. Matching
      // a *serialized* term against the source is what this used to do, and it is lossy
      // in the way the crash above was: the writer drops what a reader cannot see, so
      // `&amp;` comes back as `&`, the line was not found, and the whole repair silently
      // gave up — leaving every node in the list with fragment-relative offsets.
      const lines = readDescriptionLines(
        markdown,
        positionEnd(children.slice(0, index)),
        positionStart(children.slice(index + 1)),
        terms.length,
        details.length
      );
      if (!lines) {
        return;
      }
      let termIndex = 0;
      let detailIndex = 0;
      for (const line of lines) {
        const sourceLine = markdown.slice(line.start, line.end);
        if (line.kind === 'detail') {
          const detail = details[detailIndex++];
          if (detail) {
            const content = sourceLine.replace(/^:\s+/, '');
            (detail as { position?: unknown }).position = {
              start: { offset: line.start },
              end: { offset: line.end }
            };
            reparseDescriptionContent(
              detail,
              content,
              line.start + sourceLine.length - content.length,
              definitions
            );
          }
        } else if (line.kind === 'term') {
          const term = terms[termIndex++];
          if (term) {
            (term as { position?: unknown }).position = {
              start: { offset: line.start },
              end: { offset: line.end }
            };
            // Only the indentation is dropped: the term's trailing spaces are kept (as
            // the non-breaking spaces `trailing_spaces.ts` writes) so a space typed at
            // the end of a term stays visible and editable.
            const content = sourceLine.trimStart();
            reparseDescriptionContent(
              term,
              content,
              line.start + sourceLine.length - content.length,
              definitions
            );
          }
        }
      }
      node.position = {
        start: { offset: lines[0].start },
        end: { offset: lines[lines.length - 1].end }
      };
    });
  };
  visit(tree.children);
}

interface NodePosition {
  start: { offset: number };
  end: { offset: number };
}

/** Where the last positioned sibling ends, or the document's start. */
function positionEnd(siblings: RootContent[]): number {
  for (let index = siblings.length - 1; index >= 0; index -= 1) {
    const position = (siblings[index] as { position?: NodePosition }).position;
    if (position) {
      return position.end.offset;
    }
  }
  return 0;
}

/** Where the next positioned sibling starts, or the document's end. */
function positionStart(siblings: RootContent[]): number {
  for (const sibling of siblings) {
    const position = (sibling as { position?: NodePosition }).position;
    if (position) {
      return position.start.offset;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * The lines a description list of these counts covers between two offsets: from the
 * first non-blank line to the line that completes the counts, or null when they do not
 * complete. A `: ` line is the next detail and any other line is the next term; blank
 * lines are the paragraph break the two-line form is written with, so they are the
 * list's but not one of its parts.
 */
function readDescriptionLines(
  markdown: string,
  from: number,
  to: number,
  terms: number,
  details: number
): { start: number; end: number; kind: 'term' | 'detail' | 'ignored' }[] | null {
  const lines: { start: number; end: number; kind: 'term' | 'detail' | 'ignored' }[] = [];
  let termCount = 0;
  let detailCount = 0;
  let lineStart = Math.max(0, Math.min(from, markdown.length));
  const limit = Math.max(lineStart, Math.min(to, markdown.length));
  while (lineStart < limit) {
    const newline = markdown.indexOf('\n', lineStart);
    const lineEnd = newline < 0 || newline > limit ? limit : newline;
    const line = markdown.slice(lineStart, lineEnd);
    if (line.trim() !== '') {
      if (/^:\s+/.test(line) && detailCount < details) {
        detailCount += 1;
        lines.push({ start: lineStart, end: lineEnd, kind: 'detail' });
      } else if (termCount < terms) {
        termCount += 1;
        lines.push({ start: lineStart, end: lineEnd, kind: 'term' });
      } else {
        // A line the list's own node does not name — the rest of a detail that runs on,
        // or a term the plugin left out. The list's span keeps it: the line is inside
        // the gap the list covers, and dropping it would move every span after it.
        lines.push({ start: lineStart, end: lineEnd, kind: 'ignored' });
      }
    }
    if (newline < 0 || newline >= limit) {
      break;
    }
    lineStart = newline + 1;
  }
  return termCount === terms && detailCount === details ? lines : null;
}

/**
 * Replaces a term/details element's children with the full-pipeline parse of its raw
 * content, shifting the fragment-relative positions to absolute.
 *
 * A fragment is a parse with no document around it, and markdown reads `[^1]` as a
 * footnote reference only when its definition is in the same parse — so the fragment
 * borrows the definitions the document holds, the way a block does (`footnotes.ts`), and
 * the nodes that come from the borrowed lines are dropped again: they belong to the
 * document, not to the term or the detail.
 */
function reparseDescriptionContent(
  element: RootContent & { children: RootContent[] },
  source: string,
  absoluteStart: number,
  definitions: ReadonlySet<string>
): void {
  const withContext = withFootnoteDefinitions(source, definitions);
  const root = fragmentProcessor.runSync(fragmentProcessor.parse(withContext)) as Root;
  const children = root.children
    .filter((child) => isOwnNode(child, source.length))
    .flatMap((child) => (child.type === 'paragraph' ? (child.children ?? []) : [child]));
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
