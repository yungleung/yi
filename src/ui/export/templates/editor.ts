/**
 * The code editor for one export template package, or for a kind's defaults YAML.
 *
 * This is not the markdown editor: no block model, no session document, no workspace entry. It is
 * a CodeMirror panel with line numbers, search, undo and bracket matching, a file list that keeps
 * binaries read-only, and one atomic save.
 *
 * May import: the template and export seams, the opener plugin, the prompt and the catalogue.
 * Upholds: text goes to disk only when the reader saves it, and the app's manifest is never edited
 * as a file here.
 */

import type { EditorView } from '@codemirror/view';
import { join } from '@tauri-apps/api/path';
import { openPath } from '@tauri-apps/plugin-opener';
import {
  exportConfigText,
  readTemplateFile,
  saveExportConfigText,
  templateTakesPdf,
  testTemplatePdf,
  validateTemplate,
  writeTemplateFile,
  type TemplateSummary
} from '../../../api/templates';
import { t } from '../../../services/i18n';
import { notify } from '../../../services/messages';
import { prompt } from '../../prompt';
import { createCodeEditor } from '../../code_editor';
import { createTemplateEditorShell } from './editor_shell';
import { renderTemplateFiles } from './file_list';

/** One code panel for the whole window; it is the only thing on screen while it is open. */
export class TemplateEditorPanel {
  private readonly element: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly dirtyMark: HTMLSpanElement;
  private readonly files: HTMLDivElement;
  private readonly editorHost: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly validateButton: HTMLButtonElement;
  private readonly testPdfButton: HTMLButtonElement;
  private view: EditorView | null = null;
  private summary: TemplateSummary | null = null;
  private defaultsKind: string | null = null;
  private currentFile: string | null = null;
  private baseline = '';
  private readOnlyFile = false;
  private onClose: (() => void) | null = null;
  private closing = false;

  constructor() {
    const shell = createTemplateEditorShell({
      save: () => void this.save(),
      validate: () => void this.validate(),
      testPdf: () => void this.testPdf(),
      requestClose: () => void this.requestClose(),
      handleEscape: () => this.handleEscape()
    });
    this.element = shell.element;
    this.title = shell.title;
    this.dirtyMark = shell.dirtyMark;
    this.files = shell.files;
    this.editorHost = shell.editorHost;
    this.status = shell.status;
    this.saveButton = shell.saveButton;
    this.validateButton = shell.validateButton;
    this.testPdfButton = shell.testPdfButton;
  }

  isOpen(): boolean {
    return !this.element.classList.contains('hidden');
  }

  /** Shows one package, opening its entry. */
  async openPackage(summary: TemplateSummary, onClose: (() => void) | null = null): Promise<void> {
    this.summary = summary;
    this.defaultsKind = null;
    this.onClose = onClose;
    this.title.textContent = summary.manifest?.name ?? summary.id;
    const entry =
      summary.manifest === null || summary.manifest === undefined
        ? summary.files.find((file) => file.editable)?.name ?? null
        : summary.manifest.template ??
          summary.manifest.reference_doc ??
          summary.files.find((file) => file.editable)?.name ??
          null;
    const takesPdf = summary.manifest?.kind === 'pdf';
    this.testPdfButton.classList.toggle('hidden', !(takesPdf && (await templateTakesPdf('pdf'))));
    this.mount();
    this.renderFiles();
    if (entry !== null) {
      await this.loadFile(entry);
    } else if (summary.error !== null) {
      this.status.textContent = summary.error;
    }
  }

  /** Shows one kind's defaults YAML: not a package, and never written anywhere but where it lives. */
  async openDefaults(
    kind: string,
    label: string,
    onClose: (() => void) | null = null
  ): Promise<void> {
    this.summary = null;
    this.defaultsKind = kind;
    this.onClose = onClose;
    this.title.textContent = t('template.defaultsTitle', { kind: label });
    this.testPdfButton.classList.add('hidden');
    this.mount();
    this.renderFiles('export.' + kind + '.yaml');
    try {
      const text = await exportConfigText(kind);
      this.showText('export.' + kind + '.yaml', text, false);
    } catch (error) {
      notify('Templates', error);
    }
  }

  private mount(): void {
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
    this.element.classList.remove('hidden');
    this.element.classList.add('flex');
  }

  private renderFiles(only: string | null = null): void {
    const files =
      only === null
        ? this.summary?.files ?? []
        : [{ name: only, size: 0, editable: true }];
    renderTemplateFiles(this.files, files, {
      choose: (file, editable) => void this.chooseFile(file, editable),
      openExternally: (file) => void this.openInSystem(file),
      canOpenExternally: this.summary !== null
    });
  }

