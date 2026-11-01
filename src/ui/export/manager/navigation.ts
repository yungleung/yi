/**
 * The Export Manager's kind sidebar: groups, kind rows, active-package summaries and selection.
 *
 * Example: selecting the PDF row calls `select({ kind: 'pdf', inspectedId: 'prl' })`; the
 * manager owns what that selection means and rerenders the page.
 *
 * May import: export/template summary types, locale text, the template kind label and the
 * manager's pure rules. Upholds: navigation renders facts and reports intent; it never persists a
 * selection or reads a backend.
 */

import type { ExportKindInfo } from '../../../api/export';
import type { TemplateSummary } from '../../../api/templates';
import { t } from '../../../services/i18n';
import { kindLabel } from '../templates';
import {
  defaultsState,
  managerGroups,
  unassignedPackages,
  type ManagerGroup
} from './rules';

export interface ManagerNavigationSnapshot {
  kinds: ExportKindInfo[];
  packages: TemplateSummary[];
  exportTemplates: Record<string, string>;
}

export interface ManagerNavigationSelection {
  kind: string;
  inspectedId: string | null;
}

export interface ManagerNavigationResult {
  groups: ManagerGroup[];
  unassigned: TemplateSummary[];
}

type NavigationGroup = ManagerGroup['group'] | 'unassigned';

interface RenderManagerNavigationOptions {
  sidebar: HTMLElement;
  snapshot: ManagerNavigationSnapshot;
  selectedKind: string | null;
  select(selection: ManagerNavigationSelection): void;
}

function groupLabel(group: NavigationGroup): string {
  switch (group) {
    case 'documents':
      return t('exportManager.group.documents');
    case 'presentations':
      return t('exportManager.group.presentations');
    case 'other':
      return t('exportManager.group.other');
    case 'unassigned':
      return t('exportManager.group.unassigned');
  }
}

function selectedClass(selected: boolean): string {
  return selected
    ? 'mb-1 block w-full rounded bg-primary/10 px-2 py-2 text-left ring-1 ring-primary/30'
    : 'mb-1 block w-full rounded px-2 py-2 text-left hover:bg-base-300';
}

function appendGroupLabel(sidebar: HTMLElement, group: NavigationGroup): void {
  const label = document.createElement('p');
  label.className = 'px-2 pb-1 pt-3 text-[0.65rem] font-semibold uppercase tracking-wide opacity-60';
  label.textContent = groupLabel(group);
  sidebar.append(label);
}

export function renderManagerNavigation({
  sidebar,
  snapshot,
  selectedKind,
  select
}: RenderManagerNavigationOptions): ManagerNavigationResult {
  const groups = managerGroups(snapshot.kinds, snapshot.packages);
  const unassigned = unassignedPackages(snapshot.kinds, snapshot.packages);
  sidebar.replaceChildren();

  for (const group of groups) {
    appendGroupLabel(sidebar, group.group);
    for (const row of group.rows) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = selectedClass(row.info.kind === selectedKind);
      item.dataset.exportManagerKind = row.info.kind;
      item.setAttribute('aria-current', String(row.info.kind === selectedKind));

      const name = document.createElement('span');
      name.className = 'block truncate text-sm font-medium';
      name.textContent = kindLabel(row.info.kind);

      const activeId = snapshot.exportTemplates[row.info.kind] ?? null;
      const active = snapshot.packages.find((summary) => summary.id === activeId);
      const details = document.createElement('span');
      details.className = 'block truncate text-[0.7rem] opacity-60';
      const state = defaultsState(row.info);
      details.textContent = [
        activeId === null
          ? t('template.pandocDefault')
          : active?.manifest?.name ??
            t('exportManager.missingPackage', { id: activeId }),
        state === 'none'
          ? null
          : state === 'not-created'
            ? t('exportManager.notCreated')
            : state === 'customized'
              ? t('exportManager.customized')
              : t('exportManager.shipped'),
        row.broken > 0
          ? t('exportManager.brokenCount', { count: row.broken })
          : null
      ]
        .filter((part): part is string => part !== null)
        .join(' · ');
      item.append(name, details);
      item.addEventListener('click', () => {
        select({
          kind: row.info.kind,
          inspectedId: snapshot.exportTemplates[row.info.kind] ?? null
        });
      });
      sidebar.append(item);
    }
  }

  if (unassigned.length > 0) {
    appendGroupLabel(sidebar, 'unassigned');
    const item = document.createElement('button');
    item.type = 'button';
    item.className = selectedClass(selectedKind === 'unassigned');
    item.dataset.exportManagerKind = 'unassigned';
    item.setAttribute('aria-current', String(selectedKind === 'unassigned'));

    const name = document.createElement('span');
    name.className = 'block truncate text-sm font-medium';
    name.textContent = t('exportManager.group.unassigned');
    const count = document.createElement('span');
    count.className = 'block text-[0.7rem] opacity-60';
    count.textContent = String(unassigned.length);
    item.append(name, count);
    item.addEventListener('click', () => {
      select({ kind: 'unassigned', inspectedId: null });
    });
    sidebar.append(item);
  }

  return { groups, unassigned };
}
