import { eventManager } from '../../services/event_manager';
import { runCommand } from '../markdown/commands/registry';
import { EDITOR_LAYOUT_CHANGED, type EditorLayout } from '../markdown/markdown_editor';
import { t } from '../../services/i18n';
import { Toolbar } from './toolbar';

/** The button's icon while the editor is a page of A4: a sheet with its lines. */
const PAGE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32">' +
  '<path d="M0 0h32v32H0z" fill="none" />' +
  '<path fill="currentColor" d="M24.75 2A3.25 3.25 0 0 1 28 5.25v21.5A3.25 3.25 0 0 1 24.75 30H7.25a3.25 3.25 0 0 1-3.246-3.083L4 26.75V5.25A3.25 3.25 0 0 1 7.25 2zM7.25 4C6.56 4 6 4.56 6 5.25v21.5l.007.128A1.25 1.25 0 0 0 7.25 28h17.5c.69 0 1.25-.56 1.25-1.25V5.25C26 4.56 25.44 4 24.75 4zM22 22a1 1 0 1 1 0 2H10a1 1 0 1 1 0-2zm0-7a1 1 0 1 1 0 2H10a1 1 0 1 1 0-2zm0-7a1 1 0 1 1 0 2H10a1 1 0 0 1 0-2z" />' +
  '</svg>';

/** And while the words take the whole width of the pane: a frame with its corners. */
const AUTO_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
  '<path d="M0 0h24v24H0z" fill="none" />' +
  '<path fill="currentColor" d="M18.25 4A3.75 3.75 0 0 1 22 7.75v8.5A3.75 3.75 0 0 1 18.25 20H5.75A3.75 3.75 0 0 1 2 16.25v-8.5A3.75 3.75 0 0 1 5.75 4zm0 1.5H5.75A2.25 2.25 0 0 0 3.5 7.75v8.5a2.25 2.25 0 0 0 2.25 2.25h12.5a2.25 2.25 0 0 0 2.25-2.25v-8.5a2.25 2.25 0 0 0-2.25-2.25m0 7.5a.75.75 0 0 1 .75.75V15a2 2 0 0 1-2 2h-1.25a.75.75 0 0 1 0-1.5H17a.5.5 0 0 0 .5-.5v-1.25a.75.75 0 0 1 .75-.75m-12.5 0a.75.75 0 0 1 .75.75V15a.5.5 0 0 0 .5.5h1.25a.75.75 0 0 1 0 1.5H7a2 2 0 0 1-2-2v-1.25a.75.75 0 0 1 .75-.75M7 7h1.25a.75.75 0 0 1 .102 1.493L8.25 8.5H7a.5.5 0 0 0-.492.41L6.5 9v1.25a.75.75 0 0 1-1.493.102L5 10.25V9a2 2 0 0 1 1.85-1.995zm10 0a2 2 0 0 1 2 2v1.25a.75.75 0 0 1-1.5 0V9a.5.5 0 0 0-.5-.5h-1.25a.75.75 0 0 1 0-1.5z" />' +
  '</svg>';

/**
 * The icon's size and the button's own: the status bar is 17px tall on its own (a 12px word
 * count and a hairline), so the button is 20px rather than the 24px `btn-xs` would be — the
 * bar grows by four pixels, and the glyphs get a 16px box to be drawn in.
 */
const STATUS_BUTTON = 'text-[1em] h-5 min-h-5 px-1';

/**
 * The layout button at the right of the status bar: it draws the icon of the layout the editor
 * is in — a sheet for the page of A4, a frame for the full-width column — and pressing it runs
 * `view:togglePage`, which is the editor's own switch between them. What the button *means*
 * stays the editor's business: it names the command and hears which way the layout went
 * (`EDITOR_LAYOUT_CHANGED`), the way the titlebar's tools reach the editor.
 */
export class LayoutToolbar extends Toolbar {
  private readonly button: HTMLButtonElement;

  constructor() {
    super();
    this.button = this.addButton(
      { label: t('toolbar.page'), icon: PAGE_ICON, className: STATUS_BUTTON },
      () => {
        runCommand('view:togglePage');
      }
    );
    this.showLayout('page');
    void eventManager.on(EDITOR_LAYOUT_CHANGED, (event: any) => {
      const layout = (event?.payload ?? event) as EditorLayout;
      if (layout === 'page' || layout === 'auto') {
        this.showLayout(layout);
      }
    });
  }

  /** The icon says which layout is on, the tooltip says what pressing does. */
  private showLayout(layout: EditorLayout): void {
    const page = layout === 'page';
    this.button.innerHTML = page ? PAGE_ICON : AUTO_ICON;
    this.button.title = page ? t('toolbar.fullWidth') : t('toolbar.page');
    this.button.setAttribute('aria-label', this.button.title);
    this.button.setAttribute('aria-pressed', String(page));
  }
}
