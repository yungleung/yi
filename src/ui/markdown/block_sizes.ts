/**
 * What a block is worth in pixels: its estimate before it is measured, its real
 * height after, and the sums the window and the spacers are built from.
 *
 * May import: the block model (`blocks.ts`). Upholds: a block's height is a
 * function of its own source, remembered under its content key — so an edit above
 * it cannot invalidate it, and a rebuild cannot lose it.
 */

import type { MarkdownBlock } from './document/blocks';

/**
 * Height of one line of body text, and the skip a paragraph leaves after it
 * (see `styles.css`). A block that has never been measured is estimated from
 * the number of lines its source has, which lands within a few pixels of the
 * real height for text blocks.
 *
 * The flat 60px estimate this replaces was nearly twice a typical block, so
 * every block entering the window corrected the document's total height by
 * 20–30px: the scrollbar thumb re-scaled on every step of a scroll, which
 * reads as the whole scrollbar and the content shivering.
 */
export const LINE_HEIGHT = 24;
export const PARAGRAPH_SKIP = 8;

/**
 * Gap between block wrappers. Blocks have no margin of their own (styles.css
 * keeps the spacing inside the content, where each block height measures it),
 * so the renderer adds nothing; the arithmetic below stays as the single place
 * to change if spacing ever moves back to the wrappers.
 */
export const BLOCK_GAP = 0;

/**
 * The height a block would have if it rendered as plain text, at the scale the page is
 * drawn at.
 *
 * The line height and the skip are the page's own (`styles.css`), so a page drawn smaller
 * has shorter lines to estimate from. The estimate and the measured heights have to be in
 * the same pixels: with the estimate left at full size, the document's total height moved as
 * blocks were measured, and a reader at the very bottom was clamped up a page when an undo
 * re-windowed the document (measured: 5464px of estimate against 4728px of truth).
 */
export function estimateHeight(block: MarkdownBlock, scale = 1): number {
  const lines = Math.max(1, block.text.split('\n').length);
  return (lines * LINE_HEIGHT + PARAGRAPH_SKIP) * scale;
}

/**
 * The height each block rendered, remembered by the key the caller gives its
 * content — never by a line number, which an edit above the block moves.
 *
 * Heights are measured once a block has been laid out and reused afterwards,
 * which is what keeps the spacers, the scrollbar and `revealOffset` stable while
 * the window changes under them.
 */
export class BlockSizes {
  private readonly heights = new Map<string, number>();
  /** The page's own scale, so an estimate and a measurement are in the same pixels. */
  private scale = 1;

  constructor(private readonly key: (block: MarkdownBlock) => string) {}

  /** Forgets every measured height (a new document, or changed global inputs). */
  clear(): void {
    this.heights.clear();
  }

  /**
   * The page is drawn at a new scale. Every measured height is in the old scale's pixels, so
   * none of them is a measurement of what is on the page now.
   */
  setScale(scale: number): void {
    if (scale === this.scale) {
      return;
    }
    this.scale = scale;
    this.heights.clear();
  }

  /** The block's measured height, or the estimate until it has been measured. */
  heightOf(block: MarkdownBlock): number {
    return this.heights.get(this.key(block)) ?? estimateHeight(block, this.scale);
  }

  /** Remembers a measured height. A block that lays out to nothing is no measurement. */
  remember(block: MarkdownBlock, height: number): void {
    if (height > 0) {
      this.heights.set(this.key(block), height);
    }
  }

  /** The document height according to the remembered and estimated block sizes. */
  totalHeight(blocks: readonly MarkdownBlock[]): number {
    if (blocks.length === 0) {
      return 0;
    }
    let total = 0;
    for (const block of blocks) {
      total += this.heightOf(block) + BLOCK_GAP;
    }
    return total - BLOCK_GAP;
  }

  /** The top offset of the block at `index` in the document. */
  offsetOf(blocks: readonly MarkdownBlock[], index: number): number {
    let top = 0;
    for (let i = 0; i < index && i < blocks.length; i += 1) {
      top += this.heightOf(blocks[i]) + BLOCK_GAP;
    }
    return top;
  }
}
