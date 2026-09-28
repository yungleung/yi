/**
 * The General tab of the settings window: where an image the reader inserts is saved.
 *
 * Empty is the default and it means *beside the note*, so a reader who never chose a folder
 * follows the app rather than a folder frozen into their config the first time anything else was
 * saved (`settings.rs`). The field takes a path the way a reader writes one — `~/Pictures/Yi` is
 * fine — and `services/settings_paths.ts` is what spells the home folder out when it is used.
 *
 * May import: the config manager, the dialog plugin's folder picker, and the component base.
 * Upholds: the app config is the one home of the setting — this window reads it when it opens and
 * writes it when the reader saves, and nothing keeps a second copy.
 */

import { open } from '@tauri-apps/plugin-dialog';
import { configManager } from '../../services/config_manager';
import { BaseComponent } from '../component';

export class GeneralSettings extends BaseComponent {
  private readonly folderInput: HTMLInputElement;
  private readonly status: HTMLElement;

  constructor() {
    super('div', ['flex', 'flex-col', 'gap-6', 'max-w-xl']);

    const heading = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold';
    title.textContent = 'General';
    const description = document.createElement('p');
    description.className = 'text-sm opacity-70';
    description.textContent = 'Where the app keeps things it takes from the system.';
    heading.append(title, description);

    const group = document.createElement('div');
    group.className = 'form-control gap-1';
    const label = document.createElement('label');
    label.className = 'label';
    const labelText = document.createElement('span');
    labelText.className = 'label-text';
    labelText.textContent = 'Image folder';
    label.appendChild(labelText);
    const hint = document.createElement('p');
    hint.className = 'text-xs opacity-60';
    hint.textContent = 'Where an image you insert is saved. Left empty, it is saved beside the note.';
    this.folderInput = document.createElement('input');
    this.folderInput.type = 'text';
    this.folderInput.placeholder = 'Beside the note';
    this.folderInput.className = 'input input-bordered flex-1';
    this.folderInput.setAttribute('data-image-folder', 'true');
    const row = document.createElement('div');
    row.className = 'flex gap-2';
    row.append(
      this.folderInput,
      this.button('Browse…', () => void this.pickFolder()),
      this.button('Clear', () => {
        this.folderInput.value = '';
      })
    );
    group.append(label, hint, row);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-3';
    const saveButton = this.button('Save', () => void this.save(), 'btn-primary');
    this.status = document.createElement('span');
    this.status.className = 'text-sm opacity-70';
    actions.append(saveButton, this.status);

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
      this.folderInput.value = config.image_folder ?? '';
    } catch (error) {
      console.error('Failed to load the general settings:', error);
      this.status.textContent = 'Failed to load settings';
    }
  }

  private async pickFolder(): Promise<void> {
    const chosen = await open({
      directory: true,
      multiple: false,
      title: 'Choose the image folder',
      defaultPath: this.folderInput.value.trim() || undefined
    });
    if (typeof chosen === 'string') {
      this.folderInput.value = chosen;
    }
  }

  private async save(): Promise<void> {
    try {
      await configManager.update({ image_folder: this.folderInput.value.trim() });
      this.status.textContent = 'Saved';
      window.setTimeout(() => {
        this.status.textContent = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to save the general settings:', error);
      this.status.textContent = `Failed to save: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
