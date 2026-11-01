/**
 * Owns virtual-block height estimates, measurements and visual-size seeding.
 *
 * Example: a rebuilt source view inherits the prior shape's 156px while the
 * browser lays it out, avoiding a one-frame jump to a 176px estimate.
 *
 * May import: block geometry arithmetic and block model types. Upholds: only a
 * laid-out block measurement replaces remembered height; shape swaps may seed.
 */

import { BlockSizes } from '../block_sizes';
import type { MarkdownBlock } from '../document/block';

/** What measurement needs from the renderer it belongs to. */
export interface RendererMeasurementDependencies {
  readonly keyOf: (block: MarkdownBlock) => string;
  readonly mountedAt: (lineStart: number) => HTMLElement | undefined;
  readonly schedule: () => void;
}

/** Tracks the page's remembered heights without owning DOM order or the viewport. */
export class RendererMeasurements {
  readonly sizes: BlockSizes;
  private pendingLayout = new WeakSet<HTMLElement>();

  constructor(private readonly renderer: RendererMeasurementDependencies) {
    this.sizes = new BlockSizes((block) => renderer.keyOf(block));
  }

  /** Forgets measured heights for a new document. */
  clear(): void {
    this.sizes.clear();
  }

  /** Invalidates measured heights when the page scale changes. */
  setScale(scale: number): void {
    this.sizes.setScale(scale);
  }

  /** Marks an inserted or reused element as awaiting its first completed layout. */
  markPending(element: HTMLElement): void {
    this.pendingLayout.add(element);
  }

  /** Begins a new layout frame, after which pending elements can be measured. */
  resetPending(): void {
    this.pendingLayout = new WeakSet();
  }

  /**
   * Seeds the browser's intrinsic size before layout.
   *
   * Example: `setIntrinsicSize(block, 156)` prevents an off-screen block from
   * briefly taking the stylesheet's 60px fallback.
   */
  setIntrinsicSize(element: HTMLElement, height: number): void {
    element.style.containIntrinsicSize = `auto ${Math.round(height)}px`;
  }

  /** Measures one mounted element once the browser has laid it out. */
  rememberHeight(block: MarkdownBlock, element: HTMLElement): void {
    const height = element.offsetHeight;
    if (this.pendingLayout.has(element)) {
      this.renderer.schedule();
      return;
    }
    if (height > 0) {
      this.sizes.remember(block, height);
      this.setIntrinsicSize(element, height);
    }
  }

  /** Measures every mounted block in the visible range. */
  measureMounted(
    blocks: readonly MarkdownBlock[],
    first: number,
    last: number
  ): void {
    for (let index = first; index <= last; index += 1) {
      const block = blocks[index];
      const element = this.renderer.mountedAt(block.lineStart);
      if (element) {
        this.rememberHeight(block, element);
      }
    }
  }

  /** Seeds a block's next shape from the height of the shape it is leaving. */
  carryHeightOver(
    block: MarkdownBlock,
    outgoingKey: string | undefined,
    incomingKey: string
  ): void {
    if (!outgoingKey || outgoingKey === incomingKey) {
      return;
    }
    if (shapeBaseOf(outgoingKey) !== shapeBaseOf(incomingKey)) {
      return;
    }
    const height = this.sizes.heightForKey(outgoingKey);
    if (height !== null) {
      this.sizes.seed(block, height);
    }
  }
}

/** A render key without its `:source@offset` suffix. */
function shapeBaseOf(key: string): string {
  const suffix = key.indexOf(':source@');
  return suffix < 0 ? key : key.slice(0, suffix);
}
