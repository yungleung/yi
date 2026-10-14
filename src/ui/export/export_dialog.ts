/**
 * The card that asks how a note goes out: where.
 *
 * It is about **one kind**, and that kind was chosen before the card was drawn: the File menu's
 * *Export* is a submenu with an item per kind (`src-tauri/src/menu.rs`), and the item's own kind
 * travels with the event that opens this. So the card asks the one thing left — where the file goes
 * — and names what writes it: the kind's own defaults file, which is the reader's to edit, or the
 * app itself, for the one kind that needs no pandoc at all. Every fact on it comes from the app
 * rather than from this module (`api/export.ts: exportKinds`), so a kind added to the Rust side
 * appears in the menu and here without a line of this file changing.
 *
 * The target is a real field, and that is deliberate — the app's questions take a native sheet for
 * a reader and a card for a probe (`ui/prompt.ts` is the same pair), because a probe cannot drive a
 * sheet. Here the reader gets both: they may type a path or pick one.
 *
 * Escape is the answer that writes nothing (no output, no configuration file): the cautious one.
 *
 * May import: the question card, the export seam and the catalogue. Upholds: one question, one
 * answer — a kind and a path, or nothing — so the flow cannot export something nobody asked for.
 */

import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { exportConfigPath, type ExportKindInfo } from '../../api/export';
import { t } from '../../services/i18n';
import { notify } from '../../services/messages';
import { QuestionCard } from '../floating/question_card';

/** What the card is asked with: the kind the menu named, and the note's own path without an extension. */
export interface ExportQuestion {
  /** The kind to export, chosen by the menu item that opened this card. */
  kind: ExportKindInfo;
  /** The pandoc the app would run, or null when this machine has none. */
  pandoc: string | null;
  /**
   * The note's own path with no extension (`/notes/a note`): the card builds a target out of it and
   * the chosen kind's own name suffix and extension, which is how the markdown kind's output can be
   * `a note.processed.md` rather than the note itself.
   */
  baseTarget: string;
}

/** The reader's answer: where the file goes. */
export interface ExportAnswer {
  outputPath: string;
}

/** The label a kind is offered under, or its own name when the catalogues have none. */
function kindLabel(kind: string): string {
  if (kind === 'docx') {
    return t('export.kind.docx');
  }
  if (kind === 'odt') {
    return t('export.kind.odt');
  }
  if (kind === 'latex') {
    return t('export.kind.latex');
  }
  if (kind === 'html') {
    return t('export.kind.html');
  }
  if (kind === 'epub') {
    return t('export.kind.epub');
  }
  if (kind === 'pdf') {
    return t('export.kind.pdf');
  }
  if (kind === 'markdown') {
    return t('export.kind.markdown');
  }
  // A kind with no label of its own is shown by its name: an untranslated item is better than none,
  // and this is the same fallback `i18n.ts` gives a key no catalogue holds.
  return kind;
}

export class ExportDialog extends QuestionCard<ExportAnswer | null> {
  private readonly heading: HTMLParagraphElement;
  private readonly targetLabel: HTMLLabelElement;
  private readonly target: HTMLInputElement;
  private readonly choose: HTMLButtonElement;
  private readonly configLabel: HTMLSpanElement;
  private readonly configPath: HTMLSpanElement;
  private readonly openConfig: HTMLButtonElement;
  /** The configuration row: the kind's own defaults file, which every export of it reads. */
  private readonly configRowElement: HTMLElement;
  private readonly status: HTMLParagraphElement;
  private readonly form: HTMLFormElement;
  private readonly run: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;

  private question: ExportQuestion | null = null;
  /** Whether the reader has written in the target field: what they typed is not overwritten. */
  private edited = false;

