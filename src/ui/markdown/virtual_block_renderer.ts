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

import type { MarkdownBlock } from './document/blocks';
import { shownSourceWithinBlock } from './source_mode';
import type { MarkdownEditorState } from './document/state';
import { MIN_SPARE_ELEMENTS, windowRange } from './viewport_window';
import { CHAR_START, LINE_END, LINE_START, setOffset } from './offset_tags';
import type { RenderContext } from './render_context';
import { RendererBlockCache } from './renderer_block_cache';
import { RendererMeasurements } from './renderer_measurements';
import { RendererGeometry, type ScrollAnchor } from './renderer_geometry';
import { RendererDom } from './renderer_dom';

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
  /** Mounted elements, rendering identities and bounded spare DOM. */
  private readonly cache = new RendererBlockCache();
  /** Remembered heights and layout-pending measurements. */
  private readonly measurements = new RendererMeasurements({
    keyOf: (block) => this.renderKey(block),
    mountedAt: (lineStart) => this.cache.mountedAt(lineStart),
    schedule: () => this.schedule()
  });
  /** Root and block DOM construction plus renderer-owned reconciliation. */
  private readonly dom: RendererDom;
  private readonly geometry: RendererGeometry;
  private range: { first: number; last: number } | null = null;
  private syncing = false;
  /** What a rendering may ask the app for; the editor sets it (see `render_context.ts`). */
  private renderContext: RenderContext | null = null;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly state: MarkdownEditorState
  ) {
    this.dom = new RendererDom({
      state: this.state,
      cache: this.cache,
      measurements: this.measurements,
      keyOf: (block) => this.renderKey(block),
      renderContext: () => this.renderContext
    });
    this.geometry = new RendererGeometry({
      scroller: this.scroller,
      root: () => this.root,
      blocks: () => this.state.getBlocks(),
      sizes: this.measurements.sizes,
      range: () => this.range,
      syncWindow: (force) => this.syncWindow(force)
    });
    this.scroller.addEventListener(
      'scroll',
      () => {
        this.geometry.read();
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
    this.measurements.clear();
    this.cache.dropSpare();
    this.cache.clear(false);
    this.range = null;
    const root = this.dom.createRoot();
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
    this.measurements.setScale(scale);
    this.refresh();
  }

  /** Rebuilds a single block in place (used when an edit re-renders a block). */
  renderBlock(lineStart: number): void {
    const block = this.state.getBlockAtLine(lineStart);
    const current = this.cache.mountedAt(lineStart);
    if (!block || !current || !this.root) {
      return;
    }
    const snapshot = this.hooks?.capture();
    const element = this.createBlockElement(block);
    // The element being replaced is kept as the spare for the content it was
    // built from — undo brings that content back — but it stays in the document
    // until `replaceWith` puts the new one where it was: a removed node has no
    // parent to be replaced in, and the block would simply leave the page.
    this.cache.keepSpare(current, this.cache.keyOf(current), this.spareLimit());
    current.replaceWith(element);
    this.cache.mount(lineStart, element);
    this.measurements.rememberHeight(block, element);
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
    const element = this.cache.mountedAt(lineStart);
    if (!block || !element) {
      return;
    }
    const before = this.measurements.sizes.heightOf(block);
    this.measurements.rememberHeight(block, element);
    // The element now holds what the block holds, and its record has to say so: this wrote
    // characters the block did not have when the element was built, so an edit that later
    // returns to that text — one undo — would compare equal and look like "nothing to
    // re-render", leaving the page showing a character the document no longer has. The same
    // reason `notePatchedBlock` exists for formatting (`test/probes/input-method-undo.js`
    // watches it from the reader's side: ⌘Z after a committed word).
    this.cache.markBuilt(element, this.renderKey(block));
    this.refreshBlockTags();
    if (Math.abs(this.measurements.sizes.heightOf(block) - before) >= 1) {
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
    const element = this.cache.mountedAt(lineStart);
    if (block && element) {
      this.cache.markBuilt(element, this.renderKey(block));
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
    for (const [lineStart, element] of this.cache.entries()) {
      const block = byLine.get(lineStart);
      if (block) {
        const key = this.renderKey(block);
        if (this.cache.keyOf(element) === key) {
          continue;
        }
        this.measurements.carryHeightOver(block, this.cache.keyOf(element), key);
      }
      this.cache.release(element, this.cache.keyOf(element), this.spareLimit());
      this.cache.unmount(lineStart);
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
    this.geometry.reveal(offset);
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
    return this.geometry.scrollAnchor();
  }

  /**
   * Puts the view back where `scrollAnchor` found it, and mounts the window around it. The
   * anchor names a block rather than a pixel, so this lands in the same place whether or not
   * the blocks above it have been measured yet; a few pixels of drift are possible until they
   * are, because until then their heights are estimates.
   */
  scrollToAnchor(anchor: { offset: number; within: number } | null): void {
    this.geometry.scrollToAnchor(anchor as ScrollAnchor | null);
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
    for (const [lineStart, element] of this.cache.entries()) {
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
      this.geometry.read();
      // A frame has been laid out since the last sync: whatever was inserted before this point has
      // a height now, so the elements it was carrying are the ones to measure (`pendingLayout`).
      this.measurements.resetPending();
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
        this.cache.clear(true);
        this.range = { first: 0, last: -1 };
        this.updateSpacers();
        return;
      }

      const geometry = this.geometry.read();
      const [first, last] = windowRange(
        this.measurements.sizes,
        this.state.getBlocks(),
        geometry.scrollTop,
        geometry.clientHeight
      );
      if (!force && this.range?.first === first && this.range.last === last) {
        this.measurements.measureMounted(blocks, first, last);
        this.updateSpacers();
        return;
      }
      const snapshot = this.hooks?.capture();
      if (rebuildAll) {
        // Every block is built again, so the elements standing now are dropped — after the capture,
        // because removing one takes the caret's range off the position it names (see `refresh`).
        this.cache.clear(true);
        this.cache.dropSpare();
      }
      const desired: Node[] = [this.geometry.spacer('top')];
      const keep = new Set<number>();
      for (let index = first; index <= last; index += 1) {
        const block = blocks[index];
        keep.add(block.lineStart);
        let element = this.cache.mountedAt(block.lineStart);
        const key = this.renderKey(block);
        if (!element || this.cache.keyOf(element) !== key) {
          if (element) {
            this.measurements.carryHeightOver(block, this.cache.keyOf(element), key);
          }
          element = this.createBlockElement(block);
          this.cache.mount(block.lineStart, element);
        }
        desired.push(element);
      }
      desired.push(this.geometry.spacer('bottom'));

      for (const [lineStart, element] of this.cache.entries()) {
        if (!keep.has(lineStart)) {
          this.cache.release(element, this.cache.keyOf(element), this.spareLimit());
          this.cache.unmount(lineStart);
        }
      }

      this.dom.reconcile(root, desired);
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

  private createBlockElement(block: MarkdownBlock): HTMLElement {
    return this.dom.createBlock(block);
  }

  /** The number of heavy elements retained for work just outside the window. */
  private spareLimit(): number {
    const windowSize = this.range ? this.range.last - this.range.first + 1 : MIN_SPARE_ELEMENTS;
    return Math.max(MIN_SPARE_ELEMENTS, windowSize);
  }

  /** Sizes the spacers from the remembered block heights. */
  private updateSpacers(): void {
    this.geometry.updateSpacers();
  }
}
