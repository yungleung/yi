/**
 * The status-bar control that switches the sidebar between Workspace and Contents.
 *
 * Example: pressing the Workspace glyph requests `view:toggleSidebarView`; the resulting typed
 * fact changes the glyph and tooltip to point back to Workspace.
 *
 * May import: the neutral sidebar contract, the command runtime, the typed event bus, the
 * catalogue, the component base and the status-bar sizing rule. Upholds: the button displays the
 * sidebar's authoritative view state.
 */

import { runCommand } from '../../commands/runtime';
import type { SidebarViewName } from '../../contracts';
import { SIDEBAR_CHANGED, eventManager } from '../../services/events';
import { t } from '../../services/i18n';
import { BaseComponent } from '../component';
import { STATUS_BUTTON } from './button';

const WORKSPACE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Zm0 11a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1ZM3 5a2 2 0 0 0 2 2h3" /><path d="M3 3v13a2 2 0 0 0 2 2h3" /></g></svg>';
const CONTENTS_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 5H3m13 7H3m13 7H3M21 5h.01M21 12h.01M21 19h.01" /></svg>';

export class SidebarViewStatus extends BaseComponent {
  private readonly button: HTMLButtonElement;

  constructor() {
    super('button', ['btn', 'btn-ghost', STATUS_BUTTON]);
    this.button = this.element as HTMLButtonElement;
    this.button.type = 'button';
    this.button.setAttribute('data-sidebar-view-toggle', 'true');
    this.button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.button.addEventListener('click', () => {
      runCommand('view:toggleSidebarView', null, 'toolbar');
    });
    void eventManager.on(SIDEBAR_CHANGED, (event) => {
      this.render(event.payload.view);
    });
    this.render('workspace');
  }

  private render(view: SidebarViewName): void {
    this.button.dataset.activeView = view;
    this.button.innerHTML = view === 'workspace' ? WORKSPACE_ICON : CONTENTS_ICON;
    this.button.title = view === 'workspace'
      ? t('sidebar.toContents')
      : t('sidebar.toWorkspace');
    this.button.setAttribute('aria-label', this.button.title);
    this.button.setAttribute('aria-pressed', String(view === 'contents'));
  }
}
