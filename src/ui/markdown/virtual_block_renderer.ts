/**
 * Owns the block DOM for a document: only the blocks around the viewport are
 * mounted, the rest are represented by two spacers sized from remembered
 * heights.
 *
 * Rendering is a function of a block's own source, never of where it sits, so
 * everything remembered is keyed by that source rather than by a line number: a
 * block that keeps its text keeps its parse, its measured height and its rendered
 * element through edits above it, through undo, and through leaving the window
 * and coming back. Elements of blocks that left the window are kept in a bounded
 * spare cache instead of being thrown away.
 *
 * Heights are measured once a block has been laid out and reused afterwards,
 * which keeps the spacers — and therefore the scrollbar and `revealOffset` —
 * accurate on documents whose blocks differ wildly in size (display math, code
 * fences, ...). Because those heights can still change when a placeholder is
 * replaced by a measurement, the renderer also anchors the scroll position to the
 * block at the top of the viewport and restores it after every re-sync.
 *
 * May import: the document's blocks and state, the block factory, the size
 * arithmetic (`block_sizes.ts`) and the window (`viewport_window.ts`). Upholds:
 * the mounted window and its spacers are derived from the block sizes on every
 * sync — the DOM is a view of that arithmetic, never a second record of it.
 */

import { BlockSizes } from './block_sizes';
import { createBlockComponent } from './create_block';
import { type BlockNode, type MarkdownBlock } from './document/blocks';
import { shownSourceWithinBlock } from './source_mode';
import type { MarkdownEditorState } from './document/state';
import { MIN_SPARE_ELEMENTS, spacerHeights, windowRange } from './viewport_window';

/**
 * Editor-facing hooks that keep the caret anchored while the window changes:
 * the renderer captures an opaque snapshot before it touches the DOM and
 * hands it back once the new window is in place.
 */
export interface RendererSyncHooks {
  capture(): unknown;
  restore(snapshot: unknown): void;
}

