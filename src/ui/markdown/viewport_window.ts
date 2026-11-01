/**
 * Which blocks to mount for a scroll position, and how big the two spacers that
 * stand in for the rest are.
 *
 * May import: the block model and the size arithmetic (`blocks.ts`,
 * `block_sizes.ts`). Upholds: the mounted window and the spacers always account
 * for the whole document — the scrollbar is a function of the same heights the
 * window is.
 */

import { BLOCK_GAP, type BlockSizes } from './block_sizes';
import type { MarkdownBlock } from './document/block';

/** Extra content kept mounted above and below the viewport. */
export const VIEWPORT_MARGIN = 1200;

/** Rendered elements kept for blocks that left the window, at the least. */
export const MIN_SPARE_ELEMENTS = 20;

/**
 * The block index range that should be mounted for the current scroll: the blocks
 * the viewport and its margin touch, and the whole document when it fits.
 *
 * A scroll *past* everything the sizes add up to is its own case, and it is not "mount from
 * the first block": a block that has never been laid out is estimated from its own line count
 * (`block_sizes.ts`), and that estimate under-counts a note whose paragraphs are taller than
 * their lines — measured on the fixture note, 17 544px of estimate against 20 047px of
 * document. A reader at the real end is then below the estimated end, and the whole document
 * used to come back: measured, the whole note (484 blocks) mounted at one keystroke, and that
 * keystroke paid for laying the document out (65 ms against 1 105 ms, `edit-cost.js`'s own
 * steps). The reader is at the end, so the window is the *end*: the blocks the viewport and
 * its margins can fill from the last one back. A document whose estimates really are shorter
 * than the window still mounts whole, which is what it should do.
 */
export function windowRange(
  sizes: BlockSizes,
  blocks: readonly MarkdownBlock[],
  scrollTop: number,
  viewportHeight: number
): [number, number] {
  const top = scrollTop - VIEWPORT_MARGIN;
  const bottom = scrollTop + viewportHeight + VIEWPORT_MARGIN;
  let first = -1;
  let last = -1;
  let cursor = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const height = sizes.heightOf(blocks[index]);
    if (first < 0 && cursor + height >= top) {
      first = index;
    }
    if (cursor <= bottom) {
      last = index;
    }
    cursor += height + BLOCK_GAP;
  }
  if (first < 0) {
    first = 0;
    let filled = 0;
    const wanted = viewportHeight + 2 * VIEWPORT_MARGIN;
    for (let index = last; index >= 0; index -= 1) {
      first = index;
      filled += sizes.heightOf(blocks[index]) + BLOCK_GAP;
      if (filled >= wanted) {
        break;
      }
    }
  }
  return [first < 0 ? 0 : first, last < 0 ? blocks.length - 1 : last];
}

/**
 * The heights of the two spacers around a mounted window: everything above it,
 * and everything below it. An empty window has no spacers, which is what an
 * empty document leaves on screen.
 */
export function spacerHeights(
  sizes: BlockSizes,
  blocks: readonly MarkdownBlock[],
  range: { first: number; last: number }
): { top: number; bottom: number } {
  if (range.last < range.first) {
    return { top: 0, bottom: 0 };
  }
  const top = sizes.offsetOf(blocks, range.first);
  const mountedHeight = sizes.offsetOf(blocks, range.last + 1) - top;
  const bottom = Math.max(0, sizes.totalHeight(blocks) - top - mountedHeight);
  return { top, bottom };
}
