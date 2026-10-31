/**
 * One export kind's management page: its effective setup, defaults file and package area.
 *
 * May import: export-kind/template facts, the defaults editor, prompt and catalogue. Upholds: the
 * page renders from facts supplied by the manager and writes only through the existing defaults
 * editor or an injected restore action.
 */

import type { ExportKindInfo } from '../../../api/export';
import type { TemplateSummary } from '../../../api/templates';
import { t } from '../../../services/i18n';
import { notify } from '../../../services/messages';
import { BaseComponent } from '../../component';
import { prompt } from '../../prompt';
import { defaultsActionAvailability } from './manager_rules';
import { kindLabel } from '../templates/kind_label';
import { templateEditorPanel } from '../templates/editor';
import { TemplatePackageBrowser } from '../templates/package_browser';

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

export interface KindPageHandlers {
  restoreDefaults(kind: string): Promise<string>;
  refresh(): Promise<void>;
  inspect(id: string | null): void;
  activate(id: string | null): void;
  packagesChanged(packages: TemplateSummary[], keepId: string | null): void;
}

export interface KindPageState {
  info: ExportKindInfo;
  activeId: string | null;
  activePackage: TemplateSummary | null;
  inspectedId: string | null;
  packages: TemplateSummary[];
  pandoc: string | null;
}

function paragraph(text: string, className: string, data?: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  if (data !== undefined) {
    element.setAttribute(data, 'true');
  }
  return element;
}

/** The right-hand side of the export manager. */
export class KindPage extends BaseComponent {
  private readonly packageBrowser: TemplatePackageBrowser;

  constructor(private readonly handlers: KindPageHandlers) {
    super('section', ['min-h-0', 'flex-1', 'overflow-auto', 'p-5']);
    this.element.setAttribute('data-export-manager-page', 'true');
    this.packageBrowser = new TemplatePackageBrowser({
      inspect: (id) => this.handlers.inspect(id),
      primary: (id) => this.handlers.activate(id),
      changed: (packages, keepId) =>
        this.handlers.packagesChanged(packages, keepId)
    });
  }

  update(state: KindPageState): void {
    const { info } = state;
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold';
    title.textContent = kindLabel(info.kind);
    const summary = document.createElement('section');
    summary.className = 'mt-4 rounded-lg border border-base-300 bg-base-100 p-4';
    summary.setAttribute('data-export-manager-summary', 'true');
    const summaryTitle = document.createElement('h3');
    summaryTitle.className = 'text-sm font-semibold';
    summaryTitle.textContent = t('exportManager.summary');
    const active = paragraph(
      state.activeId === null
        ? t('template.pandocDefault')
        : state.activePackage?.manifest?.name ??
          t('exportManager.missingPackage', { id: state.activeId }),
      'mt-2 text-sm'
    );
    active.setAttribute('data-export-manager-active-package', 'true');
    const stateWord = defaultsState(info);
    const defaults = paragraph(
      stateWord === 'none'
        ? t('exportManager.noConversionSettings')
        : stateWord === 'not-created'
          ? t('exportManager.notCreated')
          : stateWord === 'customized'
            ? t('exportManager.customized')
            : t('exportManager.shipped'),
      'mt-1 text-xs opacity-70'
    );
    defaults.setAttribute('data-export-manager-defaults-state', 'true');
    summary.append(summaryTitle, active, defaults);

    const defaultsSection = this.defaultsSection(info);
    const templatesSection = this.templatesSection(state);
    this.element.replaceChildren(title, summary, defaultsSection, templatesSection);
  }

  /** Clears state that belongs to one opening of the manager. */
  resetTransient(): void {
    this.packageBrowser.resetTransient();
  }

  private defaultsSection(info: ExportKindInfo): HTMLElement {
    const section = document.createElement('section');
    section.className = 'mt-4 rounded-lg border border-base-300 bg-base-100 p-4';
    section.setAttribute('data-export-manager-defaults', 'true');
    const title = document.createElement('h3');
    title.className = 'text-sm font-semibold';
    title.textContent = t('exportManager.defaults');
    section.append(title);
    if (!info.needs_pandoc || info.config_path === '') {
      section.append(
        paragraph(t('exportManager.noConversionSettings'), 'mt-2 text-xs opacity-70')
      );
      return section;
    }

    const path = document.createElement('code');
    path.className = 'mt-2 block break-all text-xs';
    path.textContent = info.config_exists
      ? info.config_path
      : t('export.configNew', { path: info.config_path });
    path.setAttribute('data-export-manager-defaults-path', 'true');
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex flex-wrap gap-2';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn-primary btn-sm';
    edit.textContent = t('exportManager.editDefaults');
    edit.setAttribute('data-export-manager-edit-defaults', 'true');
    edit.addEventListener('click', () => {
      void templateEditorPanel.openDefaults(
        info.kind,
        kindLabel(info.kind),
        () => void this.handlers.refresh()
      );
    });
    actions.append(edit);

    const availability = defaultsActionAvailability(info);
    if (availability.restore) {
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'btn btn-ghost btn-sm';
      restore.textContent = t('exportManager.restoreDefaults');
      restore.setAttribute('data-export-manager-restore-defaults', 'true');
      restore.addEventListener('click', () => void this.restore(info));
      actions.append(restore);
    }
    section.append(path, actions);
    return section;
  }

  private templatesSection(state: KindPageState): HTMLElement {
    const section = document.createElement('section');
    section.className = 'mt-4 rounded-lg border border-base-300 bg-base-100 p-4';
    section.setAttribute('data-export-manager-templates', 'true');
    const title = document.createElement('h3');
    title.className = 'text-sm font-semibold';
    title.textContent = t('exportManager.templates');
    section.append(title);
    if (state.info.template_mode === 'none') {
      section.append(
        paragraph(t('exportManager.noTemplateSupport'), 'mt-2 text-xs opacity-70')
      );
      return section;
    }
    this.packageBrowser.update({
      info: state.info,
      packages: state.packages,
      activeId: state.activeId,
      inspectedId: state.inspectedId,
      pandoc: state.pandoc,
      primaryLabel: t('template.use')
    });
    section.append(this.packageBrowser.element);
    return section;
  }

  private async restore(info: ExportKindInfo): Promise<void> {
    const agreed = await prompt.ask({
      title: t('exportManager.defaults'),
      message: t('export.replaceQuestion', { path: info.config_path }),
      yes: t('exportManager.restoreDefaults'),
      no: t('export.cancel')
    });
    if (!agreed) {
      return;
    }
    try {
      await this.handlers.restoreDefaults(info.kind);
      await this.handlers.refresh();
    } catch (error) {
      notify('Export Manager', error);
    }
  }
}
