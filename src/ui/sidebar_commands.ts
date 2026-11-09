/**
 * Registers the sidebar action used by native View menus on Windows and Linux.
 *
 * Example: View → Toggle Sidebar runs `view:toggleSidebar`, which calls this
 * window's own sidebar rather than a second visibility flag.
 *
 * May import: the command runtime and the sidebar component. Upholds: native
 * menu presentation reaches the sidebar through the app-wide command path.
 */

import { registerCommand } from '../commands/runtime';
import type { Sidebar } from './sidebar';

export function registerSidebarCommand(sidebar: Sidebar): void {
  registerCommand({
    id: 'view:toggleSidebar',
    run: () => {
      sidebar.toggle();
      return null;
    }
  });
}
