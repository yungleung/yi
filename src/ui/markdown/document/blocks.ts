/**
 * Block-level slicing of the raw markdown document.
 *
 * The editor keeps the raw markdown as the source of truth. This module
 * splits it into blocks — each block is a *view* over a slice of the
 * original lines, described by a line-number range and the matching
 * character offsets. A block component renders each block, and the editor
 * tracks blocks by their line ranges so an edit re-slices and re-renders
 * only the affected region.
 *
 * Block rules:
 * - `frontmatter`: a `---` (YAML) or `+++` (TOML) fence at the very start
 *   of the document, through its closing fence;
 * - `fencedCode`: an opening fence through the closing fence (blank lines
 *   are allowed inside);
 * - `displayMath`: `$$` … `$$` (blank lines are allowed inside);
 * - `descriptionList`: a term run merged with its following `: details`;
 * - `paragraph`: every other run of consecutive non-blank lines (the
 *   markdown parser re-splits it into headings, lists, tables, ...).
 *
 * Blank lines are separators, not blocks.
 *
 * May import: the pure syntax rules (`syntax/markers.ts`,
 * `syntax/trailing_spaces.ts`, `syntax/blank_lines.ts`). Upholds: a block is a
 * slice of the raw text — the split is computed from the text alone, never from
 * what is rendered or where the caret is.
 */

import { closingFence, frontmatterDelimiter, htmlBlockTerminator, listMarker, openingFence } from '../syntax/markers';
import { withVisibleTrailingSpaces } from '../syntax/trailing_spaces';
import { emptyParagraphIndexes, isEmptyParagraphLine } from '../syntax/blank_lines';

export type BlockKind =
  | 'frontmatter'
  | 'fencedCode'
  | 'indentedCode'
  | 'displayMath'
  | 'html'
  | 'descriptionList'
  | 'paragraph'
  | 'blank';

export interface MarkdownBlock {
  kind: BlockKind;
  /** `yaml` or `toml` for frontmatter blocks. */
  format?: 'yaml' | 'toml';
  /** 1-based number of the block's first line (inclusive). */
  lineStart: number;
  /** 1-based number of the block's last line (inclusive). */
  lineEnd: number;
  /** Character offset of the block's first character in the document. */
  charStart: number;
  /** Character offset just past the block's last character. */
  charEnd: number;
  /** The block's raw source: `document.slice(charStart, charEnd)`. */
  text: string;
}

/** Content keys, one per block object (see `blockContentKey`). */
const contentKeys = new WeakMap<MarkdownBlock, string>();

/**
 * A block's rendering identity: its own source, never where it sits. Line
 * numbers change whenever anything above changes, so every cache keyed by them
 * threw away work that was still valid.
 *
 * The key is cached per block object on purpose. Building `kind:text` copies
 * the block's whole text, and a math-heavy document has blocks large enough
 * that doing it on every lookup — the spacer arithmetic walks the block list
 * several times per sync — shows up as slower scrolling; caching it also gives
 * the maps a stable string, whose hash V8 remembers.
 */
export function blockContentKey(block: MarkdownBlock): string {
  const cached = contentKeys.get(block);
  if (cached !== undefined) {
    return cached;
  }
  const key = `${block.kind}:${block.text}`;
  contentKeys.set(block, key);
  return key;
}

/**
 * Whether a block renders its raw source as it stands, without the markdown
 * it contains being parsed into nodes. Such a block's lines mean nothing to
 * the renderer beyond being text: a `- ` inside a code block is code, not an
 * empty list item.
 */
export function isRawRendered(kind: BlockKind): boolean {
  return (
    kind === 'frontmatter' ||
    kind === 'fencedCode' ||
    kind === 'indentedCode' ||
    kind === 'displayMath' ||
    kind === 'html'
  );
}

/**
 * Whether a block of this kind shows its own markdown text while the caret is
 * inside it, instead of its view.
 *
 * A display formula renders KaTeX, which has no characters to aim a caret at,
 * so the block falls back to being its own text — the shape a fenced code
 * block has at all times (see `source_mode.ts`).
 */
export function hasSourceMode(kind: BlockKind): boolean {
  return kind === 'displayMath';
}

/** A block as an mdast-like node (the `type` field makes it a tree node). */
export interface BlockNode extends MarkdownBlock {
  type: 'block';
}

interface SourceLine {
  number: number;
  start: number;
  end: number;
  text: string;
}

