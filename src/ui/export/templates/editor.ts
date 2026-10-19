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

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, StreamLanguage } from '@codemirror/language';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from '@codemirror/view';
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

/** The editor's own colours: the app's daisyUI theme, never a second palette. */
const THEME = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--color-base-100)',
    color: 'var(--color-base-content)',
    fontSize: '0.8125rem'
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    lineHeight: '1.55'
  },
  '.cm-content': {
    caretColor: 'var(--color-primary)',
    padding: '0.5rem 0'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-base-200)',
    color: 'color-mix(in oklab, var(--color-base-content) 55%, var(--color-base-200))',
    borderRight: '1px solid var(--color-base-300)'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--color-base-content) 5%, transparent)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklab, var(--color-base-content) 8%, transparent)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--color-primary) 28%, transparent)'
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in oklab, var(--color-warning) 35%, transparent)'
  }
});

function languageFor(file: string): ReturnType<typeof StreamLanguage.define> | null {
  const extension = file.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'yaml' || extension === 'yml') {
    return StreamLanguage.define(yaml);
  }
  if (['tex', 'cls', 'sty', 'bst', 'bbx', 'cbx'].includes(extension)) {
    return StreamLanguage.define(stex);
  }
  return null;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One code panel for the whole window; it is the only thing on screen while it is open. */
export class TemplateEditorPanel {
  private readonly element: HTMLDivElement;
  private readonly panel: HTMLDivElement;
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

  constructor() {
    this.element = document.createElement('div');
    this.element.className =
      'fixed inset-0 z-[70] hidden items-center justify-center bg-black/30';
    this.element.setAttribute('data-template-editor', 'true');

    this.panel = document.createElement('div');
    this.panel.className =
      'flex h-[min(48rem,90vh)] w-[min(72rem,95vw)] flex-col overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl';
    this.panel.setAttribute('data-template-editor-panel', 'true');

    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 border-b border-base-300 px-3 py-2';
    this.title = document.createElement('span');
    this.title.className = 'text-sm font-semibold';
    this.title.setAttribute('data-template-editor-title', 'true');
    this.dirtyMark = document.createElement('span');
    this.dirtyMark.className = 'text-xs text-warning';
    this.dirtyMark.setAttribute('data-template-editor-dirty', 'true');
    this.dirtyMark.textContent = '';
    const spacer = document.createElement('span');
    spacer.className = 'flex-1';
    this.saveButton = this.button('save', t('template.save'), 'btn btn-primary btn-xs', () =>
      void this.save()
    );
    this.validateButton = this.button('validate', t('template.validate'), 'btn btn-ghost btn-xs', () =>
      void this.validate()
    );
    this.testPdfButton = this.button('test-pdf', t('template.testPdf'), 'btn btn-ghost btn-xs', () =>
      void this.testPdf()
    );
    const close = this.button('close', '✕', 'btn btn-ghost btn-xs', () => void this.close());
    close.setAttribute('aria-label', t('template.close'));
    header.append(this.title, this.dirtyMark, spacer, this.saveButton, this.validateButton, this.testPdfButton, close);

    const body = document.createElement('div');
    body.className = 'flex min-h-0 flex-1';
    this.files = document.createElement('div');
    this.files.className = 'w-56 shrink-0 overflow-auto border-r border-base-300 bg-base-200/50 p-2';
    this.files.setAttribute('data-template-editor-files', 'true');
    const right = document.createElement('div');
    right.className = 'flex min-w-0 flex-1 flex-col';
    this.editorHost = document.createElement('div');
    this.editorHost.className = 'min-h-0 flex-1 overflow-hidden';
    this.editorHost.setAttribute('data-template-editor-code', 'true');
    this.status = document.createElement('p');
    this.status.className =
      'max-h-32 overflow-auto whitespace-pre-wrap border-t border-base-300 px-3 py-2 text-xs opacity-80';
    this.status.setAttribute('data-template-editor-status', 'true');
    right.append(this.editorHost, this.status);
    body.append(this.files, right);
    this.panel.append(header, body);
    this.element.append(this.panel);
    // A press in the panel belongs to the panel, not to the window drag behind it.
    this.panel.addEventListener('mousedown', (event) => event.stopPropagation());
    document.addEventListener('keydown', (event) => {
      if (!this.isOpen()) {
        return;
      }
      if (event.key === 'Escape' && this.searchClosed()) {
        event.preventDefault();
        void this.close();
      }
    });
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
  async openDefaults(kind: string, label: string): Promise<void> {
    this.summary = null;
    this.defaultsKind = kind;
    this.onClose = null;
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
    this.files.replaceChildren();
    const files =
      only === null
        ? this.summary?.files ?? []
        : [{ name: only, size: 0, editable: true }];
    for (const file of files) {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-1 rounded px-1 py-1';
      row.setAttribute('data-template-file', file.name);
      const name = document.createElement('button');
      name.type = 'button';
      name.className =
        'min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-xs hover:bg-base-300';
      name.textContent = file.name;
      name.title = file.name;
      name.addEventListener('click', () => void this.chooseFile(file.name, file.editable));
      row.append(name);
      if (!file.editable) {
        const size = document.createElement('span');
        size.className = 'text-[0.65rem] opacity-50';
        size.textContent = sizeLabel(file.size);
        row.append(size);
        if (this.summary !== null && !file.name.endsWith('.json')) {
          const open = document.createElement('button');
          open.type = 'button';
          open.className = 'btn btn-ghost btn-xs px-1';
          open.textContent = '↗';
          open.title = t('template.openInSystem');
          open.setAttribute('aria-label', t('template.openInSystem'));
          open.addEventListener('click', () => void this.openInSystem(file.name));
          row.append(open);
        }
      }
      this.files.append(row);
    }
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
    const language = languageFor(file);
    this.view?.destroy();
    this.view = new EditorView({
      parent: this.editorHost,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          bracketMatching(),
          indentOnInput(),
          highlightSelectionMatches(),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          ...(language === null ? [] : [language]),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                void this.save();
                return true;
              }
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.dirtyMark.textContent = this.isDirty() ? t('template.dirty') : '';
            }
          }),
          THEME
        ]
      })
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

  private async close(): Promise<void> {
    if (this.isDirty() && !(await this.confirmDiscard())) {
      return;
    }
    this.element.classList.add('hidden');
    this.element.classList.remove('flex');
    this.view?.destroy();
    this.view = null;
    this.currentFile = null;
    this.baseline = '';
    this.onClose?.();
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
    button.setAttribute(`data-template-editor-${name}`, 'true');
    button.addEventListener('click', onPress);
    return button;
  }
}

/** The one code panel the window has. */
export const templateEditorPanel = new TemplateEditorPanel();
