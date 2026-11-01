/**
 * Builds and updates the export question's form without running export workflows.
 *
 * Example: choosing a PDF reveals page/orientation fields, while choosing Markdown
 * hides its defaults row; both use the same selectors as before.
 *
 * May import: question/answer types, translations and daisyUI/Tailwind primitives.
 * Upholds: form presentation owns no file, config, template or export operation.
 */

import { t } from '../../../services/i18n';
import type { TemplateSummary } from '../../../api/templates';
import type { ExportAnswer, ExportQuestion } from '../dialog';
import {
  buttonRow,
  checkbox,
  checkboxRow,
  diagnostic,
  element,
  formButton,
  label,
  labelledRow,
  option,
  rowGroup,
  select,
  textBlock
} from './controls';

/** Workflow actions the form invokes when a reader presses its controls. */
export interface ExportFormHandlers {
  readonly targetEdited: () => void;
  readonly pickTarget: () => void;
  readonly editDefaults: () => void;
  readonly replaceConfiguration: () => void;
  readonly chooseTemplate: () => void;
  readonly createTemplate: () => void;
  readonly editTemplate: () => void;
  readonly cancel: () => void;
  readonly submit: () => void;
}

/** The visible form of one export kind. */
export class ExportForm {
  readonly heading: HTMLParagraphElement;
  readonly element: HTMLFormElement;

  private readonly targetLabel: HTMLLabelElement;
  private readonly target: HTMLInputElement;
  private readonly configPath: HTMLSpanElement;
  private readonly replaceConfig: HTMLButtonElement;
  private readonly configRow: HTMLElement;
  private readonly templateValue: HTMLSpanElement;
  private readonly createTemplateButton: HTMLButtonElement;
  private readonly editTemplateButton: HTMLButtonElement;
  private readonly templateRow: HTMLElement;
  private readonly paper: HTMLSelectElement;
  private readonly orientation: HTMLSelectElement;
  private readonly pageRow: HTMLElement;
  private readonly noReferences: HTMLInputElement;
  private readonly selfContained: HTMLInputElement;
  private readonly remoteRevealjs: HTMLInputElement;
  private readonly remotePictures: HTMLInputElement;
  private readonly selfContainedRow: HTMLElement;
  private readonly remoteRevealjsRow: HTMLElement;
  private readonly remotePicturesRow: HTMLElement;
  private readonly status: HTMLParagraphElement;
  private readonly fontHint: HTMLParagraphElement;
  private readonly unknownFonts: HTMLParagraphElement;
  private readonly notPictures: HTMLParagraphElement;