/** Splits a raw markdown document into blocks, in document order. */
export function splitBlocks(text: string): MarkdownBlock[] {
  const lines = splitLines(text);
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  // Frontmatter must start at the very first line of the document.
  if (i < lines.length) {
    const delimiter = frontmatterDelimiter(lines[0].text);
    if (delimiter) {
      const close = lines.findIndex((line, index) => index > 0 && line.text.trim() === delimiter);
      if (close >= 0) {
        const last = lines[close];
        blocks.push({
          kind: 'frontmatter',
          format: delimiter === '+++' ? 'toml' : 'yaml',
          lineStart: lines[0].number,
          lineEnd: last.number,
          charStart: lines[0].start,
          charEnd: last.end,
          text: text.slice(lines[0].start, last.end)
        });
        i = close + 1;
      }
    }
  }

  while (i < lines.length) {
    const first = lines[i];
    if (isEmptyParagraphLine(first.text)) {
      const runStart = i;
      while (i < lines.length && isEmptyParagraphLine(lines[i].text)) {
        i += 1;
      }
      // The final line of a file that ends with a newline is that newline's
      // doing, not a blank line the author wrote.
      const phantom = i === lines.length && text.endsWith('\n') ? 1 : 0;
      const run = lines.slice(runStart, i - phantom);
      const separator = blocks.length > 0 && i < lines.length;
      for (const index of emptyParagraphIndexes(run.length, separator)) {
        const line = run[index];
        blocks.push({
          kind: 'blank',
          lineStart: line.number,
          lineEnd: line.number,
          charStart: line.start,
          charEnd: line.start,
          text: ''
        });
      }
      continue;
    }

    const lineStart = first.number;
    const charStart = first.start;
    let lineEnd = first.number;
    let charEnd = first.end;
    let j = i + 1;
    let kind: BlockKind = 'paragraph';

    // Fenced code: consume through the closing fence (or to the end).
    const fence = openingFence(first.text);
    if (fence) {
      kind = 'fencedCode';
      while (j < lines.length && !closingFence(lines[j].text, fence)) {
        lineEnd = lines[j].number;
        charEnd = lines[j].end;
        j += 1;
      }
      if (j < lines.length) {
        lineEnd = lines[j].number;
        charEnd = lines[j].end;
        j += 1;
      }
      blocks.push(makeBlock(kind, text, lineStart, lineEnd, charStart, charEnd));
      i = j;
      continue;
    }

    // Display math: `$$` on its own line through the closing `$$`.
    if (first.text.trimStart().startsWith('$$')) {
      kind = 'displayMath';
      const open = first.text.indexOf('$$');
      const closesOnLine =
        first.text.indexOf('$$', open + 2) >= 0 && first.text.trimEnd().endsWith('$$');
      if (!closesOnLine) {
        while (j < lines.length) {
          const candidate = lines[j].text;
          lineEnd = lines[j].number;
          charEnd = lines[j].end;
          j += 1;
          if (candidate.trim().startsWith('$$') || candidate.trim().endsWith('$$')) {
            break;
          }
        }
      }
      blocks.push(makeBlock(kind, text, lineStart, lineEnd, charStart, charEnd));
      i = j;
      continue;
    }

    // Indented code may contain blank lines (when followed by indented
    // lines), so an indented run continues across them.
    if (/^(?: {4}|\t)/.test(first.text)) {
      kind = 'indentedCode';
      let scan = j;
      while (scan < lines.length) {
        while (scan < lines.length && lines[scan].text.trim() === '') {
          scan += 1;
        }
        if (scan >= lines.length) {
          break;
        }
        if (!/^(?: {4}|\t)/.test(lines[scan].text)) {
          break;
        }
        while (scan < lines.length && lines[scan].text.trim() !== '') {
          lineEnd = lines[scan].number;
          charEnd = lines[scan].end;
          scan += 1;
        }
      }
      if (scan > j) {
        j = scan;
      }
      blocks.push(makeBlock(kind, text, lineStart, lineEnd, charStart, charEnd));
      i = j;
      continue;
    }

    // HTML blocks that continue until a terminator (script/pre/style/
    // textarea, comments, processing instructions, declarations, CDATA) may
    // contain blank lines; consume them whole so one block maps to one
    // `html` node.
    const htmlTerminator = htmlBlockTerminator(first.text);
    if (htmlTerminator) {
      kind = 'html';
      while (j < lines.length && !htmlTerminator.test(lines[j].text)) {
        lineEnd = lines[j].number;
        charEnd = lines[j].end;
        j += 1;
      }
      if (j < lines.length) {
        lineEnd = lines[j].number;
        charEnd = lines[j].end;
        j += 1;
      }
      blocks.push(makeBlock(kind, text, lineStart, lineEnd, charStart, charEnd));
      i = j;
      continue;
    }

    // A run of consecutive non-blank lines.
    while (j < lines.length && lines[j].text.trim() !== '') {
      lineEnd = lines[j].number;
      charEnd = lines[j].end;
      j += 1;
    }

    // Loose lists may contain blank lines between items (and indented item
    // continuations after a blank), so a run that starts with a list marker
    // continues across blank lines while the next content still belongs to
    // the list. This keeps one list = one block, matching the mdast tree.
    const list = listMarker(first.text);
    let listMerged = false;
    if (list) {
      let scan = j;
      let mergedEnd = j;
      while (scan < lines.length) {
        const blankStart = scan;
        while (scan < lines.length && isEmptyParagraphLine(lines[scan].text)) {
          scan += 1;
        }
        const phantom = scan === lines.length && text.endsWith('\n') ? 1 : 0;
        // A run that renders an empty paragraph is a block boundary: the list
        // ends there and the empty paragraph becomes a block of its own.
        if (scan - blankStart - phantom > 1) {
          break;
        }
        if (scan >= lines.length) {
          break;
        }
        const info = listMarker(lines[scan].text);
        const sameLevel =
          info !== null && info.indent === list.indent && info.ordered === list.ordered;
        const indented = /^(?: {2,}|\t)/.test(lines[scan].text);
        if (!sameLevel && !indented) {
          break;
        }
        listMerged = true;
        while (scan < lines.length && !isEmptyParagraphLine(lines[scan].text)) {
          lineEnd = lines[scan].number;
          charEnd = lines[scan].end;
          scan += 1;
        }
        mergedEnd = scan;
      }
      if (listMerged) {
        j = mergedEnd;
      }
    }

    // Description lists: remark-deflist merges every consecutive `term` +
    // `: details` pair (separated by blank lines) into a single description
    // list, so the block must span them all to slice cleanly from the
    // whole-document tree.
    let scan = j;
    let mergedEnd = j;
    let sawDetails = false;
    while (scan < lines.length) {
      while (scan < lines.length && lines[scan].text.trim() === '') {
        scan += 1;
      }
      if (scan >= lines.length) {
        break;
      }
      if (/^:\s+/.test(lines[scan].text.trimStart())) {
        sawDetails = true;
        while (scan < lines.length && lines[scan].text.trim() !== '') {
          lineEnd = lines[scan].number;
          charEnd = lines[scan].end;
          scan += 1;
        }
        mergedEnd = scan;
        continue;
      }
      // Before the first `: details` the run is not a description list; a
      // plain run (e.g. a footnote definition) must stay its own block.
      if (!sawDetails) {
        break;
      }
      // A non-details line continues the list when it is a term: a run of
      // non-blank lines followed (after blanks) by `: details`.
      const termStart = scan;
      while (scan < lines.length && lines[scan].text.trim() !== '') {
        scan += 1;
      }
      let probe = scan;
      while (probe < lines.length && lines[probe].text.trim() === '') {
        probe += 1;
      }
      if (probe < lines.length && /^:\s+/.test(lines[probe].text.trimStart())) {
        for (let k = termStart; k < scan; k += 1) {
          lineEnd = lines[k].number;
          charEnd = lines[k].end;
        }
        continue;
      }
      break; // not a term: the description list ends here
    }
    if (sawDetails) {
      kind = 'descriptionList';
      i = mergedEnd;
    } else {
      i = j;
    }

    blocks.push(makeBlock(kind, text, lineStart, lineEnd, charStart, charEnd));
  }

  return blocks;
}

function makeBlock(
  kind: BlockKind,
  text: string,
  lineStart: number,
  lineEnd: number,
  charStart: number,
  charEnd: number
): MarkdownBlock {
  return { kind, lineStart, lineEnd, charStart, charEnd, text: text.slice(charStart, charEnd) };
}

function splitLines(text: string): SourceLine[] {
  const out: SourceLine[] = [];
  let start = 0;
  let number = 1;
  for (const line of text.split('\n')) {
    out.push({ number, start, end: start + line.length, text: line });
    start += line.length + 1;
    number += 1;
  }
  return out;
}

/** The text to parse for a block, with dropped trailing spaces made visible. */
export function blockParseInput(block: MarkdownBlock): string {
  return isRawRendered(block.kind) ? block.text : withVisibleTrailingSpaces(block.text);
}
