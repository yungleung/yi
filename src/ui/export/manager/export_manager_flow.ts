/**
 * The native menu's Export Manager command.
 *
 * May import: the command registry and the manager surface. Upholds: one menu event reaches one
 * command, and closing the manager returns keyboard focus through the editor host.
 */

import { registerCommand } from '../../markdown/commands/registry';
import { exportManager } from './export_manager';

export interface ExportManagerHost {
  focusEditor(): void;
}

export function registerExportManagerCommand(host: ExportManagerHost): void {
  registerCommand({
    id: 'export:manageTemplates',
    run: () => void exportManager.open(host.focusEditor)
  });
}
