/**
 * The package list and operations shared by the export-card chooser and the Export Manager.
 *
 * The browser owns rows, selection and control state; package lifecycle operations live in
 * `operations.ts`. Its host owns the meaning of the primary action: the chooser returns a choice,
 * while the manager persists the active package. This module never writes `export_templates`.
 *
 * May import: export-kind facts, package action rules, package operations and row builders.
 * Upholds: one implementation of package rows, with package selection separate from whichever host
 * decides what activation means.
 */

import type { ExportKindInfo } from '../../../api/export';
import type { TemplateSummary } from '../../../api/templates';
import { t } from '../../../services/i18n';
import { BaseComponent } from '../../component';
import { drivenByTools } from '../../under_test';
import { packageActionAvailability } from './availability';
import { TemplatePackageOperations } from './operations';
import { offeredPackages } from './offering';
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
  private readonly operations: TemplatePackageOperations;
  private state: PackageBrowserState | null = null;

  constructor(private readonly handlers: PackageBrowserHandlers) {
    super('div', ['flex', 'flex-col', 'gap-3']);
    this.element.setAttribute('data-template-package-browser', 'true');
    this.operations = new TemplatePackageOperations({
      kind: () => this.state?.info.kind ?? null,
      pandoc: () => this.state?.pandoc ?? null,
      selected: () => this.selected(),
      setStatus: (status) => {
        this.status.textContent = status;
      },
      changed: (packages, keepId) => this.handlers.changed(packages, keepId),
      setBusy: (action, busy) => {
        const control = action === 'validate' ? this.validate : this.testPdf;
        control.disabled = busy;
        if (!busy) {
          this.render();
        }
      }
    });

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
    inspect.addEventListener('click', () =>
      void this.operations.inspectPath(this.path.value.trim())
    );
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
    this.importFile.addEventListener('click', () => void this.operations.pick(false));
    this.importFolder.addEventListener('click', () => void this.operations.pick(true));
    this.createPackage.addEventListener('click', () => void this.operations.create());

    this.details = button('details-button', t('template.details'), 'btn btn-ghost btn-sm');
    this.duplicate = button('duplicate', t('template.duplicate'), 'btn btn-ghost btn-sm');
    this.edit = button('edit', t('template.edit'), 'btn btn-ghost btn-sm');
    this.validate = button('validate', t('template.validate'), 'btn btn-ghost btn-sm');
    this.testPdf = button('test-pdf', t('template.testPdf'), 'btn btn-ghost btn-sm');
    this.remove = button('remove', t('template.remove'), 'btn btn-ghost btn-sm');
    this.primary = button('primary', '', 'btn btn-primary btn-sm');
    this.primary.setAttribute('data-template-use', 'true');

    this.details.addEventListener('click', () => void this.operations.editDetails());
    this.duplicate.addEventListener('click', () => void this.operations.duplicate());
    this.edit.addEventListener('click', () => void this.operations.edit());
    this.validate.addEventListener('click', () => void this.operations.validate());
    this.testPdf.addEventListener('click', () => void this.operations.testPdf());
    this.remove.addEventListener('click', () => void this.operations.remove());
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

}
