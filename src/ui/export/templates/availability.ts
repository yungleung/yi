/**
 * Which template-package actions are available for one export kind.
 *
 * Example: a readable PDF package enables Use and Test PDF when pandoc is present; an unreadable
 * package remains inspectable and removable but cannot be selected or edited.
 *
 * May import: export and template summary vocabulary. Upholds: package controls are derived from
 * package facts, not owned by the Export Manager that happens to render one of them.
 */

import type { ExportKindInfo } from '../../../api/export';
import type { TemplateSummary } from '../../../api/templates';

export interface PackageActionAvailability {
  importPackage: boolean;
  createPackage: boolean;
  use: boolean;
  details: boolean;
  duplicate: boolean;
  edit: boolean;
  validate: boolean;
  testPdf: boolean;
  remove: boolean;
}

export function packageActionAvailability(
  info: ExportKindInfo,
  pandoc: string | null,
  inspected: TemplateSummary | null
): PackageActionAvailability {
  const supported = info.template_mode !== 'none';
  const manifest = inspected?.manifest ?? null;
  const readable = manifest !== null;
  const broken = inspected?.error !== null && inspected?.error !== undefined;
  const usable = readable && !broken;
  const compatible = usable && manifest.kind === info.kind;
  const hasEditableFile = inspected?.files.some((file) => file.editable) === true;
  return {
    importPackage: supported,
    createPackage: supported && pandoc !== null,
    use: compatible,
    details: supported && inspected !== null,
    duplicate: supported && usable,
    edit: supported && usable && hasEditableFile,
    validate: supported && usable && pandoc !== null,
    testPdf:
      supported &&
      usable &&
      pandoc !== null &&
      manifest.kind === 'pdf',
    remove: supported && inspected !== null
  };
}