  constructor(handlers: ExportFormHandlers) {
    this.heading = element('p', 'mb-2 text-sm font-semibold', t('export.title'));

    this.target = document.createElement('input');
    this.target.type = 'text';
    this.target.className = 'input input-bordered input-sm w-full';
    this.target.setAttribute('data-export-target', 'true');
    this.target.setAttribute('spellcheck', 'false');
    this.target.addEventListener('input', handlers.targetEdited);
    this.targetLabel = label(t('export.target'));

    const choose = formButton(
      'export-choose',
      t('export.choose'),
      'btn btn-ghost btn-sm',
      handlers.pickTarget
    );
    const configLabel = textBlock(t('export.configLabel'), 'block text-xs opacity-70');
    this.configPath = textBlock('', 'block break-all text-xs opacity-60');
    this.configPath.setAttribute('data-export-config', 'true');
    const openConfig = formButton(
      'export-open-config',
      t('export.editDefaults'),
      'btn btn-ghost btn-xs px-0',
      handlers.editDefaults
    );
    this.replaceConfig = formButton(
      'export-replace-config',
      t('export.replaceConfig'),
      'btn btn-ghost btn-xs px-0',
      handlers.replaceConfiguration
    );
    this.configRow = rowGroup(configLabel, this.configPath, buttonRow(openConfig, this.replaceConfig));

    this.paper = select('data-export-paper');
    this.orientation = select('data-export-orientation');
    this.pageRow = rowGroup(
      labelledRow(label(t('export.paper')), this.paper),
      labelledRow(label(t('export.orientation')), this.orientation)
    );
    this.pageRow.className = 'mt-3 flex gap-3';

    const templateLabel = textBlock(t('template.rowLabel'), 'block text-xs opacity-70');
    this.templateValue = textBlock('', 'block break-all text-xs');
    this.templateValue.setAttribute('data-export-template', 'true');
    const chooseTemplate = formButton(
      'export-choose-template',
      t('template.choose'),
      'btn btn-ghost btn-xs px-0',
      handlers.chooseTemplate
    );
    this.createTemplateButton = formButton(
      'export-create-template',
      t('template.create'),
      'btn btn-ghost btn-xs px-0',
      handlers.createTemplate
    );
    this.editTemplateButton = formButton(
      'export-edit-template',
      t('template.edit'),
      'btn btn-ghost btn-xs px-0',
      handlers.editTemplate
    );
    this.templateRow = rowGroup(
      templateLabel,
      this.templateValue,
      buttonRow(chooseTemplate, this.createTemplateButton, this.editTemplateButton)
    );

    this.noReferences = checkbox('data-export-no-references');
    this.selfContained = checkbox('data-export-self-contained');
    this.remoteRevealjs = checkbox('data-export-revealjs-remote-js');
    this.remotePictures = checkbox('data-export-revealjs-remote-pictures');
    this.selfContainedRow = checkboxRow(this.selfContained, t('export.selfContained'));
    this.selfContainedRow.title = t('export.selfContainedHint');
    this.remoteRevealjsRow = checkboxRow(this.remoteRevealjs, t('export.remoteRevealjs'));
    this.remotePicturesRow = checkboxRow(this.remotePictures, t('export.remotePictures'));

    const noReferencesRow = checkboxRow(this.noReferences, t('export.noReferences'));
    this.status = element('p', 'mt-2 min-h-4 text-xs opacity-70', '');
    this.status.setAttribute('data-export-status', 'true');
    this.fontHint = diagnostic('data-export-font-hint', 'mt-1 hidden text-xs opacity-70');
    this.unknownFonts = diagnostic(
      'data-export-unknown-fonts',
      'mt-1 hidden text-xs text-error'
    );
    this.notPictures = diagnostic(
      'data-export-not-pictures',
      'mt-1 hidden text-xs opacity-70'
    );

    const cancel = formButton(
      'export-cancel',
      t('export.cancel'),
      'btn btn-ghost btn-sm',
      handlers.cancel
    );
    const run = formButton(
      'export-run',
      t('export.run'),
      'btn btn-primary btn-sm',
      null,
      'submit'
    );
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    actions.append(cancel, run);

    this.element = document.createElement('form');
    this.element.addEventListener('submit', (event) => {
      event.preventDefault();
      handlers.submit();
    });
    this.element.append(
      labelledRow(this.targetLabel, this.target, choose),
      this.configRow,
      this.templateRow,
      this.selfContainedRow,
      this.remoteRevealjsRow,
      this.remotePicturesRow,
      this.pageRow,
      noReferencesRow,
      this.status,
      this.fontHint,
      this.unknownFonts,
      this.notPictures,
      actions
    );
  }

