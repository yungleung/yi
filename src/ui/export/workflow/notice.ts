/**
 * Telling the reader what an otherwise successful export produced and what it could not include.
 *
 * Example: the file exists and gets an "Exported" hint, while an unfetchable picture and a missing
 * bibliography key are then shown as messages in the app's own words.
 *
 * May import: hints, messages, translations and the export result types. Upholds: success and
 * warnings are reported only after the conversion has returned.
 */

import type { ExportOutcome } from '../../../api/export';
import { showHint } from '../../../services/hints';
import { t } from '../../../services/i18n';
import { notify } from '../../../services/messages';
import { fileName } from '../../../services/workspace';
import type { NativeBibliographyPlan } from './bibliography';

/**
 * Reports one completed export, preserving the current hint-then-warning order.
 *
 * Example: `kind: 'pdf'`, `outputPath: '/notes/draft.pdf'`, and one Pandoc warning produce a
 * "draft.pdf" success hint followed by one Export message containing the warning.
 */
export function reportExport(input: {
  kind: string;
  outputPath: string;
  unfetched: string[];
  nativeBibliography: NativeBibliographyPlan | null;
  outcome: ExportOutcome;
}): void {
  const written = fileName(input.outputPath);
  showHint(
    input.kind === 'html' || input.kind === 'revealjs'
      ? t('export.doneFolder', { folder: input.outputPath })
      : t('export.done', { file: written }),
    null
  );
  if (input.unfetched.length > 0) {
    notify(
      'Export',
      new Error(
        input.unfetched
          .slice(0, 4)
          .map((url) => t('export.pictureNotFetched', { url }))
          .join('\n')
      )
    );
  }
  const warnings = [...input.outcome.warnings];
  if (input.nativeBibliography !== null && input.nativeBibliography.missing.length > 0) {
    warnings.push(
      t('export.bibliographyMissing', {
        keys: input.nativeBibliography.missing.join(', ')
      })
    );
  }
  if (warnings.length > 0) {
    notify('Export', new Error(warnings.slice(0, 4).join('\n')));
  }
}
