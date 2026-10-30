/**
 * The package chooser: what the Template row's **Choose…** opens.
 *
 * It reads the packages the app has, imports one from a file, folder or zip, makes one from
 * pandoc's default, duplicates, removes, edits details and opens the code panel. Choosing
 * "Pandoc's default" is an answer of its own — no package, which is what every export did before
 * packages existed.
 *
 * May import: the template seam, the dialogs, the code panel, the catalogue and the prompt.
 * Upholds: every package operation is asked for, and the chooser's answer is an id the backend
 * resolves under its own export folder.
 */

import { open } from '@tauri-apps/plugin-dialog';
import {
  createDefaultTemplate,
  duplicateTemplate,
  exportTemplates,
  importTemplate,
  inspectTemplate,
  removeTemplate,
  updateTemplate,
  type TemplateSummary
} from '../../../api/templates';
import { t } from '../../../services/i18n';
import { notify } from '../../../services/messages';
import { QuestionCard } from '../../floating/question_card';
import { prompt } from '../../prompt';
import { drivenByTools } from '../../under_test';
import { createDefaultDialog } from './create_default_dialog';
import { templateDetailsDialog } from './details';
import { templateEditorPanel } from './editor';
import { importProposalDialog } from './import_dialog';
import { kindLabel } from './kind_label';
import { offeredForKind, offeredPackages } from './offering';

/** What the chooser answers: an id, null for pandoc's default, or nothing for cancel. */
export interface TemplateChoice {
  id: string | null;
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

export class TemplateLibraryDialog extends QuestionCard<TemplateChoice | null> {
  private readonly heading: HTMLParagraphElement;
  private readonly hint: HTMLParagraphElement;
  private readonly list: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly pathRow: HTMLDivElement;
  private readonly path: HTMLInputElement;
  private readonly useButton: HTMLButtonElement;
  private readonly detailsButton: HTMLButtonElement;
  private readonly duplicateButton: HTMLButtonElement;
  private readonly removeButton: HTMLButtonElement;
  private readonly importRow: HTMLDivElement;
  private readonly actionsRow: HTMLDivElement;
  private kind = 'latex';
  private pandoc: string | null = null;
  private packages: TemplateSummary[] = [];
  private selected: string | null = null;

