/**
 * What an inspected template would become, before a byte of it is copied.
 *
 * The proposal is the backend's: the entry it found, the wrapper it would make, the files that
 * travel, and what it could not decide. The reader answers the questions a scan cannot: the name,
 * the export kind, the licence, and whether the wrapper maps the sample's title and author.
 *
 * May import: the template seam, the catalogue, the question card and the kind labels. Upholds:
 * importing is one confirmed answer, and nothing is written while the card is open.
 */

import {
  wrapperPreview,
  type ImportProposal,
  type ImportRequest
} from '../../../api/templates';
import { t } from '../../../services/i18n';
import { QuestionCard } from '../../floating';
import { kindLabel } from '../kind_label';

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const name = parts[parts.length - 1] ?? 'template';
  return name.replace(/\.(zip|tex|html|htm|docx|odt|csl|yaml|yml)$/i, '') || 'template';
}

function textEntry(name: string): boolean {
  return /\.(tex|html|htm)$/i.test(name);
}

function referenceEntry(name: string): boolean {
  return /\.(docx|odt)$/i.test(name);
}

/** One question about a proposal, answered with the exact import request. */
export class ImportProposalDialog extends QuestionCard<ImportRequest | null> {
  private proposal: ImportProposal | null = null;
  private source = '';
  private readonly heading: HTMLParagraphElement;
  private readonly nameLabel: HTMLLabelElement;
  private readonly name: HTMLInputElement;
  private readonly kindLabelElement: HTMLLabelElement;
  private readonly kind: HTMLSelectElement;
  private readonly entryLabel: HTMLLabelElement;
  private readonly entry: HTMLSelectElement;
  private readonly sourceLabel: HTMLLabelElement;
  private readonly sourceField: HTMLInputElement;
  private readonly licenseLabel: HTMLLabelElement;
  private readonly license: HTMLInputElement;
  private readonly warnings: HTMLUListElement;
  private readonly files: HTMLDivElement;
  private readonly wrapperBox: HTMLDivElement;
  private readonly wrapperText: HTMLParagraphElement;
  private readonly mapTitle: HTMLInputElement;
  private readonly mapAuthor: HTMLInputElement;
  private readonly preview: HTMLPreElement;
  private readonly trust: HTMLParagraphElement;
  private readonly status: HTMLParagraphElement;
  private readonly importButton: HTMLButtonElement;

