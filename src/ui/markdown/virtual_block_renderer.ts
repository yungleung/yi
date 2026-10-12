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
 * replaced by a measurement, where the reader is is remembered as a *document*
 * offset instead (`scrollAnchor`), and put back with it (`scrollToAnchor`): a
 * pixel scrollTop means a different place each time the window turns over.
 *
 * May import: the document's blocks and state, the block factory, the size
 * arithmetic (`block_sizes.ts`) and the window (`viewport_window.ts`). Upholds:
 * the mounted window and its spacers are derived from the block sizes on every
 * sync — the DOM is a view of that arithmetic, never a second record of it.
 */

import { BLOCK_GAP, BlockSizes } from './block_sizes';
import { createBlockComponent } from './create_block';
import { type BlockNode, type MarkdownBlock } from './document/blocks';
import { shownSourceWithinBlock } from './source_mode';
import type { MarkdownEditorState } from './document/state';
import { MIN_SPARE_ELEMENTS, spacerHeights, windowRange } from './viewport_window';
import { CHAR_START, LINE_END, LINE_START, setOffset } from './offset_tags';
import { withRenderContext, type RenderContext } from './render_context';

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
  /**
   * Elements inserted since the last frame boundary.
   *
   * A block just put in the document has not been laid out yet: the browser decides whether it is
   * on screen at the end of the frame, so until then the element reports its own
   * `contain-intrinsic-size` to `offsetHeight` instead of its height (measured: 176px against a
   * real 156px for the citations paragraph) — and for an element reused from the spare cache, the
   * size the browser remembered for its previous rendering. Neither is a measurement of the block.
   */
  private pendingLayout = new WeakSet<HTMLElement>();
  /**
   * The scroller's own geometry as it was last read, so a rebuild does not have to ask for it.
   *
   * Reading `scrollTop` or `clientHeight` makes the browser lay the document out first, and inside
   * the task a reader's click runs in, that layout is the cost of the click (measured: ~150 ms, the
   * first read ~45 ms of it and the window measure that follows the same again). The scroller only
   * changes size when the window does, and only scrolls when something scrolls it — both of which
   * the renderer already hears — so the numbers are kept here and a rebuild reads nothing.
   */
  private geometry: { scrollTop: number; clientHeight: number } | null = null;
  private range: { first: number; last: number } | null = null;
  private syncing = false;
  /** What a rendering may ask the app for; the editor sets it (see `render_context.ts`). */
  private renderContext: RenderContext | null = null;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly state: MarkdownEditorState
  ) {
    this.scroller.addEventListener(
      'scroll',
      () => {
        this.readGeometry();
        this.schedule();
      },
      { passive: true }
    );
  }

  /** Registers the caret-preservation hooks used around DOM swaps. */
  setSyncHooks(hooks: RendererSyncHooks | null): void {
    this.hooks = hooks;
  }

  /** Sets what a rendering may ask the app for — the citation, wikilink and image answers. */
  setRenderContext(context: RenderContext | null): void {
    this.renderContext = context;
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
    // The renderer owns the root it drew, not the scroller's whole contents: the scroller is
    // the editor's, and holds things of its own — the system's input seam
    // (`editing/composition_input.ts`) sits in it and must survive a document opening or a
    // layout change. A replaced root takes its own blocks with it.
    this.root?.remove();
    this.root = root;
    this.scroller.appendChild(root);
    this.syncWindow(true);
  }

  /**
   * The page is drawn at a new scale: the height an unmeasured block is estimated at is a
   * number of the page's own lines (`block_sizes.ts`), so it moves with the scale, and every
   * height measured at the old one is stale.
   */
  setPageScale(scale: number): void {
    this.sizes.setScale(scale);
    this.refresh();
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
    // The element now holds what the block holds, and its record has to say so: this wrote
    // characters the block did not have when the element was built, so an edit that later
    // returns to that text — one undo — would compare equal and look like "nothing to
    // re-render", leaving the page showing a character the document no longer has. The same
    // reason `notePatchedBlock` exists for formatting (`test/probes/input-method-undo.js`
    // watches it from the reader's side: ⌘Z after a committed word).
    this.builtFrom.set(element, this.renderKey(block));
    this.refreshBlockTags();
    if (Math.abs(this.sizes.heightOf(block) - before) >= 1) {
      this.updateSpacers();
    }
  }

  /**
   * Records that a block's mounted element now holds what the block holds, after
   * somebody patched it in place rather than rebuilding it (`format_dom.ts`, for a
   * formatting command).
   *
   * An element is remembered by the content it was *built* from (`builtFrom`), and the
   * patch leaves it holding content the block did not have then. Leaving that record
   * alone made the next edit that went back to the older text look like "nothing to
   * re-render" — the key it compares against was the one from before the patch — so
   * undoing a formatting command left the padded markup on screen, `<strong>` and its
   * shifted `data-text-from` and all, with the selection mapped through it (measured:
   * undo of Bold over `world` left only `wor` selected).
   */
  notePatchedBlock(lineStart: number): void {
    const block = this.state.getBlockAtLine(lineStart);
    const element = this.mounted.get(lineStart);
    if (block && element) {
      this.builtFrom.set(element, this.renderKey(block));
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
      if (block) {
        const key = this.renderKey(block);
        if (this.builtFrom.get(element) === key) {
          continue;
        }
        this.carryHeightOver(block, element, key);
      }
      this.releaseElement(element, this.builtFrom.get(element));
      this.mounted.delete(lineStart);
    }
    this.syncWindow(true);
  }

  /**
   * Rebuilds every mounted block. Used when the renderers' inputs changed
   * (for example the bibliography arrived), so widgets re-read their data.
   *
   * The mounted elements are dropped *inside* the sync (`syncWindow`'s `rebuildAll`), never here:
   * removing a block element relocates the caret's live range to the point it occupied — connected,
   * between two blocks, and naming no document offset (`markdown_editor.ts: reanchorCaret`) — so a
   * renderer that touches the DOM before the snapshot has taken the caret off the page, and the
   * next keystroke reads a whole-document range and replaces the note. Measured: the caret was
   * `el.prose@1` for a reader whose caret sat in a formula, after a `config_changed` refresh.
   */
  refresh(): void {
    // The heights are not dropped with the elements: a block's height is a function of its own
    // source, and the source has not moved — a citation that now formats (Smith, 2020) instead of
    // [@smith2020] is a different rendering of the same block, and the height it had a moment ago is
    // a better start for the rebuilt element than the line-count estimate (measured: the estimate is
    // 176px against a real 156px for the citations paragraph, which is painted for one frame). The
    // rebuild measures each block once it is laid out again, and that measurement replaces the
    // carried height wherever the rendering really did change.
    this.syncWindow(true, true);
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
      this.contentTop() +
        this.sizes.offsetOf(this.state.getBlocks(), index) -
        (this.geometry ?? this.readGeometry()).clientHeight / 3
    );
    this.readGeometry();
    this.syncWindow(true);
  }

  /**
   * Where the first block sits, in the scroller's own pixels.
   *
   * A block's remembered offset is measured from the top of the prose, and the prose is not the
   * top of the scroller: on a page (`styles.css`) there is the desk's padding and the sheet's
   * margin above it — 118px of them at the default size. Every place that turns a block's
   * offset into a scroll position has to add them, and every place that reads a scroll position
   * back has to take them off; this is that one number.
   */
  private contentTop(): number {
    const root = this.root;
    if (!root) {
      return 0;
    }
    return (
      root.getBoundingClientRect().top -
      this.scroller.getBoundingClientRect().top +
      this.scroller.scrollTop
    );
  }

  /**
   * Where the reader is: the block at the top of the viewport, and how far the view is
   * scrolled into it. A pixel scrollTop cannot be remembered — the window turns over as the
   * reader moves and a block's estimated height changes when it is finally measured — while a
   * document offset means the same place whenever it is read back.
   *
   * The walk starts where the mounted window starts, which is the first block at or above the
   * viewport, so it costs the window rather than the document.
   */
  scrollAnchor(): { offset: number; within: number } | null {
    const blocks = this.state.getBlocks();
    if (blocks.length === 0) {
      return null;
    }
    // The scroll position in the blocks' own pixels: the prose is not the top of the scroller.
    const scrollTop = Math.max(0, this.scroller.scrollTop - this.contentTop());
    const first = Math.max(0, Math.min(this.range?.first ?? 0, blocks.length - 1));
    let index = first;
    let top = this.sizes.offsetOf(blocks, first);
    while (index < blocks.length - 1) {
      const height = this.sizes.heightOf(blocks[index]) + BLOCK_GAP;
      if (top + height > scrollTop) {
        break;
      }
      top += height;
      index += 1;
    }
    return { offset: blocks[index].charStart, within: Math.max(0, scrollTop - top) };
  }

  /**
   * Puts the view back where `scrollAnchor` found it, and mounts the window around it. The
   * anchor names a block rather than a pixel, so this lands in the same place whether or not
   * the blocks above it have been measured yet; a few pixels of drift are possible until they
   * are, because until then their heights are estimates.
   */
  scrollToAnchor(anchor: { offset: number; within: number } | null): void {
    const blocks = this.state.getBlocks();
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
    const top = this.sizes.offsetOf(blocks, index) + Math.max(0, anchor?.within ?? 0);
    this.scroller.scrollTop = Math.max(0, this.contentTop() + top);
    this.readGeometry();
    this.syncWindow(true);
    // That sync mounts the blocks around the anchor and measures them, so the offsets above it
    // are the real ones now: the first pass was close enough to bring them in, and this one
    // lands on the place itself. (Blocks still outside the window keep their estimates, so a
    // restore into a very long document can still be a few pixels out.)
    const refined = this.sizes.offsetOf(blocks, index) + Math.max(0, anchor?.within ?? 0);
    this.scroller.scrollTop = Math.max(0, this.contentTop() + refined);
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
      setOffset(element, LINE_START, block.lineStart);
      setOffset(element, LINE_END, block.lineEnd);
      setOffset(element, CHAR_START, block.charStart);
    }
  }

  private schedule(): void {
    if (this.frame !== null) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.readGeometry();
      // A frame has been laid out since the last sync: whatever was inserted before this point has
      // a height now, so the elements it was carrying are the ones to measure (`pendingLayout`).
      this.pendingLayout = new WeakSet();
      this.syncWindow(false);
    });
  }

  /**
   * Brings the mounted blocks in line with the viewport: unchanged blocks
   * stay in place, new ones are created, far ones are dropped.
   */
  private syncWindow(force: boolean, rebuildAll = false): void {
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

      const geometry = this.geometry ?? this.readGeometry();
      const [first, last] = windowRange(
        this.sizes,
        this.state.getBlocks(),
        geometry.scrollTop,
        geometry.clientHeight
      );
      if (!force && this.range?.first === first && this.range.last === last) {
        this.measureMounted(blocks, first, last);
        this.updateSpacers();
        return;
      }
      const snapshot = this.hooks?.capture();
      if (rebuildAll) {
        // Every block is built again, so the elements standing now are dropped — after the capture,
        // because removing one takes the caret's range off the position it names (see `refresh`).
        for (const element of this.mounted.values()) {
          element.remove();
        }
        this.mounted.clear();
        this.dropSpare();
      }
      const desired: Node[] = [this.spacer('top')];
      const keep = new Set<number>();
      for (let index = first; index <= last; index += 1) {
        const block = blocks[index];
        keep.add(block.lineStart);
        let element = this.mounted.get(block.lineStart);
        const key = this.renderKey(block);
        if (!element || this.builtFrom.get(element) !== key) {
          if (element) {
            this.carryHeightOver(block, element, key);
          }
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
      // The measuring waits for the frame (`schedule`), because it is 47 ms of the task the reader's
      // click runs in (measured), and because a block measured in the very task that inserted it
      // answers with its fallback rather than its height. What the spacers are sized from is what is
      // remembered for each block, and a rebuilt block starts at the height the shape it replaced
      // had (`carryHeightOver`), so nothing here needs a fresh measurement to be right.
      this.schedule();
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
    // The page carries its own line height (`styles.css: .prose.markdown-page`), scaled with
    // the rest of its rhythm, so the fixed `leading-6` is not wanted here.
    root.className = 'prose prose-slate prose-tight markdown-page outline-none';
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
      this.pendingLayout.add(spare);
      return spare;
    }
    const node: BlockNode = { ...block, type: 'block' };
    const element = withRenderContext(this.renderContext, () =>
      createBlockComponent(node, this.state.getBlockContent(block)).element
    );
    this.setIntrinsicSize(element, this.sizes.heightOf(block));
    this.builtFrom.set(element, key);
    this.pendingLayout.add(element);
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

  /**
   * Starts a block's new shape at the height its previous shape had.
   *
   * A block whose shape changes under the reader — the click that reveals a citation's or a
   * wikilink's own source, and the click that closes it again — is the same block at the same
   * width, so the height it just had is the truth for the shape it is becoming (see
   * `BlockSizes.seed`). Only a *shape* swap of one block qualifies: a rendering that is not the
   * same block's other shape (a block entering the window, a block whose text was edited) has no
   * height to inherit, and keeps the estimate.
   */
  private carryHeightOver(block: MarkdownBlock, outgoing: HTMLElement, incoming: string): void {
    const outgoingKey = this.builtFrom.get(outgoing);
    if (!outgoingKey || outgoingKey === incoming) {
      return;
    }
    if (shapeBaseOf(outgoingKey) !== shapeBaseOf(incoming)) {
      return;
    }
    const height = this.sizes.heightForKey(outgoingKey);
    if (height !== null) {
      this.sizes.seed(block, height);
    }
  }

  /** Reads the scroller's geometry and keeps it: the one place that asks the browser. */
  private readGeometry(): { scrollTop: number; clientHeight: number } {
    const geometry = {
      scrollTop: this.scroller.scrollTop,
      clientHeight: this.scroller.clientHeight
    };
    this.geometry = geometry;
    return geometry;
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
    // A block the browser has not laid out yet — one inserted since the last frame — reports its
    // own `contain-intrinsic-size`, not its height, so that number measures nothing: storing it
    // would replace the height the block is known by with the fallback the seed happens to name,
    // and hand that number to the next frame that seeds from it (see `pendingLayout`). The block is
    // measured on the next frame instead, once it is laid out.
    if (this.pendingLayout.has(element)) {
      this.schedule();
      return;
    }
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

/**
 * A render key without its shape suffix: the same block's other rendering carries this same base.
 *
 * `renderKey` appends `:source@<offset>` to a block that shows its own source, so two renderings of
 * one block are two identities that share a base — which is how a swap between them is told from a
 * block that simply changed.
 */
function shapeBaseOf(key: string): string {
  const suffix = key.indexOf(':source@');
  return suffix < 0 ? key : key.slice(0, suffix);
}
