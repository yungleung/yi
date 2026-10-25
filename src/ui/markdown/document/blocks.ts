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
 * - `frontmatter`: a `---` fence at the very start of the document, through its
 *   closing `---` or `...`;
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
 * `syntax/trailing_spaces.ts`, `syntax/blank_lines.ts`), the edit shape the history
 * records (`./history.ts`, types only) and the index that holds where the blocks are
 * (`./block_index.ts`). Upholds: a block is a slice of the raw text — the split is
 * computed from the text alone, never from what is rendered or where the caret is —
 * and where a block sits is derived from the blocks' own sizes, so an edit above it
 * moves it without touching it.
 */

import {
  closesFrontmatter,
  closingFence,
  frontmatterDelimiter,
  htmlBlockTerminator,
  listMarker,
  openingFence
} from '../syntax/markers';
import { withVisibleTrailingSpaces } from '../syntax/trailing_spaces';
import { emptyParagraphIndexes, isEmptyParagraphLine } from '../syntax/blank_lines';
import { isTableCaptionLine } from '../syntax/table_captions';
import { readTableSource } from '../syntax/table_source';
import { closesEquation, isEquationOpening } from '../syntax/equation_blocks';
import { BlockIndex, type BlockEntry } from './block_index';
import { isRawRendered, type BlockKind } from './block_kinds';
import type { DocumentEdit } from './history';

export interface MarkdownBlock {
  kind: BlockKind;
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

/**
 * A block: its own kind and its own source. Where it sits is the index's business
 * (`block_index.ts`), so a block keeps no position of its own to go stale — an edit
 * above it moves it by arithmetic, without touching the block.
 */
class Block implements MarkdownBlock {
  readonly kind: BlockKind;
  readonly text: string;
  readonly index: BlockIndex;
  declare readonly lineStart: number;
  declare readonly lineEnd: number;
  declare readonly charStart: number;
  declare readonly charEnd: number;