  constructor() {
    super('w-[44rem] max-h-[88vh] overflow-auto');
    this.element.setAttribute('data-template-library', 'true');
    this.heading = document.createElement('p');
    this.heading.className = 'text-sm font-semibold';
    this.heading.setAttribute('data-template-library-heading', 'true');
    this.hint = document.createElement('p');
    this.hint.className = 'mt-1 text-xs opacity-70';
    this.hint.textContent = t('template.libraryHint');
    this.list = document.createElement('div');
    this.list.className = 'mt-3 flex flex-col gap-1';
    this.list.setAttribute('data-template-library-list', 'true');
    this.status = document.createElement('p');
    this.status.className = 'mt-2 min-h-4 text-xs text-error';
    this.status.setAttribute('data-template-library-status', 'true');

    const pathLabel = document.createElement('label');
    pathLabel.className = 'label-text text-xs';
    pathLabel.textContent = t('template.importPath');
    this.path = document.createElement('input');
    this.path.type = 'text';
    this.path.className = 'input input-bordered input-sm flex-1';
    this.path.setAttribute('data-template-import-path', 'true');
    const inspect = document.createElement('button');
    inspect.type = 'button';
    inspect.className = 'btn btn-ghost btn-sm';
    inspect.textContent = t('template.inspect');
    inspect.setAttribute('data-template-inspect-path', 'true');
    inspect.addEventListener('click', () => void this.inspectPath(this.path.value.trim()));
    this.pathRow = document.createElement('div');
    this.pathRow.className = 'mt-3 flex-col gap-1';
    this.pathRow.classList.toggle('hidden', !drivenByTools());
    this.pathRow.classList.toggle('flex', drivenByTools());
    const pathLine = document.createElement('div');
    pathLine.className = 'flex items-center gap-2';
    pathLine.append(this.path, inspect);
    this.pathRow.append(pathLabel, pathLine);

    this.useButton = this.button('use', t('template.use'), 'btn btn-primary btn-sm', () =>
      this.settle({ id: this.selected })
    );
    this.detailsButton = this.button('details-button', t('template.details'), 'btn btn-ghost btn-sm', () =>
      void this.editDetails()
    );
    this.duplicateButton = this.button('duplicate', t('template.duplicate'), 'btn btn-ghost btn-sm', () =>
      void this.duplicate()
    );
    this.removeButton = this.button('remove', t('template.remove'), 'btn btn-ghost btn-sm', () =>
      void this.remove()
    );
    const importFile = this.button('import-file', t('template.importFile'), 'btn btn-ghost btn-sm', () =>
      void this.pick(false)
    );
    const importFolder = this.button(
      'import-folder',
      t('template.importFolder'),
      'btn btn-ghost btn-sm',
      () => void this.pick(true)
    );
    const create = this.button('create', t('template.createFromPandoc'), 'btn btn-ghost btn-sm', () =>
      void this.create()
    );
    const cancel = this.button('cancel', t('template.cancel'), 'btn btn-ghost btn-sm', () =>
      this.settle(null)
    );
    this.importRow = document.createElement('div');
    this.importRow.className = 'mt-3 flex flex-wrap gap-2';
    this.importRow.append(importFile, importFolder, create);
    this.actionsRow = document.createElement('div');
    this.actionsRow.className = 'mt-3 flex flex-wrap justify-end gap-2';
    this.actionsRow.append(
      this.detailsButton,
      this.duplicateButton,
      this.removeButton,
      cancel,
      this.useButton
    );
    this.card.setAttribute('data-template-library-card', 'true');
  }

  protected cautious(): TemplateChoice | null {
    return null;
  }

  async ask(
    kind: string,
    selected: string | null,
    pandoc: string | null
  ): Promise<TemplateChoice | null> {
    this.kind = kind;
    this.pandoc = pandoc;
    this.selected = selected;
    this.status.textContent = '';
    this.path.value = '';
    this.heading.textContent = t('template.libraryTitle', { kind: kindLabel(kind) });
    this.packages = await exportTemplates();
    if (!this.offeredPackages().some((summary) => summary.id === this.selected)) {
      this.selected = null;
    }
    this.render();
    const answered = this.askWith(() => {
      this.card.append(
      this.heading,
        this.hint,
        this.list,
        this.pathRow,
        this.importRow,
        this.status,
        this.actionsRow
      );
    });
    this.render();
    return await answered;
  }

  private render(): void {
    this.list.replaceChildren();
    this.list.append(this.defaultRow());
    for (const summary of this.offeredPackages()) {
      this.list.append(this.packageRow(summary));
    }
    const selected =
      this.offeredPackages().find((summary) => summary.id === this.selected) ?? null;
    const usable =
      selected === null ||
      (selected.manifest !== null && selected.manifest.kind === this.kind);
    this.useButton.disabled = !usable;
    this.detailsButton.disabled = selected === null || selected.manifest === null;
    this.duplicateButton.disabled = selected === null || selected.manifest === null;
    this.removeButton.disabled = selected === null;
  }

  /**
   * The packages this export kind can offer. A broken manifest has no readable kind, but remains
   * visible so the reader can still select and remove it; a readable package for another kind is
   * not a choice here at all.
   */
  private offeredPackages(): TemplateSummary[] {
    return offeredPackages(this.packages, this.kind);
  }

  private defaultRow(): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `rounded border px-2 py-1 text-left text-sm ${
      this.selected === null ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-300'
    }`;
    row.setAttribute('data-template-default', 'true');
    row.textContent = t('template.pandocDefault');
    row.addEventListener('click', () => {
      this.selected = null;
      this.render();
    });
    return row;
  }

