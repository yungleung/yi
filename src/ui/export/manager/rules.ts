/**
 * The Export Manager's pure rules: kind grouping, package compatibility, action availability and
 * each kind's defaults-file state.
 *
 * May import: export-kind/template vocabulary types only. Upholds: grouping, compatibility,
 * action availability and the defaults-file state are decided once for every renderer.
 */
import type { ExportGroup, ExportKindInfo } from '../../../api/export';
import type { TemplateSummary } from '../../../api/templates';

export interface ManagerKindRow {
  info: ExportKindInfo;
  packages: TemplateSummary[];
  broken: number;
}

export interface ManagerGroup {
  group: ExportGroup;
  rows: ManagerKindRow[];
}

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

export interface DefaultsActionAvailability {
  edit: boolean;
  restore: boolean;
}

const GROUPS: readonly ExportGroup[] = ['documents', 'presentations', 'other'];

export function managerGroups(
  kinds: ExportKindInfo[],
  packages: TemplateSummary[]
): ManagerGroup[] {
  return GROUPS.map((group) => ({
    group,
    rows: kinds
      .filter((kind) => kind.group === group)
      .map((info) => {
        const compatible = packages.filter(
          (summary) => summary.manifest?.kind === info.kind
        );
        return {
          info,
          packages: compatible,
          broken: compatible.filter((summary) => summary.error !== null).length
        };
      })
  })).filter((group) => group.rows.length > 0);
}

export function unassignedPackages(
  kinds: ExportKindInfo[],
  packages: TemplateSummary[]
): TemplateSummary[] {
  const known = new Set(kinds.map((kind) => kind.kind));
  return packages.filter(
    (summary) => summary.manifest === null || !known.has(summary.manifest.kind)
  );
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

export function defaultsActionAvailability(
  info: ExportKindInfo
): DefaultsActionAvailability {
  return {
    edit: info.needs_pandoc && info.config_path !== '',
    restore:
      info.needs_pandoc &&
      info.config_path !== '' &&
      info.config_exists &&
      !info.config_is_shipped
  };
}

export type DefaultsState = 'none' | 'not-created' | 'shipped' | 'customized';

/** The one reading of a kind's defaults-file state. */
export function defaultsState(info: ExportKindInfo): DefaultsState {
  if (!info.needs_pandoc || info.config_path === '') {
    return 'none';
  }
  if (!info.config_exists) {
    return 'not-created';
  }
  return info.config_is_shipped ? 'shipped' : 'customized';
}