  constructor(index: BlockIndex, kind: BlockKind, text: string) {
    this.index = index;
    this.kind = kind;
    this.text = text;
    // Where the block is, as *own* properties: they are still derived — every read
    // asks the index — but a caller that copies a block gets what it read.
    // `virtual_block_renderer.ts` spreads one into the DOM factory, and a prototype
    // getter does not survive a spread.
    const derived: Record<string, () => number> = {
      lineStart: () => index.lineOf(this),
      lineEnd: () => index.endLineOf(this),
      charStart: () => index.startOf(this),
      charEnd: () => index.endOf(this)
    };
    for (const [name, read] of Object.entries(derived)) {
      Object.defineProperty(this, name, {
        configurable: true,
        enumerable: true,
        get: () => read.call(this)
      });
    }
  }
}

/**
 * What the walk produces: the block's own facts, and the positions it computed with
 * them. A block is built from one of these together with the gap after it, which is
 * known once the next seed arrives.
 */
interface BlockSeed {
  kind: BlockKind;
  text: string;
  lineStart: number;
  lineEnd: number;
  charStart: number;
  charEnd: number;
}

/**
 * Splits a raw markdown document into blocks, in document order, indexing them so
 * that their positions are derived from the blocks' own lengths.
 *
 * The index is the caller's when it has one — the state keeps a single index for the
 * life of a document, so the blocks of one split are the ones the next split moves.
 */
export function splitBlocks(text: string, index: BlockIndex = new BlockIndex()): MarkdownBlock[] {
  const seeds = [...blocksFrom(text, splitLines(text), 0, 0)];
  const blocks = seeds.map((seed) => view(seed, index));
  for (const [at, seed] of seeds.entries()) {
    index.set(blocks[at], entryFor(seed, stridesAfter(seeds, at)));
  }
  index.rebuild(blocks);
  return blocks;
}

/**
 * Re-splits the document after `edit`, reusing the blocks the edit did not
 * reach.
 *
 * The walk starts above the change — an edit re-decides a block from its own
 * first line, because a fence closes where its matching fence is and a list runs
 * while its items do — and it stops at the first block that ends exactly where
 * one of `previous` ended, once the change lies above that end. Below that end
 * the text is the text it was, so the old blocks below are still the blocks a
 * full split produces; they move by the edit's own deltas, in lines and in
 * characters, and a block the edit did not move at all comes back as itself.
 *
 * The stop is given the edit rather than only the line it starts on, because
 * "the text below this block is unchanged" has to be known and not assumed: an
 * edit that replaces one character and an edit that deletes the rest of the
 * document start on the same line.
 */
export function splitBlocksFrom(
  text: string,
  previous: readonly MarkdownBlock[],
  edit: DocumentEdit,
  index: BlockIndex = indexOf(previous)
): MarkdownBlock[] {
  const resume = resumeFrom(previous, edit.from);
  if (!resume) {
    return splitBlocks(text, index);
  }
  // An edit moves everything below it by its two own deltas, characters and
  // lines, and those are what the blocks it did not reach move by.
  const lines = countLines(edit.inserted) - countLines(edit.removed);
  const characters = edit.inserted.length - edit.removed.length;
  // The walk runs until a produced block is the one the edit left alone — the old
  // block is read before the new one takes its place in the index.
  const seeds: BlockSeed[] = [];
  let matched: MarkdownBlock | null = null;
  for (const seed of blocksFrom(text, splitLines(text, resume.start, resume.line), 0, resume.above)) {
    seeds.push(seed);
    const old = previous[resume.above + seeds.length - 1];
    if (!old) {
      continue;
    }
    if (
      seed.kind === old.kind &&
      seed.lineStart === old.lineStart + lines &&
      seed.lineEnd === old.lineEnd + lines &&
      edit.to <= old.charEnd &&
      seed.charEnd === old.charEnd + characters
    ) {
      matched = old;
      break;
    }
  }
  const blocks = previous.slice(0, resume.above);
  const entries = seeds.map((seed, at) => {
    // The strides after the last block this walk produced are the ones the edit
    // changes: the block after it moved by the edit's deltas — or not at all, when
    // the edit lies above them both. That block's own start is the old one it was
    // read at, and the tail's is the old one plus the deltas.
    const tail = previous[resume.above + seeds.length];
    const tailStart = tail
      ? { charStart: tail.charStart + characters, lineStart: tail.lineStart + lines }
      : null;
    const entry =
      at + 1 < seeds.length
        ? entryFor(seed, stridesAfter(seeds, at))
        : entryFor(seed, {
            charStride: tailStart ? tailStart.charStart - seed.charStart : 0,
            lineStride: tailStart ? tailStart.lineStart - seed.lineStart : 0
          });
    const block = view(seed, index);
    index.set(block, entry);
    blocks.push(block);
    return { block, entry };
  });
  if (matched === null) {
    // The walk ended without a block that matches one of the old ones: the list
    // changed length, so the blocks after the change have no old position to keep and
    // are renumbered from the blocks themselves.
    index.rebuild(blocks);
    return blocks;
  }
  for (const [at, { block, entry }] of entries.entries()) {
    index.place(resume.above + at, block, entry);
  }
  // The block above the walk kept its own text, but its stride — how far the next
  // block's start is — is one of the two things this edit can have changed.
  const above = previous[resume.above - 1];
  const first = blocks[resume.above];
  const aboveEntry = above ? index.entryOf(above) : null;
  if (above && first && aboveEntry) {
    index.place(resume.above - 1, above, {
      length: aboveEntry.length,
      span: aboveEntry.span,
      charStride: first.charStart - above.charStart,
      lineStride: first.lineStart - above.lineStart
    });
  }
  blocks.push(...previous.slice(resume.above + seeds.length));
  return blocks;
}

/** How far the next seed's start is from this one's, in characters and in lines. */
function stridesAfter(
  seeds: readonly BlockSeed[],
  at: number
): { charStride: number; lineStride: number } {
  if (at + 1 >= seeds.length) {
    return { charStride: 0, lineStride: 0 };
  }
  return {
    charStride: seeds[at + 1].charStart - seeds[at].charStart,
    lineStride: seeds[at + 1].lineStart - seeds[at].lineStart
  };
}

/** A block for this seed, in this index. */
function view(seed: BlockSeed, index: BlockIndex): MarkdownBlock {
  return new Block(index, seed.kind, seed.text);
}

/** What the index needs about this block: what it holds, and how far the next starts. */
function entryFor(
  seed: BlockSeed,
  strides: { charStride: number; lineStride: number }
): BlockEntry {
  return {
    length: seed.charEnd - seed.charStart,
    span: seed.lineEnd - seed.lineStart + 1,
    charStride: Math.max(0, strides.charStride),
    lineStride: Math.max(0, strides.lineStride)
  };
}

/** The index the blocks of a list were built in, so a re-split can carry it on. */
function indexOf(blocks: readonly MarkdownBlock[]): BlockIndex {
  const first = blocks[0] as Block | undefined;
  return first instanceof Block ? first.index : new BlockIndex();
}

/** How many lines a replacement spans — its own count of line endings. */
function countLines(text: string): number {
  let count = 0;
  for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) {
    count += 1;
  }
  return count;
}