  private async chooseFile(file: string, editable: boolean): Promise<void> {
    if (file === this.currentFile) {
      return;
    }
    if (this.isDirty() && !(await this.confirmDiscard())) {
      return;
    }
    if (this.defaultsKind !== null) {
      return;
    }
    await this.loadFile(file, !editable);
  }

  private async loadFile(file: string, readOnly = false): Promise<void> {
    if (this.summary === null) {
      return;
    }
    try {
      const text = await readTemplateFile(this.summary.id, file);
      this.showText(file, text, readOnly || !this.summary.files.find((entry) => entry.name === file)?.editable);
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  private showText(file: string, text: string, readOnly: boolean): void {
    this.currentFile = file;
    this.readOnlyFile = readOnly;
    this.baseline = text;
    this.dirtyMark.textContent = '';
    this.saveButton.disabled = readOnly;
    this.view?.destroy();
    this.view = createCodeEditor({
      parent: this.editorHost,
      file,
      text,
      readOnly,
      onDocumentChanged: () => {
        this.dirtyMark.textContent = this.isDirty() ? t('template.dirty') : '';
      },
      onSave: () => void this.save()
    });
    this.view.focus();
    this.status.textContent = readOnly ? t('template.readOnlyFile') : '';
  }

  private isDirty(): boolean {
    const text = this.view?.state.doc.toString() ?? this.baseline;
    return !this.readOnlyFile && text !== this.baseline;
  }

  private async save(): Promise<boolean> {
    if (this.view === null || this.currentFile === null || this.readOnlyFile) {
      return true;
    }
    const text = this.view.state.doc.toString();
    try {
      if (this.defaultsKind !== null) {
        await saveExportConfigText(this.defaultsKind, text);
      } else if (this.summary !== null) {
        await writeTemplateFile(this.summary.id, this.currentFile, text);
      }
      this.baseline = text;
      this.dirtyMark.textContent = '';
      this.status.textContent = t('template.saved');
      return true;
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      notify('Templates', error);
      return false;
    }
  }

  private async validate(): Promise<void> {
    if (this.summary === null) {
      return;
    }
    if (this.isDirty() && !(await this.save())) {
      return;
    }
    this.validateButton.disabled = true;
    this.status.textContent = t('template.validating');
    try {
      const result = await validateTemplate(this.summary.id);
      this.status.textContent = [result.message, ...result.warnings].join('\n');
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.validateButton.disabled = false;
    }
  }

  private async testPdf(): Promise<void> {
    if (this.summary === null) {
      return;
    }
    if (this.isDirty() && !(await this.save())) {
      return;
    }
    this.testPdfButton.disabled = true;
    this.status.textContent = t('template.testingPdf');
    try {
      const result = await testTemplatePdf(this.summary.id);
      this.status.textContent = [result.message, ...result.warnings].join('\n');
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.testPdfButton.disabled = false;
    }
  }

  private async openInSystem(file: string): Promise<void> {
    if (this.summary === null) {
      return;
    }
    try {
      await openPath(await join(this.summary.path, file));
    } catch (error) {
      notify('Templates', error);
    }
  }

  private async confirmDiscard(): Promise<boolean> {
    return await prompt.ask({
      title: t('template.discardTitle'),
      message: t('template.discardMessage', { file: this.currentFile ?? '' }),
      yes: t('template.discard'),
      no: t('template.cancel')
    });
  }

  private searchClosed(): boolean {
    return this.view?.dom.querySelector('.cm-search') === null;
  }

  /**
   * Handles one Escape at the editor's own priority.
   *
   * An open search panel is the editor's inner state, so Escape is left to CodeMirror. Once that
   * state is closed, the key dismisses the editor. The manager uses this same path from its capture
   * listener so a search panel and the editor never both close on one key.
   */
  handleEscape(): boolean {
    if (!this.isOpen() || !this.searchClosed()) {
      return false;
    }
    void this.requestClose();
    return true;
  }

  /** Closes every way the editor can be dismissed through one dirty-checked path. */
  async requestClose(): Promise<void> {
    if (this.closing) {
      return;
    }
    this.closing = true;
    try {
      if (this.isDirty() && !(await this.confirmDiscard())) {
        return;
      }
      this.element.classList.add('hidden');
      this.element.classList.remove('flex');
      this.view?.destroy();
      this.view = null;
      this.currentFile = null;
      this.baseline = '';
      const callback = this.onClose;
      this.onClose = null;
      callback?.();
    } finally {
      this.closing = false;
    }
  }

}

/** The one code panel the window has. */
export const templateEditorPanel = new TemplateEditorPanel();
