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

export interface NewNoteTemplate {
  id: string;
  name: string;
  kind: string;
}

export async function newNoteTemplates(): Promise<NewNoteTemplate[]> {
  const packages = await exportTemplates();
  return packages
    .filter(
      (summary) =>
        summary.manifest !== null &&
        summary.files.some((file) => file.name === 'metadata.yaml')
    )
    .map((summary) => ({
      id: summary.id,
      name: summary.manifest?.name ?? summary.id,
      kind: summary.manifest?.kind ?? ''
    }));
}

export async function newNoteMetadata(templateId: string): Promise<string> {
  return await readTemplateFile(templateId, 'metadata.yaml');
}
