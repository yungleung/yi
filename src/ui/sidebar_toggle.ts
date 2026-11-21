/**
 * The title-bar button that shows or hides the sidebar shell.
 *
 * Example: pressing it requests `view:toggleSidebar`; the shell's typed state event redraws the
 * open or closed glyph, so this button never owns a second visibility flag.
 *
 * May import: the command runtime, the typed event bus, the catalogue and the component base.
 * Upholds: the button is chrome for the sidebar's state and remains outside the sidebar component.
 */

import { runCommand } from '../commands/runtime';
import { SIDEBAR_CHANGED, eventManager } from '../services/events';
import { t } from '../services/i18n';
import { BaseComponent } from './component';

const OPEN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1.5em" height="1.5em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M6 21a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3zM18 5h-8v14h8a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1"/></svg>';
const CLOSED_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1.5em" height="1.5em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm5-2v16"/></svg>';

/** The extracted title-bar control for the sidebar's visibility. */
export class SidebarToggle extends BaseComponent {
  private readonly button: HTMLButtonElement;

  constructor() {
    super('button', ['btn', 'btn-ghost', 'btn-sm']);
    this.button = this.element as HTMLButtonElement;
    this.button.type = 'button';
    this.button.title = t('sidebar.toggle');
    this.button.setAttribute('aria-label', this.button.title);
    this.button.setAttribute('data-sidebar-toggle', 'true');
    // The title bar contributes 12px of left padding: 138px keeps the button at the original x=150,
    // leaving a 6px gap before the default sidebar divider.
    this.button.style.marginLeft = '138px';
    this.button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.button.addEventListener('click', () => {
      runCommand('view:toggleSidebar', null, 'toolbar');
    });
    void eventManager.on(SIDEBAR_CHANGED, (event) => {
      this.render(event.payload.visible);
    });
    this.render(true);
  }

  private render(visible: boolean): void {
    this.button.innerHTML = visible ? OPEN_ICON : CLOSED_ICON;
    this.button.setAttribute('aria-pressed', String(visible));
    this.button.setAttribute('data-sidebar-visible', String(visible));
  }
}