  constructor() {
    super('w-[32rem]');
    this.element.setAttribute('data-export-dialog', 'true');
    this.card.setAttribute('data-export-card', 'true');

    this.heading = document.createElement('p');
    this.heading.className = 'mb-2 text-sm font-semibold';
    this.heading.textContent = t('export.title');

    this.target = document.createElement('input');
    this.target.type = 'text';
    this.target.className = 'input input-bordered input-sm w-full';
    this.target.setAttribute('data-export-target', 'true');
    this.target.setAttribute('spellcheck', 'false');
    this.target.addEventListener('input', () => {
      this.edited = true;
    });
    this.targetLabel = document.createElement('label');
    this.targetLabel.className = 'label-text text-xs';
    this.targetLabel.textContent = t('export.target');

    this.choose = this.button('export-choose', t('export.choose'), 'btn btn-ghost btn-sm', () =>
      void this.pick()
    );

    this.configLabel = document.createElement('span');
    this.configLabel.className = 'block text-xs opacity-70';
    this.configLabel.textContent = t('export.configLabel');
    this.configPath = document.createElement('span');
    this.configPath.className = 'block break-all text-xs opacity-60';
    this.configPath.setAttribute('data-export-config', 'true');
    this.openConfig = this.button(
      'export-open-config',
      t('export.revealConfig'),
      'btn btn-ghost btn-xs px-0',
      () => void this.revealConfiguration()
    );

    this.status = document.createElement('p');
    this.status.className = 'mt-2 min-h-4 text-xs opacity-70';
    this.status.setAttribute('data-export-status', 'true');
    // Built *after* the three things it holds: a row made before its own children exist is an empty
    // one (measured the hard way — the card's configuration row was nowhere in the page).
    this.configRowElement = this.configRow();

    this.form = document.createElement('form');
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.export();
    });
    this.cancel = this.button('export-cancel', t('export.cancel'), 'btn btn-ghost btn-sm', () =>
      this.settle(null)
    );
    this.run = this.button('export-run', t('export.run'), 'btn btn-primary btn-sm', null, 'submit');
    this.form.append(
      this.row(this.targetLabel, this.target, this.choose),
      this.configRowElement,
      this.status,
      this.actions()
    );
  }

  /** Escape writes nothing at all: no file, and not even the configuration file. */
  protected cautious(): ExportAnswer | null {
    return null;
  }

  /** Asks. Null is the reader saying no. */
  async ask(question: ExportQuestion): Promise<ExportAnswer | null> {
    this.question = question;
    this.edited = false;
    // The kind is the menu's answer, not the card's question: the card is *about* one kind, and the
    // heading says which — the reader picked it in the File menu, one item per kind.
    this.heading.textContent = `${t('export.title')} — ${kindLabel(question.kind.kind)}`;
    // On the dialog itself, which is what a probe reads as *the* card (the veil is the surface).
    this.element.setAttribute('data-export-kind', question.kind.kind);
    const answered = this.askWith(() =>
      this.card.append(this.heading, this.form)
    );
    this.show();
    // The caret goes to the path, selected up to its extension: the folder is the part a reader
    // most often wants to change, and the name is the part the app got right.
    this.target.focus();
    this.target.setSelectionRange(0, this.target.value.replace(/\.[^./\\]*$/, '').length);
    return await answered;
  }

  /** Shows the kind's own target, its settings file, and what would write it. */
  private show(): void {
    const info = this.question?.kind ?? null;
    if (!info) {
      return;
    }
    const pandoc = this.question?.pandoc ?? null;
    // The target is the note's own path, the kind's own name suffix and its extension — unless the
    // reader has written in the field, in which case what they typed is theirs.
    if (!this.edited) {
      this.target.value = `${this.question?.baseTarget ?? ''}${info.name_suffix}.${info.extension}`;
    }
    // A kind the app writes itself has no defaults file: the row is taken away rather than naming a
    // path that will never be written.
    this.configRowElement.classList.toggle('hidden', !info.needs_pandoc);
    // A file the reader has not been given yet is a place as much as a file: the first export (or
    // the button below) writes the shipped defaults there, and an edited file is never rewritten.
    this.configPath.textContent = info.config_exists
      ? info.config_path
      : t('export.configNew', { path: info.config_path });
    // What would write it: pandoc, or the app itself for the kind that needs none.
    this.status.textContent = !info.needs_pandoc
      ? t('export.ownHand')
      : pandoc === null
        ? t('export.noPandoc')
        : t('export.pandoc', { path: pandoc });
    // A kind that cannot run is not offered a button that would fail: the sentence above says why.
    this.run.disabled = info.needs_pandoc && pandoc === null;
  }

  /** The system's own sheet, for a reader who would rather not type a path. */
  private async pick(): Promise<void> {
    const info = this.question?.kind ?? null;
    if (!info) {
      return;
    }
    const chosen = await saveDialog({
      defaultPath: this.target.value,
      filters: [{ name: kindLabel(info.kind), extensions: [info.extension] }]
    });
    if (chosen !== null) {
      this.target.value = chosen;
      this.edited = true;
    }
  }

  /**
   * Reveals the kind's configuration file in the folder it lives in, with the file selected.
   *
   * *Revealed* rather than opened: which editor a file belongs to is the reader's own arrangement,
   * and the folder they can see is one they can drag the file out of, open in whatever they like,
   * or copy before changing. The app's tree reveals a file the same way (`tree_ops.ts: reveal`).
   */
  private async revealConfiguration(): Promise<void> {
    const kind = this.question?.kind.kind ?? '';
    try {
      const path = await exportConfigPath(kind);
      this.configPath.textContent = path;
      await revealItemInDir(path);
    } catch (error) {
      notify('Export configuration', error);
    }
  }

  /** The answer: only a path with something in it, since an empty one names no file. */
  private export(): void {
    const outputPath = this.target.value.trim();
    if (outputPath === '') {
      this.status.textContent = t('export.noTarget');
      return;
    }
    this.settle({ outputPath });
  }

  private row(label: HTMLElement, control: HTMLElement, ...rest: HTMLElement[]): HTMLElement {
    const group = document.createElement('div');
    group.className = 'flex flex-col gap-1';
    const line = document.createElement('div');
    line.className = 'flex items-center gap-2';
    line.append(control, ...rest);
    group.append(label, line);
    return group;
  }

  private configRow(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'mt-3 flex flex-col gap-1';
    group.append(this.configLabel, this.configPath, this.openConfig);
    return group;
  }

  private actions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    actions.append(this.cancel, this.run);
    return actions;
  }

  private button(
    name: string,
    label: string,
    className: string,
    onClick: (() => void) | null,
    type: 'button' | 'submit' = 'button'
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = type;
    button.className = className;
    button.textContent = label;
    button.setAttribute(`data-${name}`, 'true');
    if (onClick) {
      button.addEventListener('click', onClick);
    }
    return button;
  }
}

/** The one export dialog the window has. */
export const exportDialog = new ExportDialog();
