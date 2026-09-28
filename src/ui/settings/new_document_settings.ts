/**
 * The new-note tab of the settings window: the frontmatter a new note is made with.
 *
 * What a reader writes here is what `services/new_document.ts` fills in — the same module the
 * menu and the tree make their notes through — so the four required keys are the app's and
 * everything else is theirs. The field is the template *without* its `---` fences (they are
 * the app's), and a reader who pastes them in anyway is not punished for it: the rule strips
 * them.
 *
 * May import: the config manager, the note's own default template, and the component base.
 * Upholds: the app config is the one home of the template — this window reads it when it
 * opens and writes it when the reader saves, and nothing keeps a second copy.
 */

import { configManager } from '../../services/config_manager';
import { DEFAULT_TEMPLATE } from '../../services/new_document';
import { BaseComponent } from '../component';

export class NewDocumentSettings extends BaseComponent {
  private readonly field: HTMLTextAreaElement;
  private readonly status: HTMLElement;

  constructor() {
    super('div', ['flex', 'flex-col', 'gap-6', 'max-w-xl']);

    const heading = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold';
    title.textContent = 'New note';
    const description = document.createElement('p');
    description.className = 'text-sm opacity-70';
    description.textContent =
      'The frontmatter a new note starts from. title, date, id and keywords are required: ' +
      'the app stamps the date and the id and fills the other two in when they are missing, ' +
      'and keeps every other line as you write it.';
    heading.append(title, description);

    const group = document.createElement('div');
    group.className = 'form-control gap-1';
    const label = document.createElement('span');
    label.className = 'label-text';
    label.textContent = 'Default frontmatter';
    this.field = document.createElement('textarea');
    this.field.className = 'textarea textarea-bordered h-48 w-full font-mono text-sm';
    this.field.setAttribute('spellcheck', 'false');
    this.field.setAttribute('data-new-file-frontmatter', 'true');
    const hint = document.createElement('p');
    hint.className = 'text-xs opacity-60';
    hint.textContent = 'Written without the --- fences: the app puts them around it.';
    group.append(label, this.field, hint);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-3';
    const saveButton = this.button('Save', () => void this.save(), 'btn-primary');
    const resetButton = this.button('Reset', () => {
      this.field.value = DEFAULT_TEMPLATE;
    });
    this.status = document.createElement('span');
    this.status.className = 'text-sm opacity-70';
    actions.append(saveButton, resetButton, this.status);

    this.appendChild(heading);
    this.appendChild(group);
    this.appendChild(actions);
    void this.load();
  }

  private button(label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${extraClass}`.trim();
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  private async load(): Promise<void> {
    try {
      const config = await configManager.load();
      this.field.value = config.new_file_frontmatter || DEFAULT_TEMPLATE;
    } catch (error) {
      console.error('Failed to load the new-note settings:', error);
      this.field.value = DEFAULT_TEMPLATE;
      this.status.textContent = 'Failed to load settings';
    }
  }

  private async save(): Promise<void> {
    try {
      await configManager.update({ new_file_frontmatter: this.field.value });
      this.status.textContent = 'Saved';
      window.setTimeout(() => {
        this.status.textContent = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to save the new-note settings:', error);
      this.status.textContent = `Failed to save: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
