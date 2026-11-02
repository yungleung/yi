/**
 * The native menu's Export Manager command.
 *
 * May import: the command registry and the manager surface. Upholds: one menu event reaches one
 * command, and closing the manager returns keyboard focus through the editor host.
 */

import { registerCommand } from '../../../commands/runtime';
import type { ExportManager } from './index';

export interface ExportManagerHost {
  focusEditor(): void;
}

export function registerExportManagerCommand(
  host: ExportManagerHost,
  manager: ExportManager
): void {
  registerCommand({
    id: 'export:manageTemplates',
    run: async () => {
      await manager.open(host.focusEditor);
      return null;
    }
  });
}
