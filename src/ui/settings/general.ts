/**
 * The General tab of the settings window: the language the app speaks, whether opening a file
 * pushes the document on screen into the stack, whether this workspace keeps versions with git,
 * and where an image the reader inserts is saved.
 *
 * Empty is the default and it means *beside the note*, so a reader who never chose a folder
 * follows the app rather than a folder frozen into their config the first time anything else was
 * saved (`settings/`). The field takes a path the way a reader writes one — `~/Pictures/Yi` is
 * fine — and `services/settings_paths.ts` is what spells the home folder out when it is used.
 *
 * Choices and switches save the moment they change. The folder is text the reader is still
 * typing, so it saves after a short pause and immediately on blur, Browse, Clear or Enter. The
 * appearance radios apply at once: Auto removes the explicit daisyUI theme, Light uses winter and
 * Dark uses dim. The versioning switch asks the same question the action asks
 * (`versioning/dialog.ts`), because consent belongs to a folder and this window is the reader's
 * other way to give it.
 *
 * May import: the config manager, theme service, dialog plugin's folder picker, autosave queue and
 * component base. Upholds: the app config is the one home of every setting — this window reads it
 * when it opens, writes each answer through the config manager, and keeps no second copy.
 */

import { open } from '@tauri-apps/plugin-dialog';
import { versioningFacts } from '../../api/versioning';
import { configManager } from '../../services/config_manager';
import { LANGUAGES, t } from '../../services/i18n';
import { languageFor } from '../../services/language';
import { applyTheme, themeFor, type ThemeChoice } from '../../services/theme';
import { consentFrom, versionLocation, versioningPlan } from '../../services/versioning';
import { BaseComponent } from '../component';
import { versioningDialog } from '../versioning/index';
import { createTextAutosave } from './autosave';
import { SaveStatus } from './save_status';

export class GeneralSettings extends BaseComponent {
  private readonly languageSelect: HTMLSelectElement;
  private readonly themeChoices: HTMLInputElement[];
  private readonly pushToggle: HTMLInputElement;
  private readonly versionToggle: HTMLInputElement;
  private readonly versionWhere: HTMLParagraphElement;
  private readonly folderInput: HTMLInputElement;
  private readonly saveStatus: SaveStatus;
  private readonly folderAutosave = createTextAutosave(() => this.saveImageFolder());

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

    const appearanceGroup = document.createElement('fieldset');
    appearanceGroup.className = 'form-control gap-2';
    const appearanceLabel = document.createElement('legend');
    appearanceLabel.className = 'label-text';
    appearanceLabel.textContent = t('settings.general.appearance');
    const appearanceHint = document.createElement('p');
    appearanceHint.className = 'text-xs opacity-60';
    appearanceHint.textContent = t('settings.general.appearanceHint');
    const appearances = document.createElement('div');
    appearances.className = 'flex flex-wrap gap-4';
    this.themeChoices = (
      [
        ['auto', t('settings.general.themeAuto')],
        ['light', t('settings.general.themeLight')],
        ['dark', t('settings.general.themeDark')]
      ] as const
    ).map(([value, label]) => {
      const row = document.createElement('label');
      row.className = 'label cursor-pointer justify-start gap-2';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'settings-appearance';
      input.value = value;
      input.className = 'radio radio-sm';
      input.setAttribute('data-theme-choice', value);
      input.addEventListener('change', () => {
        if (input.checked) {
          void this.chooseTheme(value);
        }
      });
      const words = document.createElement('span');
      words.className = 'label-text';
      words.textContent = label;
      row.append(input, words);
      appearances.appendChild(row);
      return input;
    });
    appearanceGroup.append(appearanceLabel, appearanceHint, appearances);

    // Whether the stack takes the document on screen when a file is opened over it. The switch
    // carries its own meaning: `session/rules.ts: openDecision` is where the rule the words
    // describe lives, and this only answers it.
    const stackGroup = document.createElement('div');
    stackGroup.className = 'form-control gap-1';
    const stackRow = document.createElement('label');
    stackRow.className = 'label cursor-pointer justify-start gap-3';
    this.pushToggle = document.createElement('input');
    this.pushToggle.type = 'checkbox';
    this.pushToggle.className = 'toggle';
    this.pushToggle.setAttribute('data-push-unstacked', 'true');
    const stackLabel = document.createElement('span');
    stackLabel.className = 'label-text';
    stackLabel.textContent = t('settings.general.pushUnstacked');
    stackRow.append(this.pushToggle, stackLabel);
    const stackHint = document.createElement('p');
    stackHint.className = 'text-xs opacity-60';
    stackHint.textContent = t('settings.general.pushUnstackedHint');
    stackGroup.append(stackRow, stackHint);
    this.pushToggle.addEventListener('change', () => void this.choosePush());