  private packageRow(summary: TemplateSummary): HTMLElement {
    const compatible = summary.manifest !== null && summary.manifest.kind === this.kind;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `rounded border px-2 py-1 text-left text-sm ${
      this.selected === summary.id
        ? 'border-primary bg-primary/10'
        : 'border-base-300 hover:bg-base-300'
    } ${compatible ? '' : 'opacity-65'}`;
    row.setAttribute('data-template-package', summary.id);
    row.setAttribute('data-template-package-id', summary.id);
    const name = document.createElement('span');
    name.className = 'block truncate font-medium';
    name.textContent = summary.manifest?.name ?? summary.id;
    const facts = document.createElement('span');
    facts.className = 'block truncate text-xs opacity-60';
    facts.textContent =
      summary.manifest === null
        ? summary.error ?? t('template.broken')
        : [
            kindLabel(summary.manifest.kind),
            modeLabel(summary.manifest.mode),
            summary.manifest.origin.license,
            summary.manifest.origin.source
          ]
            .filter((fact): fact is string => typeof fact === 'string' && fact !== '')
            .join(' · ');
    row.append(name, facts);
    // A package that cannot be used for this kind — or one whose manifest cannot be read — is still
    // selectable, so its details, a duplicate or a removal are reachable. *Use* is what refuses it.
    row.addEventListener('click', () => {
      this.selected = summary.id;
      this.render();
    });
    return row;
  }

  private async pick(folder: boolean): Promise<void> {
    try {
      const chosen = await open({
        directory: folder,
        multiple: false,
        ...(folder
          ? {}
          : { filters: [{ name: t('template.packageFilter'), extensions: ['zip', 'tex', 'html', 'docx', 'odt'] }] })
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
    if (this.pandoc === null) {
      this.status.textContent = t('export.noPandoc');
      return;
    }
    const answer = await createDefaultDialog.ask(this.kind);
    if (answer === null) {
      return;
    }
    try {
      const created = await createDefaultTemplate(
        this.kind,
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
    this.packages = await exportTemplates();
    this.selected = offeredForKind(created, this.kind) ? created.id : null;
    this.render();
    // The generated entry is what the reader came for, so it opens ready to read and edit.
    await templateEditorPanel.openPackage(created, () => void this.refresh());
  }

  private async refresh(): Promise<void> {
    this.packages = await exportTemplates();
    if (
      this.selected !== null &&
      !this.offeredPackages().some((summary) => summary.id === this.selected)
    ) {
      this.selected = null;
    }
    this.render();
  }

  private async editDetails(): Promise<void> {
    const summary = this.packages.find((entry) => entry.id === this.selected);
    if (summary === undefined || summary.manifest === null) {
      return;
    }
    const patch = await templateDetailsDialog.ask(summary);
    if (patch === null) {
      return;
    }
    try {
      const updated = await updateTemplate(summary.id, patch);
      this.selected = updated.id;
      await this.refresh();
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      notify('Templates', error);
    }
  }

  private async duplicate(): Promise<void> {
    if (this.selected === null) {
      return;
    }
    try {
      const copied = await duplicateTemplate(this.selected);
      this.packages = await exportTemplates();
      this.selected = copied.id;
      this.render();
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      notify('Templates', error);
    }
  }

  private async remove(): Promise<void> {
    const summary = this.packages.find((entry) => entry.id === this.selected);
    if (summary === undefined) {
      return;
    }
    const agreed = await prompt.ask({
      title: t('template.remove'),
      message: t('template.removeQuestion', {
        name: summary.manifest?.name ?? summary.id
      }),
      yes: t('template.remove'),
      no: t('template.cancel')
    });
    if (!agreed) {
      return;
    }
    try {
      await removeTemplate(summary.id);
      this.selected = null;
      await this.refresh();
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      notify('Templates', error);
    }
  }

  private button(
    name: string,
    label: string,
    className: string,
    onPress: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.setAttribute(`data-template-${name}`, 'true');
    button.addEventListener('click', onPress);
    return button;
  }
}

export const templateLibraryDialog = new TemplateLibraryDialog();
