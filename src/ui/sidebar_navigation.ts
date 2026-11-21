/**
 * Chooses and mounts the one sidebar view currently on screen.
 *
 * Example: `toggleView()` detaches Workspace, opens the shell, loads Contents, and announces both
 * facts so the title-bar and status-bar controls redraw themselves.
 *
 * May import: the neutral sidebar contract, the sidebar shell, its view contract, and the typed
 * local event bus. Upholds: the navigation owner changes the shell; chrome controls only request
 * commands and listen to facts.
 */

import { SIDEBAR_CHANGED, eventManager } from '../services/events';
import type { SidebarViewName } from '../contracts';
import { type Sidebar, type SidebarView } from './sidebar';

/** The two independently implemented views the shell can load. */
export interface SidebarViews {
  readonly workspace: SidebarView;
  readonly contents: SidebarView;
}

export class SidebarNavigation {
  constructor(
    private readonly sidebar: Sidebar,
    private readonly views: SidebarViews
  ) {}

  /** Loads the initial Workspace view and announces the controls' starting state. */
  start(): void {
    this.sidebar.show(this.views.workspace);
    this.announce();
  }

  /** Switches to the other view and reveals the sidebar. */
  toggleView(): void {
    const current = this.sidebar.currentView();
    const view: SidebarViewName = current === 'workspace' ? 'contents' : 'workspace';
    this.sidebar.openSidebar();
    this.sidebar.show(this.views[view]);
    this.announce();
  }

  /** Hides or shows the shell without changing its loaded view. */
  toggleVisibility(): void {
    this.sidebar.toggle();
    this.announce();
  }

  private announce(): void {
    void eventManager.emit(SIDEBAR_CHANGED, {
      view: this.sidebar.currentView() ?? 'workspace',
      visible: this.sidebar.isVisible()
    });
  }
}
