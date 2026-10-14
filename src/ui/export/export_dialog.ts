/**
 * The card that asks how a note goes out: which kind, and where.
 *
 * One tab per kind the app ships, the target it will be written to, the configuration file the
 * reader may edit, and what is going to do the work. Every fact on it comes from the app rather
 * than from this module (`api/export.ts: exportKinds`), so a kind added to the Rust side appears
 * here without a line of this file changing, and the *configuration* tab is the file itself: the
 * button opens the reader's own text editor on it, because the parameters are theirs to change.
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

/** What the card is asked with: the kinds to offer, and the target to start on. */
export interface ExportQuestion {
  kinds: ExportKindInfo[];
  /** The pandoc the app would run, or null when this machine has none. */
  pandoc: string | null;
  /** The path to write to before the reader changes anything. */
  defaultTarget: string;
}

/** The reader's answer: which kind, and where the file goes. */
export interface ExportAnswer {
  kind: string;
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
  // A kind with no label of its own is shown by its name: an untranslated tab is better than none,
  // and this is the same fallback `i18n.ts` gives a key no catalogue holds.
  return kind;
}

export class ExportDialog extends QuestionCard<ExportAnswer | null> {
  private readonly heading: HTMLParagraphElement;
  private readonly tabs: HTMLDivElement;
  private readonly targetLabel: HTMLLabelElement;
  private readonly target: HTMLInputElement;
  private readonly choose: HTMLButtonElement;
  private readonly configLabel: HTMLSpanElement;
  private readonly configPath: HTMLSpanElement;
  private readonly openConfig: HTMLButtonElement;
  private readonly status: HTMLParagraphElement;
  private readonly form: HTMLFormElement;
  private readonly run: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;

  private question: ExportQuestion | null = null;
  /** The kind on show now. */
  private selected = '';
  /** Whether the reader has written in the target field: what they typed is not overwritten. */
  private edited = false;

  constructor() {
    super('w-[32rem]');
    this.element.setAttribute('data-export-dialog', 'true');
    this.card.setAttribute('data-export-card', 'true');

    this.heading = document.createElement('p');
    this.heading.className = 'mb-2 text-sm font-semibold';
    this.heading.textContent = t('export.title');

    this.tabs = document.createElement('div');
    this.tabs.className = 'tabs tabs-box tabs-sm mb-3';
    this.tabs.setAttribute('role', 'tablist');
    this.tabs.setAttribute('data-export-tabs', 'true');

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
      this.configRow(),
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
    this.buildTabs(question.kinds);
    this.target.value = question.defaultTarget;
    const answered = this.askWith(() =>
      this.card.append(this.heading, this.tabs, this.form)
    );
    // The caret goes to the path, selected up to its extension: the folder is the part a reader
    // most often wants to change, and the name is the part the app got right.
    this.show(question.kinds[0]?.kind ?? '');
    this.target.focus();
    this.target.setSelectionRange(0, this.target.value.replace(/\.[^./\\]*$/, '').length);
    return await answered;
  }

  /** The tabs: one per kind, each remembering the kind it stands for. */
  private buildTabs(kinds: ExportKindInfo[]): void {
    this.tabs.replaceChildren(
      ...kinds.map((info) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'tab';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('data-export-tab', info.kind);
        tab.textContent = kindLabel(info.kind);
        tab.addEventListener('click', () => this.show(info.kind));
        return tab;
      })
    );
  }

  /** Shows a kind: its tab, its extension, its configuration file, and what would run it. */
  private show(kind: string): void {
    const info = this.question?.kinds.find((known) => known.kind === kind) ?? null;
    if (!info) {
      return;
    }
    const before = this.selected;
    this.selected = kind;
    for (const tab of this.tabs.querySelectorAll<HTMLElement>('[data-export-tab]')) {
      const mine = tab.dataset.exportTab === kind;
      tab.classList.toggle('tab-active', mine);
      tab.setAttribute('aria-selected', mine ? 'true' : 'false');
    }
    this.retarget(info, before);
    // A file the reader has not been given yet is a place as much as a file: the first export (or
    // the button below) writes the shipped defaults there, and an edited file is never rewritten.
    this.configPath.textContent = info.config_exists
      ? info.config_path
      : t('export.configNew', { path: info.config_path });
    const pandoc = this.question?.pandoc ?? null;
    this.status.textContent =
      info.needs_pandoc && pandoc === null
        ? t('export.noPandoc')
        : info.needs_pandoc
          ? t('export.pandoc', { path: pandoc ?? '' })
          : '';
    // A kind that cannot run is not offered a button that would fail: the sentence above says why.
    this.run.disabled = info.needs_pandoc && pandoc === null;
  }

  /**
   * Points the target at the kind on show: the note's own name under the new extension when the
   * reader has not written in the field, and — when they have — only the extension they were just
   * looking at, so that a path they chose keeps its name.
   */
  private retarget(info: ExportKindInfo, before: string): void {
    const extension = `.${info.extension}`;
    if (!this.edited) {
      this.target.value = this.target.value.replace(/\.[^./\\]*$/, '') + extension;
      return;
    }
    const previous = this.question?.kinds.find((known) => known.kind === before) ?? null;
    const was = previous ? `.${previous.extension}` : null;
    if (was !== null && was !== extension && this.target.value.endsWith(was)) {
      this.target.value = this.target.value.slice(0, -was.length) + extension;
    }
  }

  /** The system's own sheet, for a reader who would rather not type a path. */
  private async pick(): Promise<void> {
    const info = this.question?.kinds.find((known) => known.kind === this.selected) ?? null;
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
    try {
      const path = await exportConfigPath(this.selected);
      this.configPath.textContent = path;
      await revealItemInDir(path);
    } catch (error) {
      notify('Export configuration', error);
    }
  }

  /** The answer: only a path with something in it, since an empty one names no file. */
  private export(): void {
    const outputPath = this.target.value.trim();
    if (outputPath === '' || this.selected === '') {
      this.status.textContent = t('export.noTarget');
      return;
    }
    this.settle({ kind: this.selected, outputPath });
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
