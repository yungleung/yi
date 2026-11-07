/**
 * The new-note tab of the settings window: the frontmatter a new note is made with.
 *
 * What a reader writes here is what `services/new_document/index.ts` fills in — the same module the
 * menu and the tree make their notes through — so the four required keys are the app's and
 * everything else is theirs. The editor holds the template *without* its `---` fences (they are
 * the app's), and a reader who pastes them in anyway is not punished for it: the rule strips
 * them.
 *
 * May import: the config manager, the note's own default template, the shared CodeMirror editor,
 * the settings autosave queue and the component base. Upholds: the app config is the one home of
 * the template — edits save through one ordered queue, Reset stores "the app's own", and nothing
 * keeps a second copy.
 */

import type { EditorView } from '@codemirror/view';
import { configManager } from '../../services/config_manager';
import { t } from '../../services/i18n';
import { DEFAULT_TEMPLATE } from '../../services/new_document';
import { createCodeEditor } from '../code_editor';
import { BaseComponent } from '../component';
import { createTextAutosave } from './autosave';
import { SaveStatus } from './save_status';

export class NewDocumentSettings extends BaseComponent {
  private readonly editorHost: HTMLDivElement;
  private readonly saveStatus: SaveStatus;
  private readonly autosave = createTextAutosave(() => this.saveTemplate());
  private view: EditorView | null = null;

  constructor() {
    super('div', ['flex', 'flex-col', 'gap-6', 'max-w-2xl']);

    const heading = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold';
    title.textContent = t('settings.newNote');
    const description = document.createElement('p');
    description.className = 'text-sm opacity-70';
    description.textContent = t('settings.newNote.description');
    heading.append(title, description);

    const group = document.createElement('div');
    group.className = 'form-control gap-1';
    const label = document.createElement('span');
    label.className = 'label-text';
    label.textContent = t('settings.newNote.template');
    this.editorHost = document.createElement('div');
    this.editorHost.className =
      'h-64 min-h-48 overflow-hidden rounded-box border border-base-300 bg-base-100';
    this.editorHost.setAttribute('data-new-file-frontmatter', 'true');
    this.editorHost.addEventListener('focusout', (event) => {
      const next = event.relatedTarget;
      if (!(next instanceof Node) || !this.editorHost.contains(next)) {
        void this.autosave.flush();
      }
    });
    const hint = document.createElement('p');
    hint.className = 'text-xs opacity-60';
    hint.textContent = t('settings.newNote.templateHint');
    group.append(label, this.editorHost, hint);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-3';
    const resetButton = this.button(t('settings.reset'), () => void this.reset());
    resetButton.setAttribute('data-new-file-reset', 'true');
    const status = document.createElement('span');
    status.className = 'text-sm opacity-70';
    this.saveStatus = new SaveStatus(status);
    actions.append(resetButton, status);

    this.appendChild(heading);
    this.appendChild(group);
    this.appendChild(actions);
    void this.load();
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  private async load(): Promise<void> {
    try {
      const config = await configManager.load();
      // The app's own template is shown when the reader has none: "no template of mine" is what
      // keeps a reader who never chose one following the app.
      this.showText(config.new_file_frontmatter ?? DEFAULT_TEMPLATE);
    } catch (error) {
      console.error('Failed to load the new-note settings:', error);
      this.showText(DEFAULT_TEMPLATE);
      this.saveStatus.failedToLoad();
    }
  }

  private showText(text: string): void {
    this.view?.destroy();
    this.view = createCodeEditor({
      parent: this.editorHost,
      file: 'frontmatter.yaml',
      text,
      readOnly: false,
      onDocumentChanged: () => {
        this.saveStatus.saving();
        this.autosave.schedule();
      },
      onSave: () => void this.autosave.flush()
    });
  }

  private replaceText(text: string): void {
    if (this.view === null) {
      this.showText(text);
      return;
    }
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text }
    });
  }

  private async reset(): Promise<void> {
    this.replaceText(DEFAULT_TEMPLATE);
    // The edit above schedules its own save; Reset persists "the app's own" instead.
    this.autosave.cancel();
    await this.saveTemplate(null);
  }

  /** Persists the editor text, or `null` when Reset asks for the app-owned default. */
  private async saveTemplate(forced: string | null | undefined = undefined): Promise<void> {
    const text = forced === undefined ? this.view?.state.doc.toString() ?? '' : forced;
    try {
      await configManager.update({
        new_file_frontmatter: text === null || text.trim() === '' ? null : text
      });
      this.saveStatus.saved();
    } catch (error) {
      this.saveStatus.failed('the new-note settings', error);
    }
  }
}
