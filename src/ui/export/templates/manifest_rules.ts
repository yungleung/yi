/**
 * The fields a `template.json` must carry, read the same way by the window and by a Node check.
 *
 * The manifest is app-written, but a package is a folder a reader can copy or edit, so the window
 * needs a shape test that does not trust the file. Rust holds the authority for mode and kind; this
 * says only that the agreed fields are there and have the agreed types.
 *
 * May import: nothing. Upholds: one written shape for the manifest, shared by the Rust test and the
 * Node check that read the same fixture.
 */

import type { TemplateManifest } from '../../../api/templates';

export const MANIFEST_SCHEMA = 1;

const KINDS = ['html', 'latex', 'pdf', 'epub', 'docx', 'odt'];
const MODES = ['template', 'wrapper', 'reference-doc'];

export function manifestShapeIssues(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return ['the manifest is not an object'];
  }
  const manifest = value as Partial<TemplateManifest>;
  const issues: string[] = [];
  if (manifest.schema !== MANIFEST_SCHEMA) {
    issues.push(`schema is ${String(manifest.schema)}, not ${MANIFEST_SCHEMA}`);
  }
  for (const key of ['id', 'name', 'kind'] as const) {
    if (typeof manifest[key] !== 'string' || (manifest[key] as string).trim() === '') {
      issues.push(`${key} is not a name`);
    }
  }
  if (!KINDS.includes(manifest.kind ?? '')) {
    issues.push(`kind is ${String(manifest.kind)}`);
  }
  if (!MODES.includes(manifest.mode ?? '')) {
    issues.push(`mode is ${String(manifest.mode)}`);
  }
  const origin = manifest.origin;
  if (typeof origin !== 'object' || origin === null || typeof origin.type !== 'string') {
    issues.push('origin.type is missing');
  }
  if (typeof manifest.template !== 'string' && manifest.template !== null) {
    issues.push('template is neither a name nor null');
  }
  if (typeof manifest.reference_doc !== 'string' && manifest.reference_doc !== null) {
    issues.push('reference_doc is neither a name nor null');
  }
  for (const key of ['assets', 'deliver'] as const) {
    if (!Array.isArray(manifest[key]) || manifest[key]?.some((entry) => typeof entry !== 'string')) {
      issues.push(`${key} is not a list of names`);
    }
  }
  return issues;
}