  /** Updates every field for the selected export kind and note. */
  show(question: ExportQuestion, edited: boolean): void {
    const info = question.kind;
    const pandoc = question.pandoc;
    const bundleTarget = info.kind === 'html' || info.kind === 'revealjs';
    if (!edited) {
      this.target.value = bundleTarget
        ? question.baseTarget
        : `${question.baseTarget}${info.name_suffix}.${info.extension}`;
    }
    this.targetLabel.textContent = bundleTarget
      ? t('export.targetFolder')
      : t('export.target');
    this.configRow.classList.toggle('hidden', !info.needs_pandoc);
    this.templateRow.classList.toggle('hidden', info.template_mode === 'none');
    this.selfContainedRow.classList.toggle('hidden', info.kind !== 'html');
    this.remoteRevealjsRow.classList.toggle('hidden', info.kind !== 'revealjs');
    this.remotePicturesRow.classList.toggle('hidden', info.kind !== 'revealjs');
    this.replaceConfig.classList.toggle(
      'hidden',
      !info.config_exists || info.config_is_shipped
    );
    this.configPath.textContent = info.config_exists
      ? info.config_path
      : t('export.configNew', { path: info.config_path });
    this.pageRow.classList.toggle('hidden', !info.takes_a_page_size);
    this.noReferences.checked = false;
    this.selfContained.checked = false;
    this.remoteRevealjs.checked = false;
    this.remotePictures.checked = false;

    if (info.takes_a_page_size) {
      const own = t('export.paperOwn');
      this.paper.replaceChildren(
        option(own, ''),
        ...info.paper_sizes.map((size) => option(size.label, size.value))
      );
      this.orientation.replaceChildren(
        option(own, ''),
        option(t('export.portrait'), 'portrait'),
        option(t('export.landscape'), 'landscape')
      );
    }

    this.status.textContent = !info.needs_pandoc
      ? t('export.ownHand')
      : pandoc === null
        ? t('export.noPandoc')
        : t('export.pandoc', { path: pandoc });
    this.unknownFonts.classList.toggle('hidden', question.unknownFonts.length === 0);
    this.unknownFonts.textContent =
      question.unknownFonts.length === 0
        ? ''
        : t('export.unknownFont', { fonts: question.unknownFonts.join(', ') });
    this.fontHint.classList.toggle('hidden', question.uncovered.length === 0);
    this.fontHint.textContent =
      question.uncovered.length === 0
        ? ''
        : question.suggestedFont === null
          ? t('export.fontHint', { characters: shownCharacters(question.uncovered) })
          : t('export.fontHintFont', {
              characters: shownCharacters(question.uncovered),
              font: question.suggestedFont
            });
    this.notPictures.classList.toggle('hidden', question.notPictures.length === 0);
    this.notPictures.textContent =
      question.notPictures.length === 0
        ? ''
        : t('export.notPictures', {
            destinations: question.notPictures.slice(0, 4).join(', ')
          });
    this.element.querySelector<HTMLButtonElement>('[data-export-run]')!.disabled =
      info.needs_pandoc && pandoc === null;
  }

  /** Updates the selected package row. */
  showTemplate(
    packages: TemplateSummary[],
    selectedId: string | null,
    hasPandoc: boolean
  ): void {
    const selected = packages.find((summary) => summary.id === selectedId);
    this.templateValue.textContent =
      selectedId === null
        ? t('template.pandocDefault')
        : selected?.manifest?.name ?? t('template.missing', { id: selectedId });
    this.editTemplateButton.disabled = !selected?.manifest;
    this.createTemplateButton.disabled = !hasPandoc;
  }

  /** Focuses and selects the target's folder portion. */
  focusTarget(): void {
    this.target.focus();
    this.target.setSelectionRange(
      0,
      this.target.value.replace(/\.[^./\\]*$/, '').length
    );
  }

  /** The current target, used by a system picker. */
  get targetValue(): string {
    return this.target.value;
  }

  /** Replaces the target after a system picker answers. */
  setTargetValue(value: string): void {
    this.target.value = value;
  }

  /** Shows the restored defaults path and removes the offered replace action. */
  configurationRestored(path: string): void {
    this.configPath.textContent = path;
    this.replaceConfig.classList.add('hidden');
  }

  /** Shows why the current answer cannot be submitted. */
  noTarget(): void {
    this.status.textContent = t('export.noTarget');
  }

  /** Reads the current form as the export answer. */
  answer(templateId: string | null): ExportAnswer | null {
    const outputPath = this.target.value.trim();
    if (outputPath === '') {
      return null;
    }
    const orientation = this.orientation.value;
    return {
      outputPath,
      paper: this.paper.value === '' ? null : this.paper.value,
      landscape: orientation === '' ? null : orientation === 'landscape',
      suppressReferences: this.noReferences.checked,
      templateId,
      selfContained: this.selfContained.checked,
      revealjsRemoteJs: this.remoteRevealjs.checked,
      revealjsRemotePictures: this.remotePictures.checked
    };
  }

}

function shownCharacters(characters: string[]): string {
  return characters.slice(0, 8).join('') + (characters.length > 8 ? '…' : '');
}
