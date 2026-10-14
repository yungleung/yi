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

/** What the card is asked with: the kinds to offer, and the note's own path without an extension. */
export interface ExportQuestion {
  kinds: ExportKindInfo[];
  /** The pandoc the app would run, or null when this machine has none. */
  pandoc: string | null;
  /**
   * The note's own path with no extension (`/notes/a note`): the card builds a target out of it and
   * the chosen kind's own name suffix and extension, which is how the markdown kind's output can be
   * `a note.processed.md` rather than the note itself.
   */
  baseTarget: string;
}

/** The reader's answer: which kind, where the file goes, and which hand with which settings. */
export interface ExportAnswer {
  kind: string;
  outputPath: string;
  hand: string;
  theme: string;
  pageSize: string;
  orientation: string;
}

/** The bundled themes the card offers, of the ones the app's own renderer ships. */
const THEMES = ['academic', 'minimal', 'compact', 'modern'];
/** The page sizes it knows by name, and the two ways a page can lie. */
const PAGE_SIZES = ['A4', 'Letter', 'Legal', 'A3', 'A5'];
const ORIENTATIONS = ['portrait', 'landscape'];
/** The hand only a PDF has, and that the app can run with no pandoc at all. */
const MARKDOWN2PDF = 'markdown2pdf';

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

/** The label a hand is offered under: its own name, which is what the app calls it in the request. */
function handLabel(hand: string): string {
  return hand === MARKDOWN2PDF ? t('export.hand.markdown2pdf') : t('export.hand.pandoc');
}

export class ExportDialog extends QuestionCard<ExportAnswer | null> {
  private readonly heading: HTMLParagraphElement;
  private readonly kinds: HTMLUListElement;
  private readonly handLabel: HTMLSpanElement;
  private readonly hand: HTMLSelectElement;
  private readonly handRow: HTMLElement;
  private readonly themeLabel: HTMLSpanElement;
  private readonly theme: HTMLSelectElement;
  private readonly sizeLabel: HTMLSpanElement;
  private readonly size: HTMLSelectElement;
  private readonly orientationLabel: HTMLSpanElement;
  private readonly orientation: HTMLSelectElement;
  private readonly ownOptions: HTMLElement;
  private readonly targetLabel: HTMLLabelElement;
  private readonly target: HTMLInputElement;
  private readonly choose: HTMLButtonElement;
  private readonly configLabel: HTMLSpanElement;
  private readonly configPath: HTMLSpanElement;
  private readonly openConfig: HTMLButtonElement;
  /** The whole configuration row, hidden while a hand that does not read it is the one chosen. */
  private readonly configRowElement: HTMLElement;
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

    // The kinds are a *menu*, not tabs: a kind is not a view of the same options — it is a different
    // question, with options of its own below it (a PDF has two hands, and one of them has a theme,
    // a page size and an orientation; a docx has a defaults file and nothing else).
    this.kinds = document.createElement('ul');
    this.kinds.className = 'menu menu-horizontal menu-sm mb-2 w-full px-0';
    this.kinds.setAttribute('data-export-kinds', 'true');

