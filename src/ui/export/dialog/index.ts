/**
 * The card that asks how a note goes out: where.
 *
 * Example: the File menu names `pdf`; this card renders that kind's path,
 * page, template and font diagnostics, then returns only the reader's answer.
 *
 * May import: the question card, export/template seams, config and the form view.
 * Upholds: one question, one answer — a target and options, or nothing.
 */

import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { restoreExportConfig, type ExportKindInfo } from '../../../api/export';
import {
  createDefaultTemplate,
  exportTemplates,
  type TemplateSummary
} from '../../../api/templates';
import { configManager } from '../../../services/config_manager';
import { t } from '../../../services/i18n';
import { notify } from '../../../services/messages';
import { prompt } from '../../prompt';
import { QuestionCard } from '../../floating';
import { ExportForm } from './form';
import {
  createDefaultDialog,
  templateEditorPanel,
  templateLibraryDialog
} from '../templates';
import { kindLabel } from '../kind_label';

/** What the card is asked with: the kind the menu named and the note's target stem. */
export interface ExportQuestion {
  readonly kind: ExportKindInfo;
  readonly pandoc: string | null;
  readonly baseTarget: string;
  readonly uncovered: string[];
  readonly suggestedFont: string | null;
  readonly unknownFonts: string[];
  readonly notPictures: string[];
  readonly templates: TemplateSummary[];
  readonly selectedTemplateId: string | null;
}

/** The reader's answer: where and how the note is written. */
export interface ExportAnswer {
  readonly outputPath: string;
  readonly paper: string | null;
  readonly landscape: boolean | null;
  readonly suppressReferences: boolean;
  readonly templateId: string | null;
  readonly selfContained: boolean;
  readonly revealjsRemoteJs: boolean;
  readonly revealjsRemotePictures: boolean;
}

/**
 * The one export question, with form presentation delegated to `ExportForm`.
 *
 * Example: choosing a package updates both the row and remembered config before
 * the reader submits; pressing Escape writes neither.
 */
export class ExportDialog extends QuestionCard<ExportAnswer | null> {
  private readonly heading: HTMLParagraphElement;
  private readonly form: ExportForm;
  private question: ExportQuestion | null = null;
  private templatePackages: TemplateSummary[] = [];
  private selectedTemplateId: string | null = null;
  private edited = false;

  constructor() {
    super('w-[32rem]');
    this.element.setAttribute('data-export-dialog', 'true');
    this.card.setAttribute('data-export-card', 'true');
    this.form = new ExportForm({
      targetEdited: () => {
        this.edited = true;
      },
      pickTarget: () => void this.pick(),
      editDefaults: () => void this.editDefaults(),
      replaceConfiguration: () => void this.replaceConfiguration(),
      chooseTemplate: () => void this.chooseTemplatePackage(),
      createTemplate: () => void this.createTemplatePackage(),
      editTemplate: () => void this.editTemplatePackage(),
      cancel: () => this.settle(null),
      submit: () => this.export()
    });
    this.heading = this.form.heading;
  }

  /** Escape writes nothing: no file, no config, no template selection. */
  protected cautious(): ExportAnswer | null {
    return null;
  }

  /** Asks. Null is the reader saying no. */
  async ask(question: ExportQuestion): Promise<ExportAnswer | null> {
    this.question = question;
    this.templatePackages = question.templates;
    this.selectedTemplateId = question.selectedTemplateId;
    this.edited = false;
    this.heading.textContent = `${t('export.title')} — ${kindLabel(question.kind.kind)}`;
    this.element.setAttribute('data-export-kind', question.kind.kind);
    const answered = this.askWith(() =>
      this.card.append(this.heading, this.form.element)
    );
    this.form.show(question, this.edited);
    this.showTemplate();
    this.form.focusTarget();
    return await answered;
  }