/**
 * Where the walk has to start to re-decide the change, and how many of the old
 * blocks sit above it.
 *
 * The walk starts at a non-blank block, and at the one above the change rather
 * than the one holding it: a block is decided forward from its own first line,
 * and a `: details` line is enough to pull the term run above it into its own
 * description list — the block a change lands in is not necessarily where the
 * construct it belongs to begins. A change on a blank line starts at the
 * non-blank block above the run, so that the run is inside the walk: a run of
 * blank lines is decided from its first line, which is a separator rather than a
 * block, and re-deciding it half way through would drop the block above the
 * change.
 */
function resumeFrom(
  previous: readonly MarkdownBlock[],
  from: number
): { line: number; start: number; above: number } | null {
  if (previous.length === 0) {
    return null;
  }
  let index = 0;
  for (let low = 0, high = previous.length - 1; low <= high; ) {
    const middle = (low + high) >> 1;
    if (previous[middle].charStart <= from) {
      index = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const inBlanks = previous[index].kind === 'blank';
  while (index > 0 && previous[index].kind === 'blank') {
    index -= 1;
  }
  if (!inBlanks) {
    let earlier = index - 1;
    while (earlier >= 0 && previous[earlier].kind === 'blank') {
      earlier -= 1;
    }
    if (earlier >= 0) {
      index = earlier;
    }
  }
  return { line: previous[index].lineStart, start: previous[index].charStart, above: index };
}

/**
 * The blocks of `lines`, from `startIndex` on, in document order.
 *
 * A generator, because the caller may already have seen enough: a full split
 * drains it, and the re-split after an edit stops consuming it at the block the
 * document's own blocks come back. `blocksBefore` is how many blocks the
 * document already has above this walk, which the blank-line rule needs — a run
 * of blank lines opens the file only when nothing sits above it.
 */
function* blocksFrom(
  text: string,
  lines: readonly SourceLine[],
  startIndex: number,
  blocksBefore: number
): Generator<MarkdownBlock> {
  let i = startIndex;

  // Frontmatter must start at the very first line of the document.
  if (startIndex === 0 && blocksBefore === 0) {
    if (frontmatterDelimiter(lines[0].text)) {
      const close = lines.findIndex((line, index) => index > 0 && closesFrontmatter(line.text));
      if (close >= 0) {
        const last = lines[close];
        yield {
          kind: 'frontmatter',
          lineStart: lines[0].number,
          lineEnd: last.number,
          charStart: lines[0].start,
          charEnd: last.end,
          text: text.slice(lines[0].start, last.end)
        };
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
      const separator = (blocksBefore > 0 || runStart > startIndex) && i < lines.length;
      for (const index of emptyParagraphIndexes(run.length, separator)) {
        const line = run[index];
        yield {
          kind: 'blank',
          lineStart: line.number,
          lineEnd: line.number,
          charStart: line.start,
          charEnd: line.start,
          text: ''
        };
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
      yield makeBlock(kind, text, lineStart, lineEnd, charStart, charEnd);
      i = j;
      continue;
    }

    // Labeled display math: `[$$` through `$$]…`, one block including its attributes.
    if (isEquationOpening(first.text)) {
      let close = -1;
      for (let scan = j; scan < lines.length; scan += 1) {
        if (closesEquation(lines[scan].text)) {
          close = scan;
          break;
        }
      }
      if (close >= 0) {
        const last = lines[close];
        yield makeBlock(
          'equation',
          text,
          lineStart,
          last.number,
          charStart,
          last.end
        );
        i = close + 1;
        continue;
      }
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
      yield makeBlock(kind, text, lineStart, lineEnd, charStart, charEnd);
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
      yield makeBlock(kind, text, lineStart, lineEnd, charStart, charEnd);
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
      yield makeBlock(kind, text, lineStart, lineEnd, charStart, charEnd);
      i = j;
      continue;
    }

    // A run of consecutive non-blank lines — which stops before a fence or a display formula.
    //
    // Both may interrupt a paragraph, and markdown reads them as blocks when they do (`text\n```\n`
    // is a paragraph and then a code block; `text\n$$\n` is a paragraph and then a formula). They
    // also *have* to be blocks here: a fence's and a formula's own text is the shape the app shows
    // while the caret is inside them (`block_kinds.ts: hasSourceMode`), and a formula folded into a
    // paragraph is one whose source cannot be shown at all — measured, a click on it in
    // `notes/Game Theory/6 Bayesian Game.md` entered the paragraph's text and no source appeared.
    while (
      j < lines.length &&
      lines[j].text.trim() !== '' &&
      openingFence(lines[j].text) === null &&
      !isEquationOpening(lines[j].text) &&
      !lines[j].text.trimStart().startsWith('$$')
    ) {
      lineEnd = lines[j].number;
      charEnd = lines[j].end;
      j += 1;
    }

    // Pandoc's table caption may sit directly below the last row or after one
    // blank line. Keep that caption in the table's block so the two are parsed
    // together. Two or more blank lines end the association; the colon line is
    // then ordinary source and must not be consumed by description-list repair.
    if (j < lines.length && lines[j].text.trim() === '') {
      let captionLine = j;
      while (captionLine < lines.length && lines[captionLine].text.trim() === '') {
        captionLine += 1;
      }
      const tableText = text.slice(charStart, lines[j].start);
      const table = readTableSource(tableText);
      const isWholeTable =
        table !== null && table.from === 0 && tableText.slice(table.to).trim() === '';
      if (
        isWholeTable &&
        captionLine < lines.length &&
        isTableCaptionLine(lines[captionLine].text.trimStart())
      ) {
        const blankLines = captionLine - j;
        if (blankLines === 1) {
          lineEnd = lines[captionLine].number;
          charEnd = lines[captionLine].end;
          i = captionLine + 1;
          yield makeBlock('paragraph', text, lineStart, lineEnd, charStart, charEnd);
          continue;
        }
        i = j;
        yield makeBlock('paragraph', text, lineStart, lineEnd, charStart, charEnd);
        continue;
      }
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

    yield makeBlock(kind, text, lineStart, lineEnd, charStart, charEnd);
  }
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

/**
 * The lines of `text` from `start` on, numbered from `number`.
 *
 * A re-split only needs the lines it walks, so the offset it resumes at is
 * passed in: the lines above it are the blocks that were kept, and their own
 * line numbers are already known.
 */
function splitLines(text: string, start = 0, number = 1): SourceLine[] {
  const out: SourceLine[] = [];
  let offset = start;
  let line = number;
  while (offset <= text.length) {
    const end = text.indexOf('\n', offset);
    const stop = end === -1 ? text.length : end;
    out.push({ number: line, start: offset, end: stop, text: text.slice(offset, stop) });
    if (end === -1) {
      break;
    }
    offset = end + 1;
    line += 1;
  }
  return out;
}

/** The text to parse for a block, with dropped trailing spaces made visible. */
export function blockParseInput(block: MarkdownBlock): string {
  return isRawRendered(block.kind) ? block.text : withVisibleTrailingSpaces(block.text);
}