    this.handLabel = this.caption(t('export.hand'));
    this.hand = this.chooser('export-hand', []);
    this.handRow = this.row(this.handLabel, this.hand);
    this.themeLabel = this.caption(t('export.theme'));
    this.theme = this.chooser('export-theme', THEMES);
    this.sizeLabel = this.caption(t('export.pageSize'));
    this.size = this.chooser('export-size', PAGE_SIZES);
    this.orientationLabel = this.caption(t('export.orientation'));
    this.orientation = this.chooser(
      'export-orientation',
      ORIENTATIONS.map((value) => ({
        value,
        label: value === 'portrait' ? t('export.portrait') : t('export.landscape')
      }))
    );
    // The app's own hand's own settings: shown only while that hand is the one chosen.
    this.ownOptions = document.createElement('div');
    this.ownOptions.className = 'mt-2 grid grid-cols-3 gap-2';
    this.ownOptions.setAttribute('data-export-own', 'true');
    this.ownOptions.append(
      this.row(this.themeLabel, this.theme),
      this.row(this.sizeLabel, this.size),
      this.row(this.orientationLabel, this.orientation)
    );

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
      this.handRow,
      this.ownOptions,
      this.row(this.targetLabel, this.target, this.choose),
      this.configRowElement,
      this.status,
      this.actions()
    );
  }

  /** A small caption above a control, the shape every row of this card uses. */
  private caption(text: string): HTMLSpanElement {
    const caption = document.createElement('span');
    caption.className = 'text-xs opacity-70';
    caption.textContent = text;
    return caption;
  }

  /** A `select` filled with the values it is given, each showing either its own name or a label. */
  private chooser(
    name: string,
    values: (string | { value: string; label: string })[]
  ): HTMLSelectElement {
    const select = document.createElement('select');
    select.className = 'select select-sm w-full';
    select.setAttribute(`data-${name}`, 'true');
    select.replaceChildren(
      ...values.map((value) => {
        const option = document.createElement('option');
        option.value = typeof value === 'string' ? value : value.value;
        option.textContent = typeof value === 'string' ? value : value.label;
        return option;
      })
    );
    select.addEventListener('change', () => this.show(this.selected));
    return select;
  }

  /** Escape writes nothing at all: no file, and not even the configuration file. */
  protected cautious(): ExportAnswer | null {
    return null;
  }

  /** Asks. Null is the reader saying no. */
  async ask(question: ExportQuestion): Promise<ExportAnswer | null> {
    this.question = question;
    this.edited = false;
    this.buildKinds(question.kinds);
    const answered = this.askWith(() =>
      this.card.append(this.heading, this.kinds, this.form)
    );
    this.show(question.kinds[0]?.kind ?? '');
    // The caret goes to the path, selected up to its extension: the folder is the part a reader
    // most often wants to change, and the name is the part the app got right.
    this.target.focus();
    this.target.setSelectionRange(0, this.target.value.replace(/\.[^./\\]*$/, '').length);
    return await answered;
  }

  /** The menu: one item per kind, each remembering the kind it stands for. */
  private buildKinds(kinds: ExportKindInfo[]): void {
    this.kinds.replaceChildren(
      ...kinds.map((info) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-export-kind', info.kind);
        button.textContent = kindLabel(info.kind);
        button.addEventListener('click', () => this.show(info.kind));
        item.appendChild(button);
        return item;
      })
    );
  }

  /** Shows a kind: its item, its own options, its target, and what would write it. */
  private show(kind: string): void {
    const info = this.question?.kinds.find((known) => known.kind === kind) ?? null;
    if (!info) {
      return;
    }
    const before = this.selected;
    this.selected = kind;
    for (const item of this.kinds.querySelectorAll<HTMLElement>('[data-export-kind]')) {
      item.closest('li')?.classList.toggle('menu-active', item.dataset.exportKind === kind);
    }
    // The hands this kind has, rebuilt for it: a hand chosen for another kind is not one this kind
    // answers to (the request refuses it, and the card must not offer it in the first place).
    const chosen = this.hand.value;
    this.hand.replaceChildren(
      ...info.hands.map((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = handLabel(name);
        return option;
      })
    );
    const pandoc = this.question?.pandoc ?? null;
    if (info.hands.includes(chosen)) {
      // Rebuilding the options must not drop the reader's own choice: `show` runs again on the
      // change itself, and a select that reset itself would take the theme and the page back with it.
      this.hand.value = chosen;
    } else if (info.hands.includes(MARKDOWN2PDF) && pandoc === null) {
      // No pandoc on this machine, and this kind has a hand that does not need one: choose it,
      // rather than opening on a hand that cannot run.
      this.hand.value = MARKDOWN2PDF;
    }
    const own = this.hand.value === MARKDOWN2PDF;
    this.handRow.classList.toggle('hidden', info.hands.length < 2);
    this.ownOptions.classList.toggle('hidden', !own);
    this.configRowElement.classList.toggle('hidden', own);
    this.target.value = this.targetFor(info, before);
    // A file the reader has not been given yet is a place as much as a file: the first export (or
    // the button below) writes the shipped defaults there, and an edited file is never rewritten.
    this.configPath.textContent = info.config_exists
      ? info.config_path
      : t('export.configNew', { path: info.config_path });
    this.status.textContent =
      own
        ? t('export.ownHand')
        : pandoc === null
          ? t('export.noPandoc')
          : t('export.pandoc', { path: pandoc });
    // A kind that cannot run is not offered a button that would fail: the sentence above says why.
    this.run.disabled = !own && info.needs_pandoc && pandoc === null;
  }

  /**
   * The target for the kind on show: the note's own path, the kind's own name suffix (the markdown
   * kind's output is `a note.processed.md`, because `a note.md` is the note), and its extension —
   * unless the reader has written in the field, in which case only the *extension* they were looking
   * at is replaced, so a path they chose keeps its name.
   */
  private targetFor(info: ExportKindInfo, before: string): string {
    const extension = `.${info.extension}`;
    if (!this.edited) {
      return `${this.question?.baseTarget ?? ''}${info.name_suffix}${extension}`;
    }
    const previous = this.question?.kinds.find((known) => known.kind === before) ?? null;
    const was = previous ? `.${previous.extension}` : '';
    if (was !== '' && was !== extension && this.target.value.endsWith(was)) {
      return this.target.value.slice(0, -was.length) + extension;
    }
    return this.target.value;
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
    this.settle({
      kind: this.selected,
      outputPath,
      hand: this.hand.value,
      theme: this.theme.value,
      pageSize: this.size.value,
      orientation: this.orientation.value
    });
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
