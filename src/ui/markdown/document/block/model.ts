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
 * - `quote`: one contiguous stack of lines carrying blockquote markers;
 * - `fencedDiv`: any complete Pandoc fenced Div, through its closing fence;
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
 * (`./lookup.ts`). Upholds: a block is a slice of the raw text — the split is
 * computed from the text alone, never from what is rendered or where the caret is —
 * and where a block sits is derived from the blocks' own sizes, so an edit above it
 * moves it without touching it.
 */

import { withVisibleTrailingSpaces } from '../../syntax/trailing_spaces';
import { BlockIndex, type BlockEntry } from './lookup';
import { isRawRendered, type BlockKind } from './kinds';
import { scanBlocks, splitLines, type BlockSeed } from './scanner';
import type { DocumentEdit } from '../history';

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

/**
 * A block: its own kind and its own source. Where it sits is the index's business
 * (`lookup.ts`), so a block keeps no position of its own to go stale — an edit
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
 * Splits a raw markdown document into blocks, in document order, indexing them so
 * that their positions are derived from the blocks' own lengths.
 *
 * The index is the caller's when it has one — the state keeps a single index for the
 * life of a document, so the blocks of one split are the ones the next split moves.
 */
export function splitBlocks(text: string, index: BlockIndex = new BlockIndex()): MarkdownBlock[] {
  const seeds = [...scanBlocks(text, splitLines(text), 0, 0)];
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
  for (const seed of scanBlocks(text, splitLines(text, resume.start, resume.line), 0, resume.above)) {
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

/** The text to parse for a block, with dropped trailing spaces made visible. */
export function blockParseInput(block: MarkdownBlock): string {
  return isRawRendered(block.kind) ? block.text : withVisibleTrailingSpaces(block.text);
}
