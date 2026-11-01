/**
 * Preparing a LaTeX package's requested native BibTeX file from the selected citation library.
 *
 * Example: a package whose defaults name `references.bib` receives only the entries cited by
 * `[@smith2020]`; with no selected library and at least one cited key, the export is refused.
 *
 * May import: the bibliography seam, template files, citation extraction and translations.
 * Upholds: native bibliography keys come from the note, never from the package's sample file.
 */

import { readBibliography } from '../../api/bibliography';
import { readTemplateFile, type TemplateSummary } from '../../api/templates';
import { t } from '../../services/i18n';
import {
  citedKeys,
  nativeBibliographyTarget,
  packageCitedBibliography
} from './native_bibliography';

/** The filtered BibTeX a package asks for, its relative destination, and any cited key it lacks. */
export interface NativeBibliographyPlan {
  path: string;
  text: string;
  missing: string[];
}

/**
 * Resolves a selected package's native-BibTeX request, or null when the kind does not ask for one.
 *
 * Example: a package target of `references.bib` and a note citing `[@smith2020]` returns a plan
 * holding only Smith's BibTeX; a null selected library with that citation throws a reader-facing
 * error instead of copying the package's sample bibliography.
 */
export async function nativeBibliographyFor(
  kind: string,
  templateId: string | null,
  templates: TemplateSummary[],
  markdown: string,
  selected: string | null
): Promise<NativeBibliographyPlan | null> {
  if (kind !== 'latex' || templateId === null) {
    return null;
  }
  const template = templates.find((candidate) => candidate.manifest?.id === templateId);
  if (template === undefined) {
    return null;
  }
  const names = new Set(template.files.map((file) => file.name));
  const defaultsName = ['export.yaml', 'defaults.yaml'].find((name) => names.has(name));
  if (defaultsName === undefined) {
    return null;
  }
  const target = nativeBibliographyTarget(await readTemplateFile(templateId, defaultsName));
  if (target === null) {
    return null;
  }
  const keys = citedKeys(markdown);
  if (selected === null) {
    if (keys.length > 0) {
      throw new Error(t('export.bibliographyRequired'));
    }
    return { path: target, text: '', missing: [] };
  }
  const packaged = packageCitedBibliography(await readBibliography(), keys);
  return { path: target, text: packaged.text, missing: packaged.missing };
}
