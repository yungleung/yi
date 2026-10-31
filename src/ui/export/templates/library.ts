/**
 * The package chooser: what the Template row's **Choose…** opens.
 *
 * The chooser is a question around the shared package browser. Pandoc's default is a valid answer,
 * and every package operation belongs to the browser rather than to this modal shell.
 *
 * May import: the package browser, export-kind facts, the template seam, the catalogue and the
 * question-card surface. Upholds: the chooser returns one package id, null for Pandoc's default,
 * or null for cancel, and otherwise preserves the shared browser unchanged.
 */

import type { ExportKindInfo } from '../../../api/export';
import { exportTemplates, type TemplateSummary } from '../../../api/templates';
import { t } from '../../../services/i18n';
import { QuestionCard } from '../../floating/question_card';
import { TemplatePackageBrowser } from './package_browser';
import { kindLabel } from './kind_label';

/** What the chooser answers: an id, null for Pandoc's default, or nothing for cancel. */
export interface TemplateChoice {
  id: string | null;
}

export class TemplateLibraryDialog extends QuestionCard<TemplateChoice | null> {
  private readonly heading: HTMLParagraphElement;
  private readonly hint: HTMLParagraphElement;
  private readonly browser: TemplatePackageBrowser;
  private readonly cancel: HTMLButtonElement;
  private info: ExportKindInfo | null = null;
  private pandoc: string | null = null;
  private packages: TemplateSummary[] = [];
  private selected: string | null = null;

  constructor() {
    super('w-[44rem] max-h-[88vh] overflow-auto');
    this.element.setAttribute('data-template-library', 'true');
    this.heading = document.createElement('p');
    this.heading.className = 'text-sm font-semibold';
    this.heading.setAttribute('data-template-library-heading', 'true');
    this.hint = document.createElement('p');
    this.hint.className = 'mt-1 text-xs opacity-70';
    this.hint.textContent = t('template.libraryHint');
    this.browser = new TemplatePackageBrowser({
      inspect: (id) => {
        this.selected = id;
        this.render();
      },
      primary: (id) => this.settle({ id }),
      changed: (packages, keepId) => {
        this.packages = packages;
        this.selected = keepId;
        this.render();
      }
    });
    this.cancel = this.button('cancel', t('template.cancel'), () => this.settle(null));
    this.card.setAttribute('data-template-library-card', 'true');
    this.card.classList.add('flex', 'flex-col', 'gap-3');
  }

  protected cautious(): TemplateChoice | null {
    return null;
  }

  async ask(
    info: ExportKindInfo,
    selected: string | null,
    pandoc: string | null
  ): Promise<TemplateChoice | null> {
    this.info = info;
    this.pandoc = pandoc;
    this.selected = selected;
    this.heading.textContent = t('template.libraryTitle', { kind: kindLabel(info.kind) });
    this.packages = await exportTemplates();
    if (
      this.selected !== null &&
      !this.packages.some(
        (summary) =>
          summary.id === this.selected &&
          (summary.manifest === null || summary.manifest.kind === info.kind)
      )
    ) {
      this.selected = null;
    }
    this.render();
    const answered = this.askWith(() => {
      this.card.append(this.heading, this.hint, this.browser.element, this.cancel);
    });
    this.render();
    return await answered;
  }

  private render(): void {
    if (this.info === null) {
      return;
    }
    this.browser.update({
      info: this.info,
      packages: this.packages,
      activeId: null,
      inspectedId: this.selected,
      pandoc: this.pandoc,
      primaryLabel: t('template.use')
    });
  }

  private button(
    name: string,
    label: string,
    onPress: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-ghost btn-sm self-end';
    button.textContent = label;
    button.setAttribute(`data-template-${name}`, 'true');
    button.addEventListener('click', onPress);
    return button;
  }
}

export const templateLibraryDialog = new TemplateLibraryDialog();
