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
import { LANGUAGES, t } from '../../services/i18n';
import { languageFor } from '../../services/language';
import { BaseComponent } from '../component';

export class GeneralSettings extends BaseComponent {
  private readonly languageSelect: HTMLSelectElement;
  private readonly folderInput: HTMLInputElement;
  private readonly status: HTMLElement;

  constructor() {
    super('div', ['flex', 'flex-col', 'gap-6', 'max-w-xl']);

    const heading = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold';
    title.textContent = t('settings.general');
    const description = document.createElement('p');
    description.className = 'text-sm opacity-70';
    description.textContent = t('settings.general.description');
    heading.append(title, description);

    // The language is saved the moment it is chosen: a label is read where it is drawn, so the app
    // answers by reloading itself (`main.ts`), and a Save button the reader would have to find
    // after the window has already changed language is one button too many.
    const languageGroup = document.createElement('div');
    languageGroup.className = 'form-control gap-1';
    const languageLabel = document.createElement('span');
    languageLabel.className = 'label-text';
    languageLabel.textContent = t('settings.general.language');
    const languageHint = document.createElement('p');
    languageHint.className = 'text-xs opacity-60';
    languageHint.textContent = t('settings.general.languageHint');
    this.languageSelect = document.createElement('select');
    this.languageSelect.className = 'select select-bordered w-full';
    this.languageSelect.setAttribute('data-language', 'true');
    for (const known of LANGUAGES) {
      const option = document.createElement('option');
      option.value = known.code;
      // A language's own name is not translated: a reader looking for theirs finds it written the
      // way they write it.
      option.textContent = known.name;
      this.languageSelect.appendChild(option);
    }
    this.languageSelect.addEventListener('change', () => void this.chooseLanguage());
    languageGroup.append(languageLabel, languageHint, this.languageSelect);

    const group = document.createElement('div');
    group.className = 'form-control gap-1';
    const label = document.createElement('label');
    label.className = 'label';
    const labelText = document.createElement('span');
    labelText.className = 'label-text';
    labelText.textContent = t('settings.general.imageFolder');
    label.appendChild(labelText);
    const hint = document.createElement('p');
    hint.className = 'text-xs opacity-60';
    hint.textContent = t('settings.general.imageFolderHint');
    this.folderInput = document.createElement('input');
    this.folderInput.type = 'text';
    this.folderInput.placeholder = t('settings.general.imageFolderPlaceholder');
    this.folderInput.className = 'input input-bordered flex-1';
    this.folderInput.setAttribute('data-image-folder', 'true');
    const row = document.createElement('div');
    row.className = 'flex gap-2';
    row.append(
      this.folderInput,
      this.button(t('settings.browse'), () => void this.pickFolder()),
      this.button(t('settings.clear'), () => {
        this.folderInput.value = '';
      })
    );
    group.append(label, hint, row);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-3';
    const saveButton = this.button(t('settings.save'), () => void this.save(), 'btn-primary');
    this.status = document.createElement('span');
    this.status.className = 'text-sm opacity-70';
    actions.append(saveButton, this.status);

    this.appendChild(heading);
    this.appendChild(languageGroup);
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
      this.languageSelect.value = await languageFor(config);
      this.folderInput.value = config.image_folder ?? '';
    } catch (error) {
      console.error('Failed to load the general settings:', error);
      this.status.textContent = t('settings.failedToLoad');
    }
  }

  private async chooseLanguage(): Promise<void> {
    try {
      await configManager.update({ language: this.languageSelect.value });
    } catch (error) {
      console.error('Failed to save the language:', error);
      const message = error instanceof Error ? error.message : String(error);
      this.status.textContent = t('settings.failedToSave', { message });
    }
  }

  private async pickFolder(): Promise<void> {
    const chosen = await open({
      directory: true,
      multiple: false,
      title: t('settings.general.chooseImageFolder'),
      defaultPath: this.folderInput.value.trim() || undefined
    });
    if (typeof chosen === 'string') {
      this.folderInput.value = chosen;
    }
  }

  private async save(): Promise<void> {
    try {
      await configManager.update({ image_folder: this.folderInput.value.trim() });
      this.status.textContent = t('settings.saved');
      window.setTimeout(() => {
        this.status.textContent = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to save the general settings:', error);
      const message = error instanceof Error ? error.message : String(error);
      this.status.textContent = t('settings.failedToSave', { message });
    }
  }
}
