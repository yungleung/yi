import { eventManager } from '../../services/event_manager';
import { runCommand } from '../markdown/commands/registry';
import { EDITOR_LAYOUT_CHANGED, type EditorLayout } from '../markdown/markdown_editor';
import { TOOL_ICON_SIZE, Toolbar } from './toolbar';

/** The button's icon while the editor is a page of A4. */
const PAGE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 20 20">' +
  '<path d="M0 0h20v20H0z" fill="none" />' +
  '<path fill="currentColor" d="M3 1v18h14V1zm9 13H6v-1h6zm2-3H6v-1h8zm0-3H6V7h8zm0-3H6V4h8z" />' +
  '</svg>';

/** And while the words take the whole width of the pane. */
const AUTO_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 20 20">' +
  '<path d="M0 0h20v20H0z" fill="none" />' +
  '<path fill="currentColor" d="M4 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm1.5 2h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 0-.5.5v1a.5.5 0 0 1-1 0v-1A1.5 1.5 0 0 1 5.5 6m8 0h1A1.5 1.5 0 0 1 16 7.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 1 0-1M5 11.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 1 0 1h-1A1.5 1.5 0 0 1 4 12.5v-1a.5.5 0 0 1 1 0m11 0v1a1.5 1.5 0 0 1-1.5 1.5h-1a.5.5 0 0 1 0-1h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 1 1 0" />' +
  '</svg>';

/**
 * The layout button at the right of the titlebar: it draws the icon of the layout the editor
 * is in — a sheet for the page of A4, a frame for the full-width column — and pressing it runs
 * `view:togglePage`, which is the editor's own switch between them. What the button *means*
 * stays the editor's business: it names the command and hears which way the layout went
 * (`EDITOR_LAYOUT_CHANGED`), the way every other titlebar button reaches the editor.
 */
export class LayoutToolbar extends Toolbar {
  private readonly button: HTMLButtonElement;

  constructor() {
    super();
    this.button = this.addButton({ label: 'A4 page', icon: PAGE_ICON, className: TOOL_ICON_SIZE }, () => {
      runCommand('view:togglePage');
    });
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
    this.button.title = page ? 'Full width' : 'A4 page';
    this.button.setAttribute('aria-label', this.button.title);
    this.button.setAttribute('aria-pressed', String(page));
  }
}
