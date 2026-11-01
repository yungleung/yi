/**
 * The package list and operations shared by the export-card chooser and the Export Manager.
 *
 * The browser owns rows, selection, package operations and their dialogs. Its host owns the
 * meaning of the primary action: the chooser returns a choice, while the manager persists the
 * active package. This module never writes `export_templates`.
 *
 * May import: the template seam, export-kind facts, package action rules, dialogs and the code
 * editor. Upholds: one implementation of package rows and operations, with package selection
 * separate from whichever host decides what activation means.
 */

import { open } from '@tauri-apps/plugin-dialog';
import type { ExportKindInfo } from '../../../api/export';
import {
  createDefaultTemplate,
  duplicateTemplate,
  exportTemplates,
  importTemplate,
  inspectTemplate,
  removeTemplate,
  testTemplatePdf,
  updateTemplate,
  validateTemplate,
  type TemplateSummary
} from '../../../api/templates';
import { t } from '../../../services/i18n';
import { notify } from '../../../services/messages';
import { BaseComponent } from '../../component';
import { prompt } from '../../prompt';
import { drivenByTools } from '../../under_test';
import { packageActionAvailability } from '../manager/rules';
import { createDefaultDialog } from './create_default_dialog';
import {
  showBrokenTemplateDetails,
  templateDetailsDialog
} from './details';
import { templateEditorPanel } from './editor';
import { importProposalDialog } from './import_dialog';
import { offeredForKind, offeredPackages } from './offering';
import {
  createDefaultPackageRow,
  createPackageRow
} from './rows';

export interface PackageBrowserState {
  info: ExportKindInfo;
  packages: TemplateSummary[];
  activeId: string | null;
  inspectedId: string | null;
  pandoc: string | null;
  primaryLabel: string;
}

export interface PackageBrowserHandlers {
  inspect(id: string | null): void;
  primary(id: string | null): void;
  changed(packages: TemplateSummary[], keepId: string | null): void;
}

function button(name: string, label: string, className: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.setAttribute(`data-template-${name}`, 'true');
  return element;
}

/** The one removal question shared by the package browser and unassigned-package page. */
export async function removeTemplatePackage(
  summary: TemplateSummary
): Promise<boolean> {
  const agreed = await prompt.ask({
    title: t('template.remove'),
    message: t('template.removeQuestion', {
      name: summary.manifest?.name ?? summary.id
    }),
    yes: t('template.remove'),
    no: t('template.cancel')
  });
  if (!agreed) {
    return false;
  }
  await removeTemplate(summary.id);
  return true;
}

export class TemplatePackageBrowser extends BaseComponent {
  private readonly list: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly pathRow: HTMLDivElement;
  private readonly path: HTMLInputElement;
  private readonly importFile: HTMLButtonElement;
  private readonly importFolder: HTMLButtonElement;
  private readonly createPackage: HTMLButtonElement;
  private readonly details: HTMLButtonElement;
  private readonly duplicate: HTMLButtonElement;
  private readonly edit: HTMLButtonElement;
  private readonly validate: HTMLButtonElement;
  private readonly testPdf: HTMLButtonElement;
  private readonly remove: HTMLButtonElement;
  private readonly primary: HTMLButtonElement;
  private state: PackageBrowserState | null = null;

