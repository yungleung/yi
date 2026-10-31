/**
 * Repairs remark-deflist output so description lists keep editor extensions and
 * absolute source positions.
 *
 * Example: `term
 * : a [@doe] citation` is re-parsed after remark-deflist rebuilds its fragment,
 * so the citation becomes a node and every offset points into the full document.
 *
 * May import: mdast, the fragment remark pipeline, the serializer, footnote
 * borrowing and the generic node walker. Upholds: a description term or detail
 * is parsed with the same syntax as its surrounding block and never keeps
 * fragment-relative offsets.
 */

import type { Root, RootContent } from 'mdast';
import {
  flattenUnwritableNodes,
  stringifyMarkdownNode
} from './serializer';
import { footnoteLabels, isOwnNode, withFootnoteDefinitions } from './footnotes';
import { walk } from './node_walk';
import { fragmentProcessor } from './remark_pipeline';

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
export function remarkDeflistCompat() {
  return (tree: Root): void => {
    walk(tree, (node) => {
      if (node.type !== 'paragraph') {
        return;
      }
      const text = stringifyMarkdownNode(node);
      if (!/^:\s/.test(text) && !/\n:\s/.test(text)) {
        return;
      }
      flattenUnwritableNodes(node);
    });
  };
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
export function fixDescriptionPositions(tree: Root, markdown: string): void {
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
  const root = fragmentProcessor.runSync(fragmentProcessor.parse(withContext), withContext) as Root;
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
