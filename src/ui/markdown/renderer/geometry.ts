/**
 * Converts between the scroller's pixels, mounted blocks and document offsets.
 *
 * Example: a restored view names the block starting at offset 1200 and 18px
 * within it; geometry scrolls to that place instead of a stale pixel scrollTop.
 *
 * May import: block arithmetic and block model types. Upholds: a scroll anchor
 * is a document offset, and spacer sizes derive only from the shared BlockSizes.
 */

import { BLOCK_GAP, type BlockSizes } from '../block_sizes';
import type { MarkdownBlock } from '../document/block';
import { spacerHeights } from '../viewport_window';

/** A mounted block range. */
export interface MountedRange {
  readonly first: number;
  readonly last: number;
}

/** A remembered place in the document and pixel offset within its block. */
export interface ScrollAnchor {
  readonly offset: number;
  readonly within: number;
}

/** What geometry needs from the renderer that owns the DOM. */
export interface RendererGeometryDependencies {
  readonly scroller: HTMLElement;
  readonly root: () => HTMLElement | null;
  readonly blocks: () => readonly MarkdownBlock[];
  readonly sizes: BlockSizes;
  readonly range: () => MountedRange | null;
  readonly syncWindow: (force: boolean) => void;
}

/** Owns scroller geometry, scroll anchors and virtual spacers. */
export class RendererGeometry {
  private geometry: { scrollTop: number; clientHeight: number } | null = null;

  constructor(private readonly renderer: RendererGeometryDependencies) {}

  /** Reads and caches the browser's scroller geometry. */
  read(): { scrollTop: number; clientHeight: number } {
    const geometry = {
      scrollTop: this.renderer.scroller.scrollTop,
      clientHeight: this.renderer.scroller.clientHeight
    };
    this.geometry = geometry;
    return geometry;
  }

  /** Scrolls the block containing `offset` into view, then mounts it. */
  reveal(offset: number): void {
    const blocks = this.renderer.blocks();
    const index = blocks.findIndex(
      (block) => offset >= block.charStart && offset <= block.charEnd
    );
    if (index < 0) {
      return;
    }
    this.renderer.scroller.scrollTop = Math.max(
      0,
      this.contentTop() +
        this.renderer.sizes.offsetOf(blocks, index) -
        (this.geometry ?? this.read()).clientHeight / 3
    );
    this.read();
    this.renderer.syncWindow(true);
  }

  /** Captures the block and intra-block offset at the top of the viewport. */
  scrollAnchor(): ScrollAnchor | null {
    const blocks = this.renderer.blocks();
    if (blocks.length === 0) {
      return null;
    }
    const scrollTop = Math.max(0, this.renderer.scroller.scrollTop - this.contentTop());
    const first = Math.max(
      0,
      Math.min(this.renderer.range()?.first ?? 0, blocks.length - 1)
    );
    let index = first;
    let top = this.renderer.sizes.offsetOf(blocks, first);
    while (index < blocks.length - 1) {
      const height = this.renderer.sizes.heightOf(blocks[index]) + BLOCK_GAP;
      if (top + height > scrollTop) {
        break;
      }
      top += height;
      index += 1;
    }
    return {
      offset: blocks[index].charStart,
      within: Math.max(0, scrollTop - top)
    };
  }

  /** Restores a document anchor and mounts the window around it. */
  scrollToAnchor(anchor: ScrollAnchor | null): void {
    const blocks = this.renderer.blocks();
    if (blocks.length === 0) {
      return;
    }
    const offset = anchor?.offset ?? 0;
    let index = 0;
    for (let i = 0; i < blocks.length; i += 1) {
      if (blocks[i].charStart <= offset) {
        index = i;
      } else {
        break;
      }
    }
    const top =
      this.renderer.sizes.offsetOf(blocks, index) +
      Math.max(0, anchor?.within ?? 0);
    this.renderer.scroller.scrollTop = Math.max(0, this.contentTop() + top);
    this.read();
    this.renderer.syncWindow(true);
    const refined =
      this.renderer.sizes.offsetOf(blocks, index) +
      Math.max(0, anchor?.within ?? 0);
    this.renderer.scroller.scrollTop = Math.max(0, this.contentTop() + refined);
  }

  /** The spacer element for a position, created on first use. */
  spacer(position: 'top' | 'bottom'): HTMLElement {
    const existing = this.renderer.root()?.querySelector<HTMLElement>(
      `[data-virtual-spacer="${position}"]`
    );
    if (existing) {
      return existing;
    }
    const spacer = document.createElement('div');
    spacer.dataset.virtualSpacer = position;
    spacer.style.pointerEvents = 'none';
    return spacer;
  }

  /** Sizes both spacers from the range and remembered block heights. */
  updateSpacers(): void {
    if (!this.renderer.root()) {
      return;
    }
    const topSpacer = this.spacer('top');
    const bottomSpacer = this.spacer('bottom');
    const range = this.renderer.range();
    if (!range || range.last < range.first) {
      topSpacer.style.height = '0px';
      bottomSpacer.style.height = '0px';
      return;
    }
    const { top, bottom } = spacerHeights(
      this.renderer.sizes,
      this.renderer.blocks(),
      { first: range.first, last: range.last }
    );
    topSpacer.style.height = `${Math.round(top)}px`;
    bottomSpacer.style.height = `${Math.round(bottom)}px`;
  }

  private contentTop(): number {
    const root = this.renderer.root();
    if (!root) {
      return 0;
    }
    return (
      root.getBoundingClientRect().top -
      this.renderer.scroller.getBoundingClientRect().top +
      this.renderer.scroller.scrollTop
    );
  }
}