  constructor(private readonly handlers: PackageBrowserHandlers) {
    super('div', ['flex', 'flex-col', 'gap-3']);
    this.element.setAttribute('data-template-package-browser', 'true');

    this.list = document.createElement('div');
    this.list.className = 'flex flex-col gap-1';
    this.list.setAttribute('data-template-library-list', 'true');

    const pathLabel = document.createElement('label');
    pathLabel.className = 'label-text text-xs';
    pathLabel.textContent = t('template.importPath');
    this.path = document.createElement('input');
    this.path.type = 'text';
    this.path.className = 'input input-bordered input-sm flex-1';
    this.path.setAttribute('data-template-import-path', 'true');
    const inspect = button('inspect-path', t('template.inspect'), 'btn btn-ghost btn-sm');
    inspect.addEventListener('click', () => void this.inspectPath(this.path.value.trim()));
    const pathLine = document.createElement('div');
    pathLine.className = 'flex items-center gap-2';
    pathLine.append(this.path, inspect);
    this.pathRow = document.createElement('div');
    this.pathRow.className = 'flex-col gap-1';
    this.pathRow.classList.toggle('hidden', !drivenByTools());
    this.pathRow.classList.toggle('flex', drivenByTools());
    this.pathRow.append(pathLabel, pathLine);

    this.importFile = button('import-file', t('template.importFile'), 'btn btn-ghost btn-sm');
    this.importFolder = button('import-folder', t('template.importFolder'), 'btn btn-ghost btn-sm');
    this.createPackage = button(
      'create',
      t('template.createFromPandoc'),
      'btn btn-ghost btn-sm'
    );
    this.importFile.addEventListener('click', () => void this.pick(false));
    this.importFolder.addEventListener('click', () => void this.pick(true));
    this.createPackage.addEventListener('click', () => void this.create());

    this.details = button('details-button', t('template.details'), 'btn btn-ghost btn-sm');
    this.duplicate = button('duplicate', t('template.duplicate'), 'btn btn-ghost btn-sm');
    this.edit = button('edit', t('template.edit'), 'btn btn-ghost btn-sm');
    this.validate = button('validate', t('template.validate'), 'btn btn-ghost btn-sm');
    this.testPdf = button('test-pdf', t('template.testPdf'), 'btn btn-ghost btn-sm');
    this.remove = button('remove', t('template.remove'), 'btn btn-ghost btn-sm');
    this.primary = button('primary', '', 'btn btn-primary btn-sm');
    this.primary.setAttribute('data-template-use', 'true');

    this.details.addEventListener('click', () => void this.editDetails());
    this.duplicate.addEventListener('click', () => void this.duplicatePackage());
    this.edit.addEventListener('click', () => void this.editPackage());
    this.validate.addEventListener('click', () => void this.validatePackage());
    this.testPdf.addEventListener('click', () => void this.testPdfPackage());
    this.remove.addEventListener('click', () => void this.removePackage());
    this.primary.addEventListener('click', () => this.handlers.primary(this.inspectedId()));

    this.status = document.createElement('p');
    this.status.className = 'min-h-4 text-xs text-error';
    this.status.setAttribute('data-template-library-status', 'true');

    const importRow = document.createElement('div');
    importRow.className = 'flex flex-wrap gap-2';
    importRow.append(this.importFile, this.importFolder, this.createPackage);
    const actionsRow = document.createElement('div');
    actionsRow.className = 'flex flex-wrap justify-end gap-2';
    actionsRow.append(
      this.details,
      this.duplicate,
      this.edit,
      this.validate,
      this.testPdf,
      this.remove,
      this.primary
    );
    this.element.append(this.list, this.pathRow, importRow, this.status, actionsRow);
  }

  update(state: PackageBrowserState): void {
    const kindChanged = this.state !== null && this.state.info.kind !== state.info.kind;
    this.state = {
      ...state,
      inspectedId: this.validInspectedId(state)
    };
    if (kindChanged) {
      this.resetTransient();
    }
    this.render();
  }

  /** Clears state that belongs to one opening or one manager kind, never to the packages. */
  resetTransient(): void {
    this.path.value = '';
    this.status.textContent = '';
  }

  inspectedId(): string | null {
    return this.state?.inspectedId ?? null;
  }

  private validInspectedId(state: PackageBrowserState): string | null {
    if (
      state.inspectedId !== null &&
      this.offered(state).some((summary) => summary.id === state.inspectedId)
    ) {
      return state.inspectedId;
    }
    return null;
  }

  private offered(state: PackageBrowserState = this.state!): TemplateSummary[] {
    return offeredPackages(state.packages, state.info.kind);
  }

  private selected(): TemplateSummary | null {
    if (this.state === null || this.state.inspectedId === null) {
      return null;
    }
    return (
      this.offered().find((summary) => summary.id === this.state?.inspectedId) ?? null
    );
  }

  private render(): void {
    const state = this.state;
    if (state === null) {
      return;
    }
    const rowState = {
      kind: state.info.kind,
      activeId: state.activeId,
      inspectedId: state.inspectedId
    };
    this.list.replaceChildren(
      createDefaultPackageRow(rowState, (id) => this.handlers.inspect(id)),
      ...this.offered().map((summary) =>
        createPackageRow(summary, rowState, (id) => this.handlers.inspect(id))
      )
    );
    this.primary.textContent = state.primaryLabel;
    const actions = packageActionAvailability(state.info, state.pandoc, this.selected());
    const selected = this.selected();
    const defaultCanActivate =
      state.inspectedId === null ||
      (selected?.manifest !== null &&
        selected?.manifest !== undefined &&
        selected.manifest.kind === state.info.kind &&
        selected.error === null);
    this.primary.disabled = !defaultCanActivate;
    this.details.disabled = !actions.details;
    this.duplicate.disabled = !actions.duplicate;
    this.edit.disabled = !actions.edit;
    this.validate.disabled = !actions.validate;
    this.testPdf.disabled = !actions.testPdf;
    this.testPdf.classList.toggle('hidden', state.info.kind !== 'pdf');
    this.remove.disabled = !actions.remove;
    this.importFile.disabled = !actions.importPackage;
    this.importFolder.disabled = !actions.importPackage;
    this.createPackage.disabled = !actions.createPackage;
  }

