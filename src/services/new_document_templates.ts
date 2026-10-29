/**
 * The template packages a new note may borrow metadata from.
 *
 * A package participates when it is readable and carries a root `metadata.yaml`. The export choice
 * is deliberately not read or written here: choosing a template for one new note does not choose
 * the template for its later export.
 *
 * May import: the template command seam. Upholds: the window names a package by id, and a broken
 * or reference-only package never becomes a new-note choice.
 */

import { exportTemplates, readTemplateFile } from '../api/templates';
import { t } from './i18n';
import { BUILT_IN_NOTE_METADATA, BUILTIN_NOTE_TEMPLATES } from './new_document_builtins';

export interface NewNoteTemplate {
  id: string;
  name: string;
  kind: string;
  source: 'built-in' | 'package';
}

export async function newNoteTemplates(): Promise<NewNoteTemplate[]> {
  const packages = await exportTemplates();
  return [
    ...BUILTIN_NOTE_TEMPLATES.map((template) => ({
      id: template.id,
      name: t(template.nameKey),
      kind: template.kind,
      source: 'built-in' as const
    })),
    ...packages
      .filter(
        (summary) =>
          summary.manifest !== null &&
          summary.files.some((file) => file.name === 'metadata.yaml')
      )
      .map((summary) => ({
        id: summary.id,
        name: summary.manifest?.name ?? summary.id,
        kind: summary.manifest?.kind ?? '',
        source: 'package' as const
      }))
  ];
}

export async function newNoteMetadata(templateId: string): Promise<string> {
  return BUILT_IN_NOTE_METADATA[templateId] ?? await readTemplateFile(templateId, 'metadata.yaml');
}
