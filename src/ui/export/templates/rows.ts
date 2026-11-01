/**
 * Builds the package rows shared by the card chooser and Export Manager.
 *
 * Example: a warning package in the active kind renders its title, “In use”
 * badge and warning facts; a package from another kind stays visible but muted.
 *
 * May import: package summaries, labels and translations. Upholds: rows expose
 * the same active/inspected data attributes and inspection callback for every
 * host; they never load, mutate or persist a package.
 */

import type { TemplateSummary } from '../../../api/templates';
import { t } from '../../../services/i18n';
import { kindLabel } from '../kind_label';

export interface PackageRowState {
  kind: string;
  activeId: string | null;
  inspectedId: string | null;
}

/** The row for Pandoc's own defaults, with no package selected. */
export function createDefaultPackageRow(
  state: PackageRowState,
  inspect: (id: string | null) => void
): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = `rounded border px-2 py-1 text-left text-sm ${
    state.inspectedId === null
      ? 'border-primary bg-primary/10'
      : 'border-base-300 hover:bg-base-300'
  }`;
  row.setAttribute('data-template-default', 'true');
  row.dataset.templateActive = String(state.activeId === null);
  row.dataset.templateInspected = String(state.inspectedId === null);
  row.textContent = t('template.pandocDefault');
  row.addEventListener('click', () => inspect(null));
  return row;
}

/** One package row, including compatibility, active and provenance facts. */
export function createPackageRow(
  summary: TemplateSummary,
  state: PackageRowState,
  inspect: (id: string | null) => void
): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  const compatible =
    summary.manifest !== null &&
    summary.manifest.kind === state.kind &&
    summary.error === null;
  row.className = `rounded border px-2 py-1 text-left text-sm ${
    state.inspectedId === summary.id
      ? 'border-primary bg-primary/10'
      : 'border-base-300 hover:bg-base-300'
  } ${compatible ? '' : 'opacity-65'}`;
  row.setAttribute('data-template-package', summary.id);
  row.setAttribute('data-template-package-id', summary.id);
  row.dataset.templateActive = String(state.activeId === summary.id);
  row.dataset.templateInspected = String(state.inspectedId === summary.id);

  const name = document.createElement('span');
  name.className = 'block truncate font-medium';
  name.textContent = summary.manifest?.name ?? summary.id;
  if (state.activeId === summary.id) {
    const active = document.createElement('span');
    active.className = 'ml-2 text-xs text-success';
    active.textContent = t('template.inUse');
    name.append(active);
  }
  const facts = document.createElement('span');
  facts.className = 'block truncate text-xs opacity-60';
  facts.textContent =
    summary.error !== null
      ? summary.error
      : [
          kindLabel(summary.manifest?.kind ?? ''),
          modeLabel(summary.manifest?.mode ?? ''),
          summary.manifest?.origin.license,
          summary.manifest?.origin.source
        ]
          .filter((fact): fact is string => typeof fact === 'string' && fact !== '')
          .join(' · ');
  row.append(name, facts);
  row.addEventListener('click', () => inspect(summary.id));
  return row;
}

function modeLabel(mode: string): string {
  if (mode === 'template') {
    return t('template.mode.template');
  }
  if (mode === 'wrapper') {
    return t('template.mode.wrapper');
  }
  return t('template.mode.referenceDoc');
}
