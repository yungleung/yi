/**
 * Template-package lifecycle operations shared by the chooser and Export Manager.
 *
 * Example: `inspectPath('/tmp/kit.zip')` asks the import dialog, imports the approved package,
 * reports the refreshed list through its host and opens the package editor.
 *
 * May import: the template API, package dialogs/editor, locale text and advice surfaces. Upholds:
 * package mutations return through one browser-facing host, while DOM layout and selection stay in
 * `browser.ts`.
 */

import { open } from '@tauri-apps/plugin-dialog';
import {
  createDefaultTemplate,
  duplicateTemplate,
  exportTemplates,
  importTemplate,
  inspectTemplate,
  removeTemplate,
  testTemplatePdf,
  updateTemplate,
  validateTemplate,
  type TemplateSummary
} from '../../../api/templates';
import { t } from '../../../services/i18n';
import { notify } from '../../../services/messages';
import { prompt } from '../../prompt';
import { createDefaultDialog } from './create_default_dialog';
import {
  showBrokenTemplateDetails,
  templateDetailsDialog
} from './details';
import { templateEditorPanel } from './editor';
import { importProposalDialog } from './import_dialog';
import { offeredForKind, offeredPackages } from './offering';

export interface TemplateOperationsHost {
  kind(): string | null;
  pandoc(): string | null;
  selected(): TemplateSummary | null;
  setStatus(status: string): void;
  changed(packages: TemplateSummary[], keepId: string | null): void;
  setBusy(action: 'validate' | 'testPdf', busy: boolean): void;
}

/** The one removal question shared by the package browser and unassigned-package page. */
export async function removeTemplatePackage(
  summary: TemplateSummary
): Promise<boolean> {
  const agreed = await prompt.ask({
    title: t('template.remove'),
    message: t('template.removeQuestion', {
      name: summary.manifest?.name ?? summary.id
    }),
    yes: t('template.remove'),
    no: t('template.cancel')
  });
  if (!agreed) {
    return false;
  }
  await removeTemplate(summary.id);
  return true;
}

export class TemplatePackageOperations {
  constructor(private readonly host: TemplateOperationsHost) {}

  async pick(folder: boolean): Promise<void> {
    try {
      const chosen = await open({
        directory: folder,
        multiple: false,
        ...(folder
          ? {}
          : {
              filters: [
                {
                  name: t('template.packageFilter'),
                  extensions: ['zip', 'tex', 'html', 'docx', 'odt']
                }
              ]
            })
      });
      if (typeof chosen === 'string') {
        await this.inspectPath(chosen);
      }
    } catch (error) {
      notify('Templates', error);
    }
  }

  async inspectPath(source: string): Promise<void> {
    if (source === '') {
      this.host.setStatus(t('template.importPathEmpty'));
      return;
    }
    await this.attempt(async () => {
      const proposal = await inspectTemplate(source);
      const request = await importProposalDialog.ask(source, proposal);
      if (request !== null) {
        await this.afterCreated(await importTemplate(request));
      }
    });
  }

  async create(): Promise<void> {
    const kind = this.host.kind();
    if (kind === null) {
      return;
    }
    if (this.host.pandoc() === null) {
      this.host.setStatus(t('export.noPandoc'));
      return;
    }
    const answer = await createDefaultDialog.ask(kind);
    if (answer === null) {
      return;
    }
    await this.attempt(async () => {
      await this.afterCreated(
        await createDefaultTemplate(kind, answer.name, answer.source, answer.license)
      );
    });
  }

  async editDetails(): Promise<void> {
    const summary = this.host.selected();
    if (summary === null) {
      return;
    }
    if (summary.manifest === null) {
      showBrokenTemplateDetails(summary);
      return;
    }
    const patch = await templateDetailsDialog.ask(summary);
    if (patch === null) {
      return;
    }
    await this.attempt(async () => {
      await this.refresh((await updateTemplate(summary.id, patch)).id);
    });
  }

  async duplicate(): Promise<void> {
    const summary = this.host.selected();
    if (summary === null) {
      return;
    }
    await this.attempt(async () => {
      await this.refresh((await duplicateTemplate(summary.id)).id);
    });
  }

  async edit(): Promise<void> {
    const summary = this.host.selected();
    if (summary !== null) {
      await templateEditorPanel.openPackage(summary, () => void this.refresh(summary.id));
    }
  }

  async validate(): Promise<void> {
    const summary = this.host.selected();
    if (summary === null) {
      return;
    }
    this.host.setBusy('validate', true);
    this.host.setStatus(t('template.validating'));
    try {
      const result = await validateTemplate(summary.id);
      this.host.setStatus([result.message, ...result.warnings].join('\n'));
    } catch (error) {
      this.host.setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      this.host.setBusy('validate', false);
    }
  }

  async testPdf(): Promise<void> {
    const summary = this.host.selected();
    if (summary === null) {
      return;
    }
    this.host.setBusy('testPdf', true);
    this.host.setStatus(t('template.testingPdf'));
    try {
      const result = await testTemplatePdf(summary.id);
      this.host.setStatus([result.message, ...result.warnings].join('\n'));
    } catch (error) {
      this.host.setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      this.host.setBusy('testPdf', false);
    }
  }

  async remove(): Promise<void> {
    const summary = this.host.selected();
    if (summary === null) {
      return;
    }
    await this.attempt(async () => {
      if (await removeTemplatePackage(summary)) {
        await this.refresh(null);
      }
    });
  }

  private async afterCreated(created: TemplateSummary): Promise<void> {
    const kind = this.host.kind();
    if (kind === null) {
      return;
    }
    const packages = await exportTemplates();
    const keepId = offeredForKind(created, kind) ? created.id : null;
    this.host.changed(packages, keepId);
    await templateEditorPanel.openPackage(created, () => void this.refresh(keepId));
  }

  private async refresh(keepId: string | null): Promise<void> {
    const kind = this.host.kind();
    if (kind === null) {
      return;
    }
    const packages = await exportTemplates();
    const stillThere =
      keepId !== null &&
      offeredPackages(packages, kind).some((summary) => summary.id === keepId);
    this.host.changed(packages, stillThere ? keepId : null);
  }

  private async attempt(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.host.setStatus(error instanceof Error ? error.message : String(error));
      notify('Templates', error);
    }
  }
}
