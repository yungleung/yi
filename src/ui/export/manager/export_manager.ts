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
import { defaultsState, KindPage } from './kind_page';
import { managerGroups } from './manager_rules';
import { kindLabel } from '../templates/kind_label';

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
    await configManager.update({ export_templates: exportTemplates });
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
  private onClose: (() => void) | null = null;

  constructor(private readonly source: ExportManagerSource = liveExportManagerSource) {
    super([
      'fixed',
      'inset-0',
      'z-[65]',
      'flex',
      'items-center',
      'justify-center',
      'bg-black/30'
    ]);
    this.element.setAttribute('data-export-manager', 'true');

    const panel = document.createElement('div');
    panel.className =
      'flex h-[min(48rem,88vh)] w-[min(70rem,94vw)] overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-xl';
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
    close.setAttribute('aria-label', t('exportManager.close'));
    close.addEventListener('click', () => void this.requestClose());
    header.append(heading, close);
    this.sidebar = document.createElement('div');
    this.sidebar.className = 'min-h-0 flex-1 overflow-auto p-2';
    this.sidebar.setAttribute('data-export-manager-kinds', 'true');
    navigation.append(header, this.sidebar);

    const content = document.createElement('div');
    content.className = 'flex min-w-0 flex-1 flex-col';
    this.page = new KindPage({
      restoreDefaults: async (kind) => await this.source.restoreDefaults(kind),
      refresh: async () => await this.load()
    });
    this.status = document.createElement('div');
    this.status.className = 'min-h-5 border-t border-base-300 px-4 py-1 text-xs text-error';
    this.status.setAttribute('data-export-manager-status', 'true');
    content.append(this.page.element, this.status);
    panel.append(navigation, content);
    this.element.append(panel);
  }

  async open(onClose: () => void = () => {}): Promise<void> {
    this.onClose = onClose;
    super.open();
    await this.load();
  }

  async requestClose(): Promise<void> {
    this.close();
  }

  close(): void {
    super.close();
    this.selectedKind = null;
    this.snapshot = null;
    const callback = this.onClose;
    this.onClose = null;
    callback?.();
  }

  private async load(): Promise<void> {
    this.status.replaceChildren();
    try {
      this.snapshot = await this.source.load();
      if (
        this.selectedKind === null ||
        !this.snapshot.kinds.some((kind) => kind.kind === this.selectedKind)
      ) {
        this.selectedKind = this.snapshot.kinds[0]?.kind ?? null;
      }
      this.render();
      if (this.snapshot.pandoc === null) {
        this.status.textContent = t('exportManager.pandocMissing');
      }
    } catch (error) {
      const message = document.createElement('span');
      message.textContent = t('exportManager.libraryFailed', {
        message: error instanceof Error ? error.message : String(error)
      });
      const retry = button('btn btn-ghost btn-xs', t('exportManager.retry'), 'data-export-manager-retry');
      retry.addEventListener('click', () => void this.load());
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
          row.broken > 0 ? String(row.broken) : null
        ]
          .filter((part): part is string => part !== null)
          .join(' · ');
        item.append(name, details);
        item.addEventListener('click', () => {
          this.selectedKind = row.info.kind;
          this.render();
        });
        this.sidebar.append(item);
      }
    }

    const info = snapshot.kinds.find((kind) => kind.kind === this.selectedKind);
    if (info === undefined) {
      this.page.element.replaceChildren();
      return;
    }
    const activeId = snapshot.exportTemplates[info.kind] ?? null;
    this.page.update({
      info,
      activeId,
      activePackage:
        snapshot.packages.find((summary) => summary.id === activeId) ?? null,
      packageCount: snapshot.packages.filter(
        (summary) => summary.manifest?.kind === info.kind
      ).length
    });
  }

  protected mountForShow(): void {
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
  }

  protected placeForShow(): void {}
}

export const exportManager = new ExportManager();
