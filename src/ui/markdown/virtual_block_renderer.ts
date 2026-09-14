import { createBlockComponent } from './create_block';
import type { BlockNode, MarkdownBlock } from './blocks';
import type { MarkdownEditorState } from './state';

/** Fallback height for a block that has never been measured. */
const ESTIMATED_BLOCK_HEIGHT = 60;
/**
 * Gap between block wrappers. Blocks have no margin of their own (styles.css
 * keeps the spacing inside the content, where each block height measures it),
 * so the renderer adds nothing; the arithmetic below stays as the single place
 * to change if spacing ever moves back to the wrappers.
 */
const BLOCK_GAP = 0;
/** Extra content kept mounted above and below the viewport. */
const VIEWPORT_MARGIN = 1200;

/**
 * Editor-facing hooks that keep the caret anchored while the window changes:
 * the renderer captures an opaque snapshot before it touches the DOM and
 * hands it back once the new window is in place.
 */
export interface RendererSyncHooks {
  capture(): unknown;
  restore(snapshot: unknown): void;
}

/**
 * Owns the block DOM for a document: only the blocks around the viewport are
 * mounted, the rest are represented by two spacers sized from remembered
 * heights.
 *
 * Unchanged blocks keep their DOM nodes (they are reused, never re-created),
 * so the caret, the selection and any open revealable survive scrolling and
 * edits. Heights are measured once a block has been laid out and reused
 * afterwards, which keeps the spacers — and therefore the scrollbar and
 * `revealOffset` — accurate on documents whose blocks differ wildly in size
 * (display math, code fences, ...).
 */
export class VirtualBlockRenderer {
  private root: HTMLElement | null = null;
  private frame: number | null = null;
  private hooks: RendererSyncHooks | null = null;
  /** Measured height per block signature (`lineStart:text`). */
  private readonly heights = new Map<string, number>();
  /** The raw text an element was built from, so unchanged blocks are reused. */
  private readonly builtFrom = new WeakMap<HTMLElement, string>();
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

  /** Builds the prose root and mounts the window around the current scroll. */
  render(): void {
    this.heights.clear();
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
    current.replaceWith(element);
    this.mounted.set(lineStart, element);
    this.rememberHeight(block, element);
    this.updateSpacers();
    this.refreshBlockOffsets();
    this.hooks?.restore(snapshot);
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
      if (!block || this.builtFrom.get(element) !== block.text) {
        element.remove();
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
    this.scroller.scrollTop = Math.max(0, this.offsetOf(index) - this.scroller.clientHeight / 3);
    this.syncWindow(true);
  }

  /** Refreshes the raw character-start tag of every mounted block. */
  refreshBlockOffsets(): void {
    for (const block of this.state.getBlocks()) {
      this.mounted
        .get(block.lineStart)
        ?.setAttribute('data-char-start', String(block.charStart));
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

      const [first, last] = this.windowRange();
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
        if (!element || this.builtFrom.get(element) !== block.text) {
          element = this.createBlockElement(block);
          this.mounted.set(block.lineStart, element);
        }
        desired.push(element);
      }
      desired.push(this.spacer('bottom'));

      for (const [lineStart, element] of [...this.mounted]) {
        if (!keep.has(lineStart)) {
          element.remove();
          this.mounted.delete(lineStart);
        }
      }

      this.reconcile(root, desired);
      this.range = { first, last };
      this.measureMounted(blocks, first, last);
      this.updateSpacers();
      this.refreshBlockOffsets();
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
    const node: BlockNode = { ...block, type: 'block' };
    const element = createBlockComponent(node, this.state.getBlockContent(block)).element;
    this.builtFrom.set(element, block.text);
    return element;
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
      this.heights.set(blockKey(block), height);
    }
  }

  private heightOf(block: MarkdownBlock): number {
    return this.heights.get(blockKey(block)) ?? ESTIMATED_BLOCK_HEIGHT;
  }

  /** The document height according to the remembered/estimated block sizes. */
  private totalHeight(): number {
    const blocks = this.state.getBlocks();
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
  private offsetOf(index: number): number {
    const blocks = this.state.getBlocks();
    let top = 0;
    for (let i = 0; i < index && i < blocks.length; i += 1) {
      top += this.heightOf(blocks[i]) + BLOCK_GAP;
    }
    return top;
  }

  /** The block index range that should be mounted for the current scroll. */
  private windowRange(): [number, number] {
    const blocks = this.state.getBlocks();
    const top = this.scroller.scrollTop - VIEWPORT_MARGIN;
    const bottom = this.scroller.scrollTop + this.scroller.clientHeight + VIEWPORT_MARGIN;
    let first = -1;
    let last = -1;
    let cursor = 0;
    for (let index = 0; index < blocks.length; index += 1) {
      const height = this.heightOf(blocks[index]);
      if (first < 0 && cursor + height >= top) {
        first = index;
      }
      if (cursor <= bottom) {
        last = index;
      }
      cursor += height + BLOCK_GAP;
    }
    return [first < 0 ? 0 : first, last < 0 ? blocks.length - 1 : last];
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
    const top = this.offsetOf(this.range.first);
    const mountedHeight = this.offsetOf(this.range.last + 1) - top;
    const bottom = Math.max(0, this.totalHeight() - top - mountedHeight);
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

/** Identity of a block's rendered source (its height cache key). */
function blockKey(block: MarkdownBlock): string {
  return `${block.lineStart}:${block.text}`;
}
