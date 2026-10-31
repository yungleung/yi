/**
 * The package details a reader may change without touching the manifest's JSON.
 *
 * Name, export kind, provenance source, licence and entry are the facts the app can check; the id
 * stays because a saved export choice points at it. The entry list is filtered by kind, so a Word
 * package can only name a reference document and a text package only a template.
 *
 * May import: the template seam, the catalogue and the question card. Upholds: a details edit
 * cannot make a manifest whose entry and mode disagree.
 */

import { type DetailsPatch, type TemplateSummary } from '../../../api/templates';
import { t } from '../../../services/i18n';
import { QuestionCard } from '../../floating/question_card';
import { kindLabel, TEMPLATE_KINDS } from './kind_label';

function isReference(name: string): boolean {
  return /\.(docx|odt)$/i.test(name);
}

function isText(name: string): boolean {
  return /\.(tex|html|htm)$/i.test(name);
}

/** One details form at a time. */
export class TemplateDetailsDialog extends QuestionCard<DetailsPatch | null> {
  private readonly form: HTMLFormElement;
  private readonly name: HTMLInputElement;
  private readonly kind: HTMLSelectElement;
  private readonly entry: HTMLSelectElement;
  private readonly source: HTMLInputElement;
  private readonly license: HTMLInputElement;
  private readonly status: HTMLParagraphElement;
  private summary: TemplateSummary | null = null;

  constructor() {
    super('w-[34rem]');
    this.element.setAttribute('data-template-details', 'true');
    const heading = document.createElement('p');
    heading.className = 'mb-3 text-sm font-semibold';
    heading.textContent = t('template.detailsTitle');

    this.name = this.input('template-details-name', 'text');
    this.kind = document.createElement('select');
    this.kind.className = 'select select-bordered select-sm';
    this.kind.setAttribute('data-template-details-kind', 'true');
    this.kind.append(
      ...TEMPLATE_KINDS.map((kind) => {
        const option = document.createElement('option');
        option.value = kind;
        option.textContent = kindLabel(kind);
        return option;
      })
    );
    this.kind.addEventListener('change', () => this.fillEntries());
    this.entry = document.createElement('select');
    this.entry.className = 'select select-bordered select-sm';
    this.entry.setAttribute('data-template-details-entry', 'true');
    this.source = this.input('template-details-source', 'url');
    this.license = this.input('template-details-license', 'text');
    this.status = document.createElement('p');
    this.status.className = 'mt-2 min-h-4 text-xs text-error';
    this.status.setAttribute('data-template-details-status', 'true');

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-ghost btn-sm';
    cancel.textContent = t('template.cancel');
    cancel.addEventListener('click', () => this.settle(null));
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn btn-primary btn-sm';
    save.textContent = t('template.saveDetails');
    save.setAttribute('data-template-details-save', 'true');
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    actions.append(cancel, save);

    this.form = document.createElement('form');
    this.form.setAttribute('data-template-details-form', 'true');
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit();
    });
    this.form.append(
      heading,
      this.field(t('template.name'), this.name),
      this.field(t('template.kind'), this.kind),
      this.field(t('template.entry'), this.entry),
      this.field(t('template.source'), this.source),
      this.field(t('template.license'), this.license),
      this.status,
      actions
    );
  }

  protected cautious(): DetailsPatch | null {
    return null;
  }

  async ask(summary: TemplateSummary): Promise<DetailsPatch | null> {
    this.summary = summary;
    const manifest = summary.manifest;
    if (manifest === null) {
      return null;
    }
    this.name.value = manifest.name;
    this.kind.value = manifest.kind;
    this.source.value = manifest.origin.source ?? '';
    this.license.value = manifest.origin.license ?? '';
    this.status.textContent = '';
    this.fillEntries(manifest.template ?? manifest.reference_doc ?? '');
    const answered = this.askWith(() => this.card.append(this.form));
    this.name.focus();
    this.name.select();
    return await answered;
  }

  private fillEntries(preferred?: string): void {
    const reference = this.kind.value === 'docx' || this.kind.value === 'odt';
    const files = (this.summary?.files ?? [])
      .map((file) => file.name)
      .filter((name) => (reference ? isReference(name) : isText(name)));
    this.entry.replaceChildren(
      ...files.map((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        return option;
      })
    );
    if (preferred !== undefined && files.includes(preferred)) {
      this.entry.value = preferred;
    }
  }

  private submit(): void {
    const name = this.name.value.trim();
    if (name === '') {
      this.status.textContent = t('template.nameEmpty');
      return;
    }
    if (this.entry.value === '') {
      this.status.textContent = t('template.noEntryForKind');
      return;
    }
    this.settle({
      name,
      kind: this.kind.value,
      entry: this.entry.value,
      source: this.source.value.trim() || null,
      license: this.license.value.trim() || null
    });
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const group = document.createElement('div');
    group.className = 'mt-2 flex flex-col gap-1';
    const words = document.createElement('label');
    words.className = 'label-text text-xs';
    words.textContent = label;
    group.append(words, control);
    return group;
  }

  private input(name: string, type: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = type;
    input.className = 'input input-bordered input-sm w-full';
    input.setAttribute(`data-${name}`, 'true');
    return input;
  }
}

/** A broken package has no editable form; its identity, path and reason are still useful. */
class BrokenTemplateDetailsDialog extends QuestionCard<void> {
  constructor() {
    super('w-[34rem]');
    this.element.setAttribute('data-broken-template-details', 'true');
  }

  protected cautious(): void {}

  async show(summary: TemplateSummary): Promise<void> {
    const heading = document.createElement('p');
    heading.className = 'text-sm font-semibold';
    heading.textContent = t('template.detailsTitle');
    const facts = document.createElement('dl');
    facts.className = 'mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs';
    for (const [label, value] of [
      [t('template.name'), summary.id],
      [t('template.source'), summary.path],
      [t('template.broken'), summary.error ?? '']
    ]) {
      const term = document.createElement('dt');
      term.className = 'font-semibold';
      term.textContent = label;
      const description = document.createElement('dd');
      description.className = 'break-all';
      description.textContent = value;
      facts.append(term, description);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-ghost btn-sm';
    close.textContent = t('template.closeBrokenDetails');
    close.setAttribute('data-broken-template-details-close', 'true');
    close.addEventListener('click', () => this.settle());
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end';
    actions.append(close);
    await this.askWith(() => this.card.append(heading, facts, actions));
  }
}

export const templateDetailsDialog = new TemplateDetailsDialog();
const brokenTemplateDetailsDialog = new BrokenTemplateDetailsDialog();

/** Shows the exact diagnostic state of a package whose manifest cannot be read. */
export function showBrokenTemplateDetails(summary: TemplateSummary): void {
  void brokenTemplateDetailsDialog.show(summary);
}
