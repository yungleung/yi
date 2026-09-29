import { open } from '@tauri-apps/plugin-dialog';
import { configManager } from '../../services/config_manager';
import { t } from '../../services/i18n';
import { BaseComponent } from '../component';

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
  private readonly status: HTMLElement;

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
    const browseButton = this.button(t('settings.browse'), () => void this.pickBibliography());
    const clearButton = this.button(t('settings.clear'), () => {
      this.bibliographyInput.value = '';
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
    styleGroup.appendChild(this.styleSelect);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-3';
    const saveButton = this.button(t('settings.save'), () => void this.save(), 'btn-primary');
    this.status = document.createElement('span');
    this.status.className = 'text-sm opacity-70';
    actions.append(saveButton, this.status);

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
      this.status.textContent = t('settings.failedToLoad');
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
    }
  }

  private async save(): Promise<void> {
    try {
      await configManager.update({
        bibliography_file: this.bibliographyInput.value.trim(),
        csl_style: this.styleSelect.value.trim()
      });
      this.status.textContent = t('settings.saved');
      window.setTimeout(() => {
        this.status.textContent = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to save the settings:', error);
      const message = error instanceof Error ? error.message : String(error);
      this.status.textContent = t('settings.failedToSave', { message });
    }
  }
}
