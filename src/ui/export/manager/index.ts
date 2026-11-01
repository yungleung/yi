/**
 * The Export Manager's modal surface: kind navigation, loading and the current kind page.
 *
 * May import: export/defaults/config seams, the kind page and the floating-surface base. Upholds:
 * the manager renders session-independent export facts and returns focus when it closes.
 */

import {
  exportKinds,
  restoreExportConfig,
  type ExportKindInfo
} from '../../../api/export';
import { exportTemplates, type TemplateSummary } from '../../../api/templates';
import { configManager } from '../../../services/config_manager';
import { t } from '../../../services/i18n';
import { FloatingSurface } from '../../floating/surface';
import { KindPage } from './kind_page';
import {
  defaultsState,
  managerGroups,
  unassignedPackages
} from './rules';
import { kindLabel } from '../templates/kind_label';
import { templateEditorPanel } from '../templates/editor';

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

function button(className: string, label: string, data: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.setAttribute(data, 'true');
  return element;
}

function groupLabel(group: 'documents' | 'presentations' | 'other' | 'unassigned'): string {
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

/** One main-window manager for every export kind's persistent setup. */
export class ExportManager extends FloatingSurface {
  private readonly sidebar: HTMLElement;
  private readonly page: KindPage;
  private readonly status: HTMLDivElement;
  private snapshot: ExportManagerSnapshot | null = null;
  private selectedKind: string | null = null;
  private inspectedId: string | null = null;
  private onClose: (() => void) | null = null;

  constructor(private readonly source: ExportManagerSource = liveExportManagerSource) {
    super([
      'fixed',
      'inset-0',
      'z-[59]',
      'flex',
      'items-center',
      'justify-center',
      'bg-black/30'
    ]);
    this.element.setAttribute('data-export-manager', 'true');

    const panel = document.createElement('div');
    panel.className =
      'relative flex h-[min(48rem,88vh)] w-[min(70rem,94vw)] overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-xl';
    panel.setAttribute('data-export-manager-panel', 'true');
    panel.addEventListener('mousedown', (event) => event.stopPropagation());

    const navigation = document.createElement('aside');
    navigation.className =
      'flex w-64 shrink-0 flex-col border-r border-base-300 bg-base-200/70';
    navigation.setAttribute('data-export-manager-navigation', 'true');
    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 border-b border-base-300 px-3 py-2';
    const heading = document.createElement('h1');
    heading.className = 'flex-1 text-sm font-semibold';
    heading.textContent = t('exportManager.title');
    const close = button('btn btn-ghost btn-xs', '✕', 'data-export-manager-close');
    close.className += ' absolute right-2 top-2 z-10';
    close.setAttribute('aria-label', t('exportManager.close'));
    close.addEventListener('click', () => void this.requestClose());
    header.append(heading);
    this.sidebar = document.createElement('div');
    this.sidebar.className = 'min-h-0 flex-1 overflow-auto p-2';
    this.sidebar.setAttribute('data-export-manager-kinds', 'true');
    navigation.append(header, this.sidebar);

    const content = document.createElement('div');
    content.className = 'flex min-w-0 flex-1 flex-col';
    this.page = new KindPage({
      restoreDefaults: async (kind) => await this.source.restoreDefaults(kind),
      refresh: async () => await this.load(),
      inspect: (id) => {
        this.inspectedId = id;
        this.render();
      },
      activate: (id) => void this.setActivePackage(this.selectedKind ?? '', id),
      packagesChanged: (packages, keepId) => {
        void this.packagesChanged(packages, keepId);
      }
    });
    this.status = document.createElement('div');
    this.status.className = 'min-h-5 border-t border-base-300 px-4 py-1 text-xs text-error';
    this.status.setAttribute('data-export-manager-status', 'true');
    content.append(this.page.element, this.status);
    panel.append(navigation, content, close);
    this.element.append(panel);
    document.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key === 'Escape' &&
          this.isOpen() &&
          templateEditorPanel.isOpen() &&
          !event.isComposing &&
          templateEditorPanel.handleEscape()
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true
    );
  }

  async open(onClose: () => void = () => {}): Promise<void> {
    this.onClose = onClose;
    this.page.resetTransient();
    super.open();
    await this.load();
  }

  async requestClose(): Promise<void> {
    if (templateEditorPanel.isOpen()) {
      await templateEditorPanel.requestClose();
      return;
    }
    this.close();
  }

  close(): void {
    if (templateEditorPanel.isOpen()) {
      return;
    }
    super.close();
    this.selectedKind = null;
    this.inspectedId = null;
    this.snapshot = null;
    const callback = this.onClose;
    this.onClose = null;
    callback?.();
  }

  private async load(): Promise<void> {
    this.status.replaceChildren();
    try {
      this.snapshot = await this.source.load();
      const unassigned = unassignedPackages(
        this.snapshot.kinds,
        this.snapshot.packages
      );
      if (
        this.selectedKind === null ||
        (this.selectedKind !== 'unassigned' &&
          !this.snapshot.kinds.some((kind) => kind.kind === this.selectedKind)) ||
        (this.selectedKind === 'unassigned' && unassigned.length === 0)
      ) {
        this.selectedKind = this.snapshot.kinds[0]?.kind ?? null;
        this.inspectedId = this.snapshot.exportTemplates[this.selectedKind ?? ''] ?? null;
      }
      this.render();
      this.showStandingStatus();
    } catch (error) {
      const message = document.createElement('span');
      message.setAttribute('data-export-manager-error', 'true');
      message.textContent = t('exportManager.libraryFailed', {
        message: error instanceof Error ? error.message : String(error)
      });
      const retry = button('btn btn-ghost btn-xs', t('exportManager.retry'), 'data-export-manager-retry');
      retry.addEventListener('click', () => void this.load());
      this.snapshot = null;
      this.sidebar.replaceChildren();
      this.page.element.replaceChildren();
      this.status.replaceChildren(message, retry);
    }
  }

  private render(): void {
    const snapshot = this.snapshot;
    if (snapshot === null) {
      return;
    }
    this.sidebar.replaceChildren();
    for (const group of managerGroups(snapshot.kinds, snapshot.packages)) {
      const label = document.createElement('p');
      label.className = 'px-2 pb-1 pt-3 text-[0.65rem] font-semibold uppercase tracking-wide opacity-60';
      label.textContent = groupLabel(group.group);
      this.sidebar.append(label);
      for (const row of group.rows) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className =
          row.info.kind === this.selectedKind
            ? 'mb-1 block w-full rounded bg-primary/10 px-2 py-2 text-left ring-1 ring-primary/30'
            : 'mb-1 block w-full rounded px-2 py-2 text-left hover:bg-base-300';
        item.dataset.exportManagerKind = row.info.kind;
        item.setAttribute(
          'aria-current',
          String(row.info.kind === this.selectedKind)
        );
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
          this.selectedKind = row.info.kind;
          this.inspectedId = snapshot.exportTemplates[row.info.kind] ?? null;
          this.render();
        });
        this.sidebar.append(item);
      }
    }

    const unassigned = unassignedPackages(snapshot.kinds, snapshot.packages);
    if (unassigned.length > 0) {
      const label = document.createElement('p');
      label.className =
        'px-2 pb-1 pt-3 text-[0.65rem] font-semibold uppercase tracking-wide opacity-60';
      label.textContent = groupLabel('unassigned');
      this.sidebar.append(label);
      const item = document.createElement('button');
      item.type = 'button';
      item.className =
        this.selectedKind === 'unassigned'
          ? 'mb-1 block w-full rounded bg-primary/10 px-2 py-2 text-left ring-1 ring-primary/30'
          : 'mb-1 block w-full rounded px-2 py-2 text-left hover:bg-base-300';
      item.dataset.exportManagerKind = 'unassigned';
      item.setAttribute('aria-current', String(this.selectedKind === 'unassigned'));
      const name = document.createElement('span');
      name.className = 'block truncate text-sm font-medium';
      name.textContent = t('exportManager.group.unassigned');
      const count = document.createElement('span');
      count.className = 'block text-[0.7rem] opacity-60';
      count.textContent = String(unassigned.length);
      item.append(name, count);
      item.addEventListener('click', () => {
        this.selectedKind = 'unassigned';
        this.inspectedId = null;
        this.render();
      });
      this.sidebar.append(item);
    }

    if (this.selectedKind === 'unassigned') {
      this.page.updateUnassigned(unassigned);
      return;
    }

    const info = snapshot.kinds.find((kind) => kind.kind === this.selectedKind);
    if (info === undefined) {
      this.page.element.replaceChildren();
      return;
    }
    const activeId = snapshot.exportTemplates[info.kind] ?? null;
    const row = managerGroups(snapshot.kinds, snapshot.packages)
      .flatMap((group) => group.rows)
      .find((candidate) => candidate.info.kind === info.kind);
    this.page.update({
      info,
      activeId,
      activePackage:
        snapshot.packages.find((summary) => summary.id === activeId) ?? null,
      inspectedId: this.inspectedId,
      packages: row?.packages ?? [],
      pandoc: snapshot.pandoc
    });
  }

  private async setActivePackage(kind: string, id: string | null): Promise<void> {
    if (this.snapshot === null || kind === '') {
      return;
    }
    const remembered = { ...this.snapshot.exportTemplates };
    if (id === null) {
      delete remembered[kind];
    } else {
      remembered[kind] = id;
    }
    try {
      await this.source.updateTemplates(remembered);
      this.snapshot.exportTemplates = remembered;
      this.inspectedId = id;
      this.showStandingStatus();
      this.render();
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  private async packagesChanged(
    packages: TemplateSummary[],
    keepId: string | null
  ): Promise<void> {
    if (this.snapshot === null) {
      return;
    }
    const kind = this.selectedKind;
    const activeId = kind === null ? null : this.snapshot.exportTemplates[kind] ?? null;
    const remaining = new Set(packages.map((summary) => summary.id));
    const removed = new Set(
      this.snapshot.packages
        .map((summary) => summary.id)
        .filter((id) => !remaining.has(id))
    );
    const remembered = { ...this.snapshot.exportTemplates };
    let selectionsChanged = false;
    if (
      kind !== null &&
      kind !== 'unassigned' &&
      activeId !== null &&
      removed.has(activeId)
    ) {
      delete remembered[kind];
      selectionsChanged = true;
    }
    if (kind === 'unassigned' && removed.size > 0) {
      for (const [selectedKind, id] of Object.entries(remembered)) {
        if (removed.has(id)) {
          delete remembered[selectedKind];
          selectionsChanged = true;
        }
      }
    }
    if (selectionsChanged) {
      try {
        await this.source.updateTemplates(remembered);
        this.snapshot.exportTemplates = remembered;
      } catch (error) {
        this.snapshot.packages = packages;
        this.inspectedId = keepId;
        this.render();
        this.status.textContent = error instanceof Error ? error.message : String(error);
        return;
      }
    }
    this.snapshot.packages = packages;
    this.inspectedId = keepId;
    if (
      this.selectedKind === 'unassigned' &&
      unassignedPackages(this.snapshot.kinds, packages).length === 0
    ) {
      this.selectedKind = this.snapshot.kinds[0]?.kind ?? null;
      this.inspectedId = this.snapshot.exportTemplates[this.selectedKind ?? ''] ?? null;
    }
    this.render();
    this.showStandingStatus();
  }

  /** Restores the selected kind's non-actionable state after replacing a transient error. */
  private showStandingStatus(): void {
    this.status.replaceChildren();
    if (this.snapshot?.pandoc === null) {
      this.status.textContent = t('exportManager.pandocMissing');
    }
  }

  protected mountForShow(): void {
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
  }

  protected placeForShow(): void {}
}

export const exportManager = new ExportManager();

export { registerExportManagerCommand } from './flow';
export type { ExportManagerHost } from './flow';
export { KindPage } from './kind_page';
export type { KindPageHandlers, KindPageState } from './kind_page';
export {
  defaultsActionAvailability,
  defaultsState,
  managerGroups,
  packageActionAvailability,
  unassignedPackages
} from './rules';
export type {
  DefaultsActionAvailability,
  DefaultsState,
  ManagerGroup,
  ManagerKindRow,
  PackageActionAvailability
} from './rules';
