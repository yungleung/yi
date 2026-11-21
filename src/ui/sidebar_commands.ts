/**
 * Registers the sidebar action used by native View menus on Windows and Linux.
 *
 * Example: View → Toggle Sidebar runs `view:toggleSidebar`, while status-bar chrome requests
 * `view:toggleSidebarView`; both reach the one navigation owner.
 *
 * May import: the command runtime and the sidebar component. Upholds: native
 * menu presentation reaches the sidebar through the app-wide command path.
 */

import { registerCommand } from '../commands/runtime';
import type { SidebarNavigation } from './sidebar_navigation';

export function registerSidebarCommands(navigation: SidebarNavigation): void {
  registerCommand({
    id: 'view:toggleSidebar',
    run: () => {
      navigation.toggleVisibility();
      return null;
    }
  });
  registerCommand({
    id: 'view:toggleSidebarView',
    run: () => {
      navigation.toggleView();
      return null;
    }
  });
}