  private async pick(folder: boolean): Promise<void> {
    try {
      const chosen = await open({
        directory: folder,
        multiple: false,
        ...(folder
          ? {}
          : {
              filters: [
                {
                  name: t('template.packageFilter'),
                  extensions: ['zip', 'tex', 'html', 'docx', 'odt']
                }
              ]
            })
      });
      if (typeof chosen === 'string') {
        await this.inspectPath(chosen);
      }
    } catch (error) {
      notify('Templates', error);
    }
  }

  private async inspectPath(path: string): Promise<void> {
    if (path === '') {
      this.status.textContent = t('template.importPathEmpty');
      return;
    }
    try {
      const proposal = await inspectTemplate(path);
      const request = await importProposalDialog.ask(path, proposal);
      if (request === null) {
        return;
      }
      const created = await importTemplate(request);
      await this.afterCreated(created);
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      notify('Templates', error);
    }
  }

  private async create(): Promise<void> {
    if (this.state === null) {
      return;
    }
    if (this.state.pandoc === null) {
      this.status.textContent = t('export.noPandoc');
      return;
    }
    const answer = await createDefaultDialog.ask(this.state.info.kind);
    if (answer === null) {
      return;
    }
    try {
      const created = await createDefaultTemplate(
        this.state.info.kind,
        answer.name,
        answer.source,
        answer.license
      );
      await this.afterCreated(created);
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      notify('Templates', error);
    }
  }

  private async afterCreated(created: TemplateSummary): Promise<void> {
    if (this.state === null) {
      return;
    }
    const packages = await exportTemplates();
    const keepId = offeredForKind(created, this.state.info.kind) ? created.id : null;
    this.handlers.changed(packages, keepId);
    await templateEditorPanel.openPackage(created, () => void this.refresh(keepId));
  }

  private async refresh(keepId: string | null): Promise<void> {
    if (this.state === null) {
      return;
    }
    const packages = await exportTemplates();
    const stillThere =
      keepId !== null &&
      this.offered({ ...this.state, packages }).some((summary) => summary.id === keepId);
    this.handlers.changed(packages, stillThere ? keepId : null);
  }

  private async editDetails(): Promise<void> {
    const summary = this.selected();
    if (summary === null) {
      return;
    }
    if (summary.manifest === null) {
      showBrokenTemplateDetails(summary);
      return;
    }
    const patch = await templateDetailsDialog.ask(summary);
    if (patch === null) {
      return;
    }
    try {
      const updated = await updateTemplate(summary.id, patch);
      await this.refresh(updated.id);
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      notify('Templates', error);
    }
  }

  private async duplicatePackage(): Promise<void> {
    const summary = this.selected();
    if (summary === null) {
      return;
    }
    try {
      const copied = await duplicateTemplate(summary.id);
      await this.refresh(copied.id);
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      notify('Templates', error);
    }
  }

  private async editPackage(): Promise<void> {
    const summary = this.selected();
    if (summary === null) {
      return;
    }
    await templateEditorPanel.openPackage(summary, () => void this.refresh(summary.id));
  }

  private async validatePackage(): Promise<void> {
    const summary = this.selected();
    if (summary === null) {
      return;
    }
    this.validate.disabled = true;
    this.status.textContent = t('template.validating');
    try {
      const result = await validateTemplate(summary.id);
      this.status.textContent = [result.message, ...result.warnings].join('\n');
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.render();
    }
  }

  private async testPdfPackage(): Promise<void> {
    const summary = this.selected();
    if (summary === null) {
      return;
    }
    this.testPdf.disabled = true;
    this.status.textContent = t('template.testingPdf');
    try {
      const result = await testTemplatePdf(summary.id);
      this.status.textContent = [result.message, ...result.warnings].join('\n');
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.render();
    }
  }

  private async removePackage(): Promise<void> {
    const summary = this.selected();
    if (summary === null) {
      return;
    }
    try {
      if (!(await removeTemplatePackage(summary))) {
        return;
      }
      await this.refresh(null);
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      notify('Templates', error);
    }
  }
}