  /** Uses the system sheet for a reader who would rather not type a path. */
  private async pick(): Promise<void> {
    const info = this.question?.kind ?? null;
    if (!info) {
      return;
    }
    if (info.kind === 'html' || info.kind === 'revealjs') {
      const parent = this.form.targetValue.replace(/[\\/][^\\/]*$/, '');
      const chosen = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: parent
      });
      if (typeof chosen === 'string') {
        const name =
          (this.question?.baseTarget ?? '')
            .split(/[\\/]/)
            .filter(Boolean)
            .pop() ?? 'page';
        this.form.setTargetValue(await join(chosen, name));
        this.edited = true;
      }
      return;
    }
    const chosen = await saveDialog({
      defaultPath: this.form.targetValue,
      filters: [{ name: kindLabel(info.kind), extensions: [info.extension] }]
    });
    if (chosen !== null) {
      this.form.setTargetValue(chosen);
      this.edited = true;
    }
  }

  /** Opens the kind's defaults file in the shared template editor. */
  private async editDefaults(): Promise<void> {
    const kind = this.question?.kind.kind ?? '';
    await templateEditorPanel.openDefaults(kind, kindLabel(kind));
  }

  /** Says which package this export uses, or pandoc's own template. */
  private showTemplate(): void {
    this.form.showTemplate(
      this.templatePackages,
      this.selectedTemplateId,
      this.question !== null && this.question.pandoc !== null
    );
  }

  private async chooseTemplatePackage(): Promise<void> {
    const info = this.question?.kind ?? null;
    if (info === null) {
      return;
    }
    const choice = await templateLibraryDialog.ask(
      info,
      this.selectedTemplateId,
      this.question?.pandoc ?? null
    );
    if (choice === null) {
      return;
    }
    await this.refreshTemplates();
    await this.selectTemplate(choice.id);
  }

  private async createTemplatePackage(): Promise<void> {
    const info = this.question?.kind ?? null;
    if (info === null) {
      return;
    }
    const answer = await createDefaultDialog.ask(info.kind);
    if (answer === null) {
      return;
    }
    try {
      const created = await createDefaultTemplate(
        info.kind,
        answer.name,
        answer.source,
        answer.license
      );
      await this.refreshTemplates();
      await this.selectTemplate(created.id);
      await templateEditorPanel.openPackage(created, async () => {
        await this.refreshTemplates();
        this.showTemplate();
      });
    } catch (error) {
      notify('Export template', error);
    }
  }

  private async editTemplatePackage(): Promise<void> {
    const summary = this.templatePackages.find(
      (entry) => entry.id === this.selectedTemplateId
    );
    if (summary === undefined) {
      return;
    }
    await templateEditorPanel.openPackage(summary, async () => {
      await this.refreshTemplates();
      this.showTemplate();
    });
  }

  /** A choice made here is remembered for later exports of the same kind. */
  private async selectTemplate(id: string | null): Promise<void> {
    const kind = this.question?.kind.kind ?? '';
    this.selectedTemplateId = id;
    const current = configManager.get();
    if (current !== null) {
      const remembered = { ...(current.export_templates ?? {}) };
      if (id === null) {
        delete remembered[kind];
      } else {
        remembered[kind] = id;
      }
      await configManager.update({ export_templates: remembered });
    }
    this.showTemplate();
  }

  private async refreshTemplates(): Promise<void> {
    this.templatePackages = await exportTemplates();
  }

  /** Restores the shipped defaults after the reader agrees. */
  private async replaceConfiguration(): Promise<void> {
    const info = this.question?.kind ?? null;
    if (!info) {
      return;
    }
    const agreed = await prompt.ask({
      title: t('export.configLabel'),
      message: t('export.replaceQuestion', { path: info.config_path }),
      yes: t('export.replaceConfig'),
      no: t('export.cancel')
    });
    if (!agreed) {
      return;
    }
    try {
      this.form.configurationRestored(await restoreExportConfig(info.kind));
    } catch (error) {
      notify('Export configuration', error);
    }
  }

  /** Settles with the form's answer, or keeps the card open for an empty target. */
  private export(): void {
    const answer = this.form.answer(this.selectedTemplateId);
    if (answer === null) {
      this.form.noTarget();
      return;
    }
    this.settle(answer);
  }
}

/** The one export dialog the window has. */
export const exportDialog = new ExportDialog();

export { ExportForm } from './form';
export type { ExportFormHandlers } from './form';
