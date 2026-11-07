/**
 * The Citation tab: the bibliography file and the CSL style, each chosen through the system's own
 * file picker.
 *
 * May import: the dialog plugin, the config manager, the catalogue, the autosave queue and the
 * component base. Upholds: paths save after a pause or on blur, the style saves when chosen, and
 * the bibliography's own reload hears every write through one manager.
 */

import { open } from '@tauri-apps/plugin-dialog';
import { configManager } from '../../services/config_manager';
import { t } from '../../services/i18n';
import { BaseComponent } from '../component';
import { createTextAutosave } from './autosave';
import { SaveStatus } from './save_status';

/** CSL styles bundled with citation-js. */
const CSL_STYLES = [
  { value: 'apa', label: 'APA' },
  { value: 'vancouver', label: 'Vancouver' },
  { value: 'harvard1', label: 'Harvard' }
];

/**
 * Citation configuration tab: an optional bibliography file (picked from the
 * system) and an optional CSL style bundled with citation-js.
 */
export class CitationSettings extends BaseComponent {
  private readonly bibliographyInput: HTMLInputElement;
  private readonly styleSelect: HTMLSelectElement;
  private readonly saveStatus: SaveStatus;
  private readonly autosave = createTextAutosave(() => this.saveCitation());

  constructor() {
    super('div', ['flex', 'flex-col', 'gap-6', 'max-w-xl']);

    const heading = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold';
    title.textContent = t('settings.citation');
    const description = document.createElement('p');
    description.className = 'text-sm opacity-70';
    description.textContent = t('settings.citation.description');
    heading.append(title, description);

    const fileGroup = this.buildField(
      t('settings.citation.file'),
      t('settings.citation.fileHint')
    );
    this.bibliographyInput = document.createElement('input');
    this.bibliographyInput.type = 'text';
    this.bibliographyInput.placeholder = t('settings.citation.filePlaceholder');
    this.bibliographyInput.className = 'input input-bordered flex-1';
    this.bibliographyInput.addEventListener('input', () =>
      this.autosave.schedule()
    );
    this.bibliographyInput.addEventListener('blur', () =>
      void this.autosave.flush()
    );
    this.bibliographyInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.autosave.flush();
      }
    });
    const browseButton = this.button(t('settings.browse'), () => void this.pickBibliography());
    const clearButton = this.button(t('settings.clear'), () => {
      this.bibliographyInput.value = '';
      this.autosave.schedule();
      void this.autosave.flush();
    });
    const row = document.createElement('div');
    row.className = 'flex gap-2';
    row.append(this.bibliographyInput, browseButton, clearButton);
    fileGroup.appendChild(row);

    const styleGroup = this.buildField(
      t('settings.citation.style'),
      t('settings.citation.styleHint')
    );
    this.styleSelect = document.createElement('select');
    this.styleSelect.className = 'select select-bordered w-full';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = t('settings.citation.styleDefault');
    this.styleSelect.appendChild(emptyOption);
    for (const style of CSL_STYLES) {
      const option = document.createElement('option');
      option.value = style.value;
      option.textContent = style.label;
      this.styleSelect.appendChild(option);
    }
    this.styleSelect.addEventListener('change', () => {
      this.autosave.schedule();
      void this.autosave.flush();
    });
    styleGroup.appendChild(this.styleSelect);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-3';
    const status = document.createElement('span');
    status.className = 'text-sm opacity-70';
    this.saveStatus = new SaveStatus(status);
    actions.append(status);

    this.appendChild(heading);
    this.appendChild(fileGroup);
    this.appendChild(styleGroup);
    this.appendChild(actions);

    void this.load();
  }

  private buildField(label: string, hint: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'form-control gap-1';
    const labelEl = document.createElement('label');
    labelEl.className = 'label';
    const labelText = document.createElement('span');
    labelText.className = 'label-text';
    labelText.textContent = label;
    labelEl.appendChild(labelText);
    const hintEl = document.createElement('p');
    hintEl.className = 'text-xs opacity-60';
    hintEl.textContent = hint;
    group.append(labelEl, hintEl);
    return group;
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
      this.bibliographyInput.value = config.bibliography_file || '';
      this.styleSelect.value = config.csl_style || '';
    } catch (error) {
      console.error('Failed to load the settings:', error);
      this.saveStatus.failedToLoad();
    }
  }

  private async pickBibliography(): Promise<void> {
    const bibliographyFile = configManager.get()?.bibliography_file;
    const defaultPath = bibliographyFile?.startsWith('~')
      ? undefined
      : (bibliographyFile || undefined);
    const selected = await open({
      multiple: false,
      title: t('settings.citation.chooseFile'),
      filters: [{ name: 'Bibliography', extensions: ['json', 'bib'] }],
      defaultPath
    });
    if (typeof selected === 'string') {
      this.bibliographyInput.value = selected;
      this.autosave.schedule();
      void this.autosave.flush();
    }
  }

  private async saveCitation(): Promise<void> {
    this.saveStatus.saving();
    try {
      await configManager.update({
        bibliography_file: this.bibliographyInput.value.trim(),
        csl_style: this.styleSelect.value.trim()
      });
      this.saveStatus.saved();
    } catch (error) {
      this.saveStatus.failed('the citation settings', error);
    }
  }
}
