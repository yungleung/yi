/**
 * Asking where a new note goes and what it is to be called — one question, two hands.
 *
 * The question is two answers at once: a folder, and a name. It has the same two hands as the
 * app's prompt (`ui/prompt.ts`), chosen the same way (`under_test.ts`):
 *
 * - the **reader** gets the system's own sheet — `save`, the one native surface that asks
 *   "where, and what is it called" in a single breath, opened on the folder the reader is
 *   working in with the generated id as the name to type over;
 * - a **probe** gets a **card in the page**, because a native sheet blocks the webview the
 *   harness reaches the app through (the same finding `prompt.ts` records). The card lists the
 *   workspace's own folders, indented the way the tree indents them, with the one the reader is
 *   in already chosen — which the system's sheet cannot offer — and it is driven by real buttons
 *   and a real field (`data-new-document-*`).
 *
 * Where `Prompt` must *not* take the focus — it is asked in the middle of an editing gesture
 * whose caret has to survive it — the card *is* the gesture, and the name field carries the
 * caret when it opens, with the generated id selected, because that default is a name meant to
 * be typed over rather than kept.
 *
 * May import: the dialog plugin, the component base, the shared "under test" rule, and the path
 * rules the two hands share. Upholds: one answer to the question — a folder and a name, or a
 * cancel that writes nothing — and a folder that is the chosen path's own, whichever hand was in
 * the room.
 */

import { save as saveChosen } from '@tauri-apps/plugin-dialog';
import { t } from '../../services/i18n';
import { BaseComponent } from '../component';
import { drivenByTools } from '../under_test';
import { placementOfPath, type FolderOption } from '../../services/workspace_folders';

/** What the card needs to ask: the places, the one to start on, and the name to start with. */
export interface NewDocumentRequest {
  /**
   * The workspace's folders, as `services/workspace_folders.ts` lists them. A function, because
   * the system's sheet brings its own way of choosing a folder: only the card needs this walk,
   * and a reader should not wait for it before their sheet opens.
   */
  folders(): Promise<FolderOption[]>;
  /** The folder to have chosen when the card opens. */
  folder: string;
  /** The name to start with, without its extension (the app writes `.md`). */
  name: string;
}

/** The reader's answer: where the note goes, and what it is called. */
export interface NewDocumentPlacement {
  folder: string;
  name: string;
}

/** Whoever can ask for a place and a name. A module that needs an answer takes one of these. */
export interface NewDocumentChooser {
  choose(request: NewDocumentRequest): Promise<NewDocumentPlacement | null>;
}

export class NewDocumentDialog extends BaseComponent implements NewDocumentChooser {
  private readonly list: HTMLDivElement;
  private readonly nameField: HTMLInputElement;
  private folder = '';
  private fallbackName = '';
  private answer: ((placement: NewDocumentPlacement | null) => void) | null = null;

  constructor() {
    super('div', [
      'hidden',
      'fixed',
      'inset-0',
      'z-[60]',
      'flex',
      'items-center',
      'justify-center',
      'bg-black/30'
    ]);
    this.element.setAttribute('data-new-document', 'true');

    const card = document.createElement('div');
    card.className = 'w-[26rem] rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg';
    // A press in the card belongs to the card: the panels behind it must not hear it, and the
    // titlebar must not begin a window drag under it.
    card.addEventListener('mousedown', (event) => event.stopPropagation());

    const heading = document.createElement('p');
    heading.className = 'mb-3 text-sm font-semibold';
    heading.textContent = t('newNote.title');

    const form = document.createElement('form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.create();
    });

    this.list = document.createElement('div');
    this.list.className =
      'max-h-48 overflow-auto rounded border border-base-300 bg-base-100 py-1';
    this.list.setAttribute('data-new-document-folders', 'true');

    this.nameField = document.createElement('input');
    this.nameField.type = 'text';
    this.nameField.className = 'input input-bordered input-sm w-full';
    this.nameField.setAttribute('data-new-document-name', 'true');
    this.nameField.setAttribute('spellcheck', 'false');

    form.append(
      this.field(t('newNote.folder'), this.list),
      this.field(t('newNote.name'), this.nameField),
      this.actions()
    );
    card.append(heading, form);
    this.element.appendChild(card);