  constructor() {
    super('w-[40rem] max-h-[88vh] overflow-auto');
    this.element.setAttribute('data-template-import', 'true');

    this.heading = document.createElement('p');
    this.heading.className = 'mb-3 text-sm font-semibold';
    this.heading.textContent = t('template.importTitle');

    this.name = this.input('template-import-name', 'text', '');
    this.nameLabel = this.label(t('template.name'));
    this.kind = document.createElement('select');
    this.kind.className = 'select select-bordered select-sm';
    this.kind.setAttribute('data-template-import-kind', 'true');
    this.kind.addEventListener('change', () => this.fitEntryToKind());
    this.kindLabelElement = this.label(t('template.kind'));
    this.entry = document.createElement('select');
    this.entry.className = 'select select-bordered select-sm w-full';
    this.entry.setAttribute('data-template-import-entry', 'true');
    this.entry.addEventListener('change', () => void this.previewWrapper());
    this.entryLabel = this.label(t('template.entry'));
    this.sourceField = this.input('template-import-source', 'url', '');
    this.sourceLabel = this.label(t('template.source'));
    this.license = this.input('template-import-license', 'text', '');
    this.licenseLabel = this.label(t('template.license'));

    this.warnings = document.createElement('ul');
    this.warnings.className = 'mt-2 list-disc pl-5 text-xs text-warning';
    this.warnings.setAttribute('data-template-import-warnings', 'true');
    this.files = document.createElement('div');
    this.files.className = 'mt-2 max-h-24 overflow-auto rounded border border-base-300 p-2 text-xs';
    this.files.setAttribute('data-template-import-files', 'true');

    this.wrapperBox = document.createElement('div');
    this.wrapperBox.className = 'mt-3 rounded border border-base-300 p-2';
    this.wrapperBox.setAttribute('data-template-wrapper', 'true');
    this.wrapperText = document.createElement('p');
    this.wrapperText.className = 'text-xs opacity-80';
    this.mapTitle = this.checkbox('template-wrapper-title', t('template.mapTitle'));
    this.mapAuthor = this.checkbox('template-wrapper-author', t('template.mapAuthor'));
    this.mapTitle.addEventListener('change', () => void this.previewWrapper());
    this.mapAuthor.addEventListener('change', () => void this.previewWrapper());
    this.preview = document.createElement('pre');
    this.preview.className =
      'mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-base-200 p-2 text-[0.7rem]';
    this.preview.setAttribute('data-template-wrapper-preview', 'true');
    this.wrapperBox.append(
      this.wrapperText,
      this.checkboxRow(this.mapTitle),
      this.checkboxRow(this.mapAuthor),
      this.preview
    );

    this.trust = document.createElement('p');
    this.trust.className = 'mt-3 text-xs opacity-70';
    this.trust.setAttribute('data-template-trust', 'true');
    this.trust.textContent = t('template.trustNotice');
    this.status = document.createElement('p');
    this.status.className = 'mt-2 min-h-4 text-xs opacity-70';
    this.status.setAttribute('data-template-import-status', 'true');

    this.importButton = document.createElement('button');
    this.importButton.type = 'button';
    this.importButton.className = 'btn btn-primary btn-sm';
    this.importButton.textContent = t('template.import');
    this.importButton.setAttribute('data-template-import-run', 'true');
    this.importButton.addEventListener('click', () => this.submit());
    this.form = document.createElement('form');
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit();
    });
  }

  private readonly form: HTMLFormElement;

  protected cautious(): ImportRequest | null {
    return null;
  }

  async ask(source: string, proposal: ImportProposal): Promise<ImportRequest | null> {
    this.proposal = proposal;
    this.source = source;
    this.name.value = baseName(source);
    this.sourceField.value = '';
    this.license.value = '';
    this.mapTitle.checked = false;
    this.mapAuthor.checked = false;
    this.status.textContent = '';
    this.heading.textContent = t('template.importTitle');

    const kinds = this.allowedKinds(proposal);
    this.kind.replaceChildren(
      ...kinds.map((kind) => {
        const option = document.createElement('option');
        option.value = kind;
        option.textContent = kindLabel(kind);
        return option;
      })
    );
    const suggested = proposal.suggested_kind;
    this.kind.value =
      suggested !== null && kinds.includes(suggested) ? suggested : kinds[0] ?? 'latex';
    this.kind.disabled = kinds.length <= 1;
    this.entry.replaceChildren();
    this.warnings.replaceChildren();
    for (const warning of proposal.warnings) {
      const item = document.createElement('li');
      item.textContent = warning;
      this.warnings.append(item);
    }
    this.warnings.classList.toggle('hidden', proposal.warnings.length === 0);
    this.files.replaceChildren(
      ...proposal.files.map((file) => {
        const row = document.createElement('div');
        row.className = 'flex justify-between gap-2';
        row.textContent = file.name;
        const size = document.createElement('span');
        size.className = 'opacity-50';
        size.textContent = `${file.size} B`;
        row.append(size);
        return row;
      })
    );
    this.wrapperBox.classList.toggle('hidden', proposal.wrapper === null);
    if (proposal.wrapper !== null) {
      this.wrapperText.textContent = t('template.wrapperDescription', {
        source: proposal.wrapper.source_entry,
        entry: proposal.wrapper.entry,
        insertion: proposal.wrapper.insertion
      });
      this.preview.textContent = proposal.wrapper.preview;
    }
    this.fitEntryToKind(proposal.entry);
    this.form.replaceChildren(
      this.heading,
      this.field(this.nameLabel, this.name),
      this.field(this.kindLabelElement, this.kind),
      this.field(this.entryLabel, this.entry),
      this.field(this.sourceLabel, this.sourceField),
      this.field(this.licenseLabel, this.license),
      this.warnings,
      this.files,
      this.wrapperBox,
      this.trust,
      this.status,
      this.actions()
    );
    const answered = this.askWith(() => this.card.append(this.form));
    this.name.focus();
    this.name.select();
    return await answered;
  }

  private allowedKinds(proposal: ImportProposal): string[] {
    if (proposal.kind === 'reference-doc') {
      return ['docx', 'odt'];
    }
    if (proposal.kind === 'template') {
      return ['latex', 'pdf', 'html', 'epub'];
    }
    return ['latex', 'pdf', 'html', 'epub', 'docx', 'odt'];
  }

  private fitEntryToKind(preferred?: string): void {
    const proposal = this.proposal;
    if (proposal === null) {
      return;
    }
    const reference = this.kind.value === 'docx' || this.kind.value === 'odt';
    const candidates = [
      ...new Set([
        ...proposal.entry_candidates,
        proposal.entry,
        ...proposal.files.map((file) => file.name)
      ])
    ].filter((name) => (reference ? referenceEntry(name) : textEntry(name)));
    const usable = candidates.length > 0 ? candidates : [proposal.entry];
    this.entry.replaceChildren(
      ...usable.map((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        return option;
      })
    );
    this.entry.value =
      preferred !== undefined && usable.includes(preferred)
        ? preferred
        : proposal.entry_candidates.find((name) => usable.includes(name)) ?? usable[0];
    void this.previewWrapper();
  }

  private async previewWrapper(): Promise<void> {
    const proposal = this.proposal;
    const wrapper = proposal?.wrapper;
    if (wrapper === undefined || wrapper === null || this.entry.value !== wrapper.source_entry) {
      this.wrapperBox.classList.add('hidden');
      return;
    }
    this.wrapperBox.classList.remove('hidden');
    try {
      this.preview.textContent = await wrapperPreview(
        this.source,
        this.entry.value,
        this.mapTitle.checked,
        this.mapAuthor.checked
      );
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  private submit(): void {
    if (this.proposal === null) {
      return;
    }
    const name = this.name.value.trim();
    if (name === '') {
      this.status.textContent = t('template.nameEmpty');
      return;
    }
    this.settle({
      source: this.source,
      name,
      kind: this.kind.value,
      entry: this.entry.value || null,
      source_url: this.sourceField.value.trim() || null,
      license: this.license.value.trim() || null,
      map_title: this.mapTitle.checked,
      map_author: this.mapAuthor.checked
    });
  }

  private actions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-ghost btn-sm';
    cancel.textContent = t('template.cancel');
    cancel.setAttribute('data-template-import-cancel', 'true');
    cancel.addEventListener('click', () => this.settle(null));
    actions.append(cancel, this.importButton);
    return actions;
  }

  private field(label: HTMLElement, control: HTMLElement): HTMLElement {
    const group = document.createElement('div');
    group.className = 'mt-2 flex flex-col gap-1';
    group.append(label, control);
    return group;
  }

  private label(text: string): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'label-text text-xs';
    label.textContent = text;
    return label;
  }

  private input(name: string, type: string, value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = type;
    input.className = 'input input-bordered input-sm w-full';
    input.value = value;
    input.setAttribute(`data-${name}`, 'true');
    return input;
  }

  private checkbox(name: string, label: string): HTMLInputElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'checkbox checkbox-sm';
    box.setAttribute(`data-${name}`, 'true');
    box.title = label;
    return box;
  }

  private checkboxRow(box: HTMLInputElement): HTMLElement {
    const row = document.createElement('label');
    row.className = 'mt-1 flex items-center gap-2 text-xs';
    row.append(box, document.createTextNode(box.title));
    return row;
  }

}

/** The one import proposal the window has. */
export const importProposalDialog = new ImportProposalDialog();
