/**
 * The Export Manager's data port and its live implementation.
 *
 * Example: `load()` joins Pandoc's kind facts, the installed packages and the active-package map,
 * while `updateTemplates()` persists only that map; the manager never reaches those seams itself.
 *
 * May import: the export and template API seams, the app config and locale text. Upholds: all
 * backend/config I/O happens behind one source that tests can replace as a whole.
 */

import {
  exportKinds,
  restoreExportConfig,
  type ExportKindInfo
} from '../../../api/export';
import { exportTemplates, type TemplateSummary } from '../../../api/templates';
import { configManager } from '../../../services/config_manager';
import { t } from '../../../services/i18n';

export interface ExportManagerSnapshot {
  pandoc: string | null;
  kinds: ExportKindInfo[];
  packages: TemplateSummary[];
  exportTemplates: Record<string, string>;
}

export interface ExportManagerSource {
  load(): Promise<ExportManagerSnapshot>;
  updateTemplates(exportTemplates: Record<string, string>): Promise<void>;
  restoreDefaults(kind: string): Promise<string>;
}

export const liveExportManagerSource: ExportManagerSource = {
  load: async () => {
    const [{ pandoc, kinds }, packages] = await Promise.all([
      exportKinds(),
      exportTemplates()
    ]);
    return {
      pandoc,
      kinds,
      packages,
      exportTemplates: configManager.get()?.export_templates ?? {}
    };
  },
  updateTemplates: async (exportTemplates) => {
    try {
      await configManager.update({ export_templates: exportTemplates });
    } catch (error) {
      throw new Error(
        t('exportManager.selectionFailed', {
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }
  },
  restoreDefaults: async (kind) => await restoreExportConfig(kind)
};
