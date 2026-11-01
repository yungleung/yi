/**
 * Owns whether the editor is an A4 sheet or a full-width column, and the scale
 * at which that choice is drawn.
 *
 * Example: a 700 px pane sets `--page-scale` below 1 for the A4 layout; the
 * same pane in `auto` uses scale 1 because the column is measured as written.
 *
 * May import: the event bus and the renderer whose measurements follow the
 * scale. Upholds: the scroller's `data-layout`, CSS custom property and renderer
 * scale change together, and a new scale is emitted only when it differs.
 */

import { eventManager } from '../../services/events';
import type { VirtualBlockRenderer } from './virtual_block_renderer';

/** An A4 sheet's width in the CSS pixels the page is laid out in (210 mm at 96 dpi). */
const A4_WIDTH_PX = (210 * 96) / 25.4;

/** The event that says which layout the editor is drawn in, for the layout button. */
export const EDITOR_LAYOUT_CHANGED = 'editor_layout_changed';

/** A page of A4, or the column at the width of the pane. */
export type EditorLayout = 'page' | 'auto';

export class EditorPageLayout {
  private layout: EditorLayout = 'page';
  private pageScale = 1;
  private readonly pageFitter: ResizeObserver;

  constructor(
    private readonly contentView: HTMLElement,
    private readonly renderer: VirtualBlockRenderer
  ) {
    contentView.dataset.layout = this.layout;
    this.pageFitter = new ResizeObserver(() => this.fit());
    this.pageFitter.observe(contentView);
    this.fit();
  }

  /** The layout currently drawn. */
  get(): EditorLayout {
    return this.layout;
  }

  /** Switches layout, redraws its scale and tells the toolbar which one is active. */
  set(layout: EditorLayout): void {
    if (this.contentView.dataset.layout === layout) {
      return;
    }
    this.layout = layout;
    this.contentView.dataset.layout = layout;
    this.fit();
    void eventManager.emit(EDITOR_LAYOUT_CHANGED, layout);
  }

  /**
   * Draws the page at the largest scale the pane can hold, never larger than A4.
   *
   * The desk margin is read from the stylesheet rather than copied here, so the
   * available width and the drawing cannot disagree.
   */
  private fit(): void {
    const desk = parseFloat(getComputedStyle(this.contentView).paddingLeft) || 0;
    const available = Math.max(0, this.contentView.clientWidth - 2 * desk);
    // The full-width column is not a page: it is measured as written, at 1.
    const scale =
      this.layout === 'page' ? Math.round(Math.min(1, available / A4_WIDTH_PX) * 1000) / 1000 : 1;
    if (scale === this.pageScale) {
      return;
    }
    this.pageScale = scale;
    this.contentView.style.setProperty('--page-scale', String(scale));
    this.renderer.setPageScale(scale);
  }
}