    // Whether this workspace keeps versions with git. The switch carries the reader's standing
    // answer for *this* folder (`services/versioning/rules.ts: consentFrom`); the version itself is only
    // ever made when they ask for one, which the hint says, and the line below says where it would
    // live — the one path worth knowing before the reader says yes.
    const versionGroup = document.createElement('div');
    versionGroup.className = 'form-control gap-1';
    const versionRow = document.createElement('label');
    versionRow.className = 'label cursor-pointer justify-start gap-3';
    this.versionToggle = document.createElement('input');
    this.versionToggle.type = 'checkbox';
    this.versionToggle.className = 'toggle';
    this.versionToggle.setAttribute('data-versioning-switch', 'true');
    const versionLabel = document.createElement('span');
    versionLabel.className = 'label-text';
    versionLabel.textContent = t('settings.general.versioning');
    versionRow.append(this.versionToggle, versionLabel);
    const versionHint = document.createElement('p');
    versionHint.className = 'text-xs opacity-60';
    versionHint.textContent = t('settings.general.versioningHint');
    this.versionWhere = document.createElement('p');
    this.versionWhere.className = 'break-all rounded bg-base-100 px-2 py-1 font-mono text-xs';
    this.versionWhere.setAttribute('data-versioning-where', 'true');
    versionGroup.append(versionRow, versionHint, this.versionWhere);
    this.versionToggle.addEventListener('change', () => void this.chooseVersioning());

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
    this.folderInput.addEventListener('input', () => this.folderAutosave.schedule());
    this.folderInput.addEventListener('blur', () => void this.folderAutosave.flush());
    this.folderInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.folderAutosave.flush();
      }
    });
    const row = document.createElement('div');
    row.className = 'flex gap-2';
    row.append(
      this.folderInput,
      this.button(t('settings.browse'), () => void this.pickFolder()),
      this.button(t('settings.clear'), () => {
        this.folderInput.value = '';
        this.folderAutosave.schedule();
        void this.folderAutosave.flush();
      })
    );
    group.append(label, hint, row);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-3';
    const status = document.createElement('span');
    status.className = 'text-sm opacity-70';
    this.saveStatus = new SaveStatus(status);
    actions.append(status);

    this.appendChild(heading);
    this.appendChild(languageGroup);
    this.appendChild(appearanceGroup);
    this.appendChild(stackGroup);
    this.appendChild(versionGroup);
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
      const theme = themeFor(config);
      for (const choice of this.themeChoices) {
        choice.checked = choice.value === theme;
      }
      this.pushToggle.checked = config.push_unstacked_on_open === true;
      const workspace = config.workspace ?? null;
      this.versionToggle.checked = workspace !== null && consentFrom(config, workspace) === 'yes';
      this.folderInput.value = config.image_folder ?? '';
      await this.showVersionWhere();
    } catch (error) {
      console.error('Failed to load the general settings:', error);
      this.saveStatus.failedToLoad();
    }
  }

  private async chooseLanguage(): Promise<void> {
    this.saveStatus.saving();
    try {
      await configManager.update({ language: this.languageSelect.value });
      this.saveStatus.saved();
    } catch (error) {
      this.saveStatus.failed('the language', error);
    }
  }

  private async chooseTheme(theme: ThemeChoice): Promise<void> {
    const previous = themeFor(configManager.get());
    applyTheme(theme);
    this.saveStatus.saving();
    try {
      await configManager.update({ theme });
      this.saveStatus.saved();
    } catch (error) {
      applyTheme(previous);
      this.saveStatus.failed('the appearance', error);
    }
  }

  /** Saves the switch the moment it is flipped, the way the language is saved when it is chosen. */
  private async choosePush(): Promise<void> {
    this.saveStatus.saving();
    try {
      await configManager.update({ push_unstacked_on_open: this.pushToggle.checked });
      this.saveStatus.saved();
    } catch (error) {
      this.saveStatus.failed('the stack setting', error);
    }
  }

  /** Where the versions of this workspace live, or would live; nothing when there is none. */
  private async showVersionWhere(): Promise<void> {
    const workspace = configManager.get()?.workspace ?? null;
    this.versionWhere.textContent = '';
    if (!workspace) {
      return;
    }
    try {
      const facts = await versioningFacts(workspace);
      if (facts.git === null) {
        this.versionWhere.textContent = t('settings.general.versioningNoGit');
        return;
      }
      this.versionWhere.textContent = versionLocation(facts, versioningPlan(facts, 'yes')) ?? '';
    } catch (error) {
      console.error('Failed to read what is true of the workspace:', error);
    }
  }

  /**
   * The versioning switch: off is an answer, and on is an answer that is asked for first — the same
   * question the action asks, because this is the same consent.
   */
  private async chooseVersioning(): Promise<void> {
    const workspace = configManager.get()?.workspace ?? null;
    if (!workspace) {
      this.versionToggle.checked = false;
      this.saveStatus.message(t('version.noWorkspace'));
      return;
    }
    try {
      this.saveStatus.saving();
      if (!this.versionToggle.checked) {
        // Off stops future versions and touches nothing that exists: a repository already there is
        // the reader's own, and this only stops the app asking for versions of it.
        await configManager.update({ versioning: false, versioning_workspace: workspace });
        this.saveStatus.saved();
        return;
      }
      const facts = await versioningFacts(workspace);
      if (facts.git === null) {
        this.versionToggle.checked = false;
        await this.showVersionWhere();
        return;
      }
      const agreed = await versioningDialog.ask({ ask: 'consent', location: null, separated: false });
      if (!agreed) {
        this.versionToggle.checked = false;
        return;
      }
      await configManager.update({ versioning: true, versioning_workspace: workspace });
      await this.showVersionWhere();
      this.saveStatus.saved();
    } catch (error) {
      this.saveStatus.failed('the versioning setting', error);
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
      this.folderAutosave.schedule();
      void this.folderAutosave.flush();
    }
  }

  private async saveImageFolder(): Promise<void> {
    this.saveStatus.saving();
    try {
      await configManager.update({ image_folder: this.folderInput.value.trim() });
      this.saveStatus.saved();
    } catch (error) {
      this.saveStatus.failed('the image folder', error);
    }
  }
}