export class VirtualBlockRenderer {
  private root: HTMLElement | null = null;
  private frame: number | null = null;
  private hooks: RendererSyncHooks | null = null;
  /** What each block is worth in pixels, keyed by the block's rendering identity. */
  private readonly sizes = new BlockSizes((block) => this.renderKey(block));
  /** The content key an element was built from, so unchanged blocks are reused. */
  private readonly builtFrom = new WeakMap<HTMLElement, string>();
  /** Elements of blocks that are not mounted, keyed by content (LRU order). */
  private readonly spare = new Map<string, HTMLElement>();
  /** Mounted block elements, keyed by line start. */
  private readonly mounted = new Map<number, HTMLElement>();
  private range: { first: number; last: number } | null = null;
  private syncing = false;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly state: MarkdownEditorState
  ) {
    this.scroller.addEventListener('scroll', () => this.schedule(), { passive: true });
  }

  /** Registers the caret-preservation hooks used around DOM swaps. */
  setSyncHooks(hooks: RendererSyncHooks | null): void {
    this.hooks = hooks;
  }

  /**
   * A block's rendering identity: its own source plus the shape it is being
   * built in. A block that shows a source while the caret is inside it — its
   * own text, or a node inside it built as its source (see `source_mode.ts`) —
   * is a different element from its view, with its own height, so the two
   * never share a remembered element or size.
   */
  private renderKey(block: MarkdownBlock): string {
    // The state's key, not the block's own: a block holding a footnote marker also
    // renders from the definitions the document borrows for it (`state.parseKey`).
    const key = this.state.parseKey(block);
    const source = shownSourceWithinBlock(block);
    return source === null ? key : `${key}:source@${source}`;
  }

  /** Builds the prose root and mounts the window around the current scroll. */
  render(): void {
    this.sizes.clear();
    this.dropSpare();
    this.mounted.clear();
    this.range = null;
    const root = this.createRoot();
    this.root = root;
    this.scroller.replaceChildren(root);
    this.syncWindow(true);
  }

  /** Rebuilds a single block in place (used when an edit re-renders a block). */
  renderBlock(lineStart: number): void {
    const block = this.state.getBlockAtLine(lineStart);
    const current = this.mounted.get(lineStart);
    if (!block || !current || !this.root) {
      return;
    }
    const snapshot = this.hooks?.capture();
    const element = this.createBlockElement(block);
    // The element being replaced is kept as the spare for the content it was
    // built from — undo brings that content back — but it stays in the document
    // until `replaceWith` puts the new one where it was: a removed node has no
    // parent to be replaced in, and the block would simply leave the page.
    this.keepSpare(current, this.builtFrom.get(current));
    current.replaceWith(element);
    this.mounted.set(lineStart, element);
    this.rememberHeight(block, element);
    this.updateSpacers();
    this.refreshBlockTags();
    this.hooks?.restore(snapshot);
  }

  /**
   * Re-measures one block and, only if its height moved, the spacers — for a block
   * somebody wrote inside without the renderer (`editing/typed_text.ts` writes a
   * plain keystroke straight into the text node the caret is in).
   *
   * The spacer write is skipped when the height is unchanged because a spacer write
   * is a layout invalidation, and avoiding exactly that is what the fast path is
   * for (`test/probes/block-rebuild-cost.js` measures the difference).
   */
  measureEditedBlock(lineStart: number): void {
    const block = this.state.getBlockAtLine(lineStart);
    const element = this.mounted.get(lineStart);
    if (!block || !element) {
      return;
    }
    const before = this.sizes.heightOf(block);
    this.rememberHeight(block, element);
    this.refreshBlockTags();
    if (Math.abs(this.sizes.heightOf(block) - before) >= 1) {
      this.updateSpacers();
    }
  }

  /**
   * Re-syncs the window after a document edit. Blocks whose source is
   * unchanged keep their DOM; the rest are rebuilt.
   */
  renderChanged(): void {
    if (!this.root) {
      this.render();
      return;
    }
    const byLine = new Map<number, MarkdownBlock>();
    for (const block of this.state.getBlocks()) {
      byLine.set(block.lineStart, block);
    }
    for (const [lineStart, element] of [...this.mounted]) {
      const block = byLine.get(lineStart);
      if (!block || this.builtFrom.get(element) !== this.renderKey(block)) {
        this.releaseElement(element, this.builtFrom.get(element));
        this.mounted.delete(lineStart);
      }
    }
    this.syncWindow(true);
  }

  /**
   * Rebuilds every mounted block. Used when the renderers' inputs changed
   * (for example the bibliography arrived), so widgets re-read their data.
   */
  refresh(): void {
    for (const [lineStart, element] of [...this.mounted]) {
      element.remove();
      this.mounted.delete(lineStart);
    }
    // The bibliography or the settings changed: nothing rendered before is
    // known to still be valid.
    this.dropSpare();
    this.sizes.clear();
    this.syncWindow(true);
  }

  /** Scrolls so the block containing `offset` is visible, then mounts it. */
  revealOffset(offset: number): void {
    const blocks = this.state.getBlocks();
    const index = blocks.findIndex(
      (block) => offset >= block.charStart && offset <= block.charEnd
    );
    if (index < 0) {
      return;
    }
    this.scroller.scrollTop = Math.max(
      0,
      this.sizes.offsetOf(this.state.getBlocks(), index) - this.scroller.clientHeight / 3
    );
    this.syncWindow(true);
  }

  /**
   * Re-tags every mounted block with its own line and character range.
   *
   * An element is remembered by its content, so an edit above it — or a
   * window that brings it back — can hand back an element built when the block
   * sat somewhere else. Everything that maps a caret or a pointer back to the
   * document reads these tags, so they have to describe the block as it is now,
   * not as it was when the element was built.
   */
  refreshBlockTags(): void {
    for (const [lineStart, element] of this.mounted) {
      const block = this.state.getBlockAtLine(lineStart);
      if (!block) {
        continue;
      }
      element.dataset.lineStart = String(block.lineStart);
      element.dataset.lineEnd = String(block.lineEnd);
      element.dataset.charStart = String(block.charStart);
    }
  }

  private schedule(): void {
    if (this.frame !== null) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.syncWindow(false);
    });
  }

  /**
   * Brings the mounted blocks in line with the viewport: unchanged blocks
   * stay in place, new ones are created, far ones are dropped.
   */
  private syncWindow(force: boolean): void {
    const root = this.root;
    if (!root || this.syncing) {
      return;
    }
    this.syncing = true;
    try {
      const blocks = this.state.getBlocks();
      if (blocks.length === 0) {
        for (const element of this.mounted.values()) {
          element.remove();
        }
        this.mounted.clear();
        this.range = { first: 0, last: -1 };
        this.updateSpacers();
        return;
      }

      const [first, last] = windowRange(
        this.sizes,
        this.state.getBlocks(),
        this.scroller.scrollTop,
        this.scroller.clientHeight
      );
      if (!force && this.range?.first === first && this.range.last === last) {
        this.measureMounted(blocks, first, last);
        this.updateSpacers();
        return;
      }
      const snapshot = this.hooks?.capture();
      const desired: Node[] = [this.spacer('top')];
      const keep = new Set<number>();
      for (let index = first; index <= last; index += 1) {
        const block = blocks[index];
        keep.add(block.lineStart);
        let element = this.mounted.get(block.lineStart);
        if (!element || this.builtFrom.get(element) !== this.renderKey(block)) {
          element = this.createBlockElement(block);
          this.mounted.set(block.lineStart, element);
        }
        desired.push(element);
      }
      desired.push(this.spacer('bottom'));

      for (const [lineStart, element] of [...this.mounted]) {
        if (!keep.has(lineStart)) {
          this.releaseElement(element, this.builtFrom.get(element));
          this.mounted.delete(lineStart);
        }
      }

      this.reconcile(root, desired);
      this.range = { first, last };
      this.measureMounted(blocks, first, last);
      this.updateSpacers();
      this.refreshBlockTags();
      this.hooks?.restore(snapshot);
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Reorders/inserts only what changed: nodes already in the right position
   * are left untouched, which keeps the caret's DOM anchors valid.
   */
  private reconcile(root: HTMLElement, desired: Node[]): void {
    let cursor = root.firstChild;
    for (const node of desired) {
      if (node === cursor) {
        cursor = cursor.nextSibling;
        continue;
      }
      root.insertBefore(node, cursor);
    }
    const keep = new Set(desired);
    while (cursor) {
      const next = cursor.nextSibling;
      // Only nodes this renderer created are removed: anything else living
      // inside the prose root (the caret span, for instance) is left alone.
      if (!keep.has(cursor) && isRendererOwned(cursor)) {
        cursor.remove();
      }
      cursor = next;
    }
  }

  private createRoot(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'prose prose-slate leading-6 prose-tight w-full max-w-full outline-none';
    root.tabIndex = 0;
    return root;
  }

  private createBlockElement(block: MarkdownBlock): HTMLElement {
    const key = this.renderKey(block);
    const spare = this.spare.get(key);
    if (spare) {
      // The same content, rendered before: reuse it instead of rebuilding.
      this.spare.delete(key);
      this.setIntrinsicSize(spare, this.sizes.heightOf(block));
      return spare;
    }
    const node: BlockNode = { ...block, type: 'block' };
    const element = createBlockComponent(node, this.state.getBlockContent(block)).element;
    this.setIntrinsicSize(element, this.sizes.heightOf(block));
    this.builtFrom.set(element, key);
    return element;
  }

  /**
   * Tells the browser how tall this block is before it lays it out.
   *
   * Blocks are `content-visibility: auto`, so one that is off-screen — a block
   * that has just been re-inserted, say — is laid out from its intrinsic size,
   * and the stylesheet's fallback is 60px. A heavy block therefore entered the
   * window at 60px and took its real height a frame later, which moves
   * everything below it: the content shivers while scrolling. Seeding the size
   * with the block's remembered height (or its line-count estimate) removes
   * that jump.
   */
  private setIntrinsicSize(element: HTMLElement, height: number): void {
    element.style.containIntrinsicSize = `auto ${Math.round(height)}px`;
  }

  /** Keeps a block's element for later instead of throwing its rendering away. */
  private releaseElement(element: HTMLElement, key: string | undefined): void {
    element.remove();
    this.keepSpare(element, key);
  }

  /**
   * Remembers an element under the key it was built from, so a block that comes
   * back with that content is reused instead of built again. Whether the element
   * leaves the document is the caller's business: `releaseElement` takes it out,
   * `renderBlock` replaces it in place.
   */
  private keepSpare(element: HTMLElement, key: string | undefined): void {
    if (!key) {
      return;
    }
    this.spare.get(key)?.remove();
    this.spare.set(key, element);
    // One window's worth of spares is enough: the blocks that come back are
    // the ones that just left, and a larger cap only keeps more heavy DOM
    // (KaTeX, highlight.js) alive.
    const windowSize = this.range ? this.range.last - this.range.first + 1 : MIN_SPARE_ELEMENTS;
    const limit = Math.max(MIN_SPARE_ELEMENTS, windowSize);
    while (this.spare.size > limit) {
      const oldest = this.spare.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.spare.delete(oldest);
    }
  }

  /** Forgets every spare element (a new document, or changed global inputs). */
  private dropSpare(): void {
    for (const element of this.spare.values()) {
      element.remove();
    }
    this.spare.clear();
  }

  /** Measures mounted blocks once, so the spacers use real heights. */
  private measureMounted(blocks: readonly MarkdownBlock[], first: number, last: number): void {
    for (let index = first; index <= last; index += 1) {
      const block = blocks[index];
      const element = this.mounted.get(block.lineStart);
      if (element) {
        this.rememberHeight(block, element);
      }
    }
  }

  private rememberHeight(block: MarkdownBlock, element: HTMLElement): void {
    const height = element.offsetHeight;
    if (height > 0) {
      this.sizes.remember(block, height);
      this.setIntrinsicSize(element, height);
    }
  }

  /** The spacer element for a position, created on first use. */
  private spacer(position: 'top' | 'bottom'): HTMLElement {
    const existing = this.root?.querySelector<HTMLElement>(
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

  /** Sizes the spacers from the remembered block heights. */
  private updateSpacers(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const topSpacer = this.spacer('top');
    const bottomSpacer = this.spacer('bottom');
    if (!this.range || this.range.last < this.range.first) {
      topSpacer.style.height = '0px';
      bottomSpacer.style.height = '0px';
      return;
    }
    const { top, bottom } = spacerHeights(this.sizes, this.state.getBlocks(), this.range);
    topSpacer.style.height = `${Math.round(top)}px`;
    bottomSpacer.style.height = `${Math.round(bottom)}px`;
  }
}

/** Whether a node inside the prose root belongs to the renderer. */
function isRendererOwned(node: Node): boolean {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  return node.classList.contains('markdown-block') || node.hasAttribute('data-virtual-spacer');
}