    // Escape is the answer that is not an answer. The listener is on the document because the
    // field may not hold the focus — a click on the backdrop would leave nothing focused.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.answer !== null) {
        this.settle(null);
      }
    });
  }

  /** Asks, on the system's sheet when a reader is there and on the card when a probe is. */
  async choose(request: NewDocumentRequest): Promise<NewDocumentPlacement | null> {
    if (!drivenByTools()) {
      return await this.askOnTheSystemSheet(request);
    }
    return await this.askOnTheCard(request);
  }

  /**
   * The reader's hand: the system's own sheet, here as `ui/prompt.ts` uses the system's own
   * question. It opens where the reader is working — the folder they would have chosen on the
   * card — with the generated id as the name, and answers with the path it was given.
   *
   * The path is the whole answer: the folder is everything above it and the name is its last
   * piece, so a reader who navigates somewhere else than the folder they were offered gets the
   * place they actually named, which is the one thing this hand can do that the card cannot.
   */
  private async askOnTheSystemSheet(
    request: NewDocumentRequest
  ): Promise<NewDocumentPlacement | null> {
    const chosen = await saveChosen({
      defaultPath: `${request.folder}/${request.name}.md`,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    });
    if (typeof chosen !== 'string') {
      return null;
    }
    return placementOfPath(chosen);
  }

  /** The card, which is what a probe answers. */
  private async askOnTheCard(request: NewDocumentRequest): Promise<NewDocumentPlacement | null> {
    if (this.answer !== null) {
      return null;
    }
    const folders = await request.folders();
    if (this.answer !== null) {
      return null;
    }
    this.fill(folders, request);
    this.mountOnFirstAsk();
    this.element.classList.remove('hidden');
    this.nameField.focus();
    this.nameField.select();
    return new Promise((resolve) => {
      this.answer = resolve;
    });
  }

  /** The folder rows and the starting name, for one question. */
  private fill(folders: FolderOption[], request: NewDocumentRequest): void {
    this.folder = folders.some((option) => option.path === request.folder)
      ? request.folder
      : (folders[0]?.path ?? '');
    this.fallbackName = request.name;
    this.nameField.value = request.name;
    this.list.replaceChildren();
    for (const option of folders) {
      this.list.appendChild(this.folderRow(option));
    }
    this.markChosen();
  }

  /** One folder of the list: a row, indented the way the tree indents one. */
  private folderRow(option: FolderOption): HTMLButtonElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'block w-full px-2 py-1 text-left text-xs hover:bg-base-300';
    row.style.paddingLeft = `${8 + option.depth * 10}px`;
    row.textContent = option.name;
    row.title = option.path;
    row.setAttribute('data-new-document-folder', option.path);
    // The caret stays in the name field: a reader who chose a folder is about to type a name,
    // and a press that focused the row would end the selection the default name is under.
    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => this.chooseFolder(option.path));
    return row;
  }

  private chooseFolder(path: string): void {
    this.folder = path;
    this.markChosen();
  }

  private markChosen(): void {
    for (const row of this.list.querySelectorAll('[data-new-document-folder]')) {
      const chosen = row.getAttribute('data-new-document-folder') === this.folder;
      row.classList.toggle('bg-primary/15', chosen);
      row.setAttribute('aria-pressed', String(chosen));
    }
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const group = document.createElement('div');
    group.className = 'mb-3 flex flex-col gap-1';
    const caption = document.createElement('span');
    caption.className = 'text-xs opacity-70';
    caption.textContent = label;
    group.append(caption, control);
    return group;
  }

  private actions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'flex justify-end gap-2';
    actions.append(
      this.button('new-document-cancel', t('newNote.cancel'), 'btn btn-ghost btn-sm', () => this.settle(null)),
      // The create button submits: Enter in the name field is the same answer as pressing it,
      // and a press reaches the form's own handler rather than a second one beside it.
      this.button('new-document-create', t('newNote.create'), 'btn btn-primary btn-sm', null, 'submit')
    );
    return actions;
  }

  private create(): void {
    if (this.folder === '') {
      this.settle(null);
      return;
    }
    // An empty field is not a name: the generated id it opened with is the name the ask asks
    // for, and a note has to be called something.
    this.settle({ folder: this.folder, name: this.nameField.value.trim() || this.fallbackName });
  }

  private settle(placement: NewDocumentPlacement | null): void {
    const answer = this.answer;
    this.answer = null;
    this.element.classList.add('hidden');
    answer?.(placement);
  }

  /** The card joins the page the first time it is asked, so importing this is free. */
  private mountOnFirstAsk(): void {
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
  }

  private button(
    name: string,
    label: string,
    className: string,
    onPress: (() => void) | null,
    type: 'button' | 'submit' = 'button'
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = type;
    button.className = className;
    button.textContent = label;
    // By attribute, not by `dataset`: a `dataset` key with a hyphen in it is a SyntaxError in
    // WebKit, and these are named for the probes that press them.
    button.setAttribute(`data-${name}`, 'true');
    button.addEventListener('mousedown', (event) => event.preventDefault());
    if (onPress) {
      button.addEventListener('click', onPress);
    }
    return button;
  }
}

/** The app's new-note card. One per app, asked by whoever needs a place and a name. */
export const newDocumentDialog = new NewDocumentDialog();
