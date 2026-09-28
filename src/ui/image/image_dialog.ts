/**
 * The card that shows an image the clipboard is holding and asks what to call it.
 *
 * Unlike the app's other questions this one has **no native twin**: the system's surfaces can ask
 * where and what to call something, but none of them can draw the picture, and the picture is
 * half of what the reader is deciding — which copy of what they are looking at, under what name.
 * So the card is the reader's interface and the harness's at once, driven by real buttons and a
 * real field (`data-image-*`).
 *
 * The name is the app's rule's (`syntax/image_edits.ts: imageFileName`), not this card's: the
 * default is the app's own stamp as a PNG, an extension this app cannot write becomes one it can,
 * and a name that would name another folder — or a hidden file — is refused with a sentence.
 *
 * May import: the component base, the app's stamp and the image rules. Upholds: one card at a
 * time, and no answer but a name the rule accepts, or a cancel.
 */

import { imageFileName } from '../markdown/syntax/image_edits';
import { BaseComponent } from '../component';

/** What the card needs to ask: the picture, the name it starts from, and where it will go. */
export interface ImageRequest {
  /** A URL that draws the image — the reader's own eyes are part of this question. */
  preview: string;
  /** The app's stamp, which the default name is made of when the reader types nothing. */
  stamp: string;
  /** The folder the file will be saved in, as a path, for the card to show. */
  folder: string;
}

/** Whoever can ask for a name. A module that needs one takes this rather than a card. */
export interface ImageChooser {
  /** The name the reader chose, extension and all, or null when they cancelled. */
  choose(request: ImageRequest): Promise<string | null>;
}

export class ImageDialog extends BaseComponent implements ImageChooser {
  private readonly preview: HTMLImageElement;
  private readonly where: HTMLParagraphElement;
  private readonly nameField: HTMLInputElement;
  private readonly complaint: HTMLParagraphElement;
  private stamp = '';
  private answer: ((name: string | null) => void) | null = null;

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
    this.element.setAttribute('data-image-dialog', 'true');

    const card = document.createElement('div');
    card.className = 'w-[26rem] rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg';
    // A press in the card belongs to the card: the panels behind it must not hear it, and the
    // titlebar must not begin a window drag under it.
    card.addEventListener('mousedown', (event) => event.stopPropagation());

    const heading = document.createElement('p');
    heading.className = 'mb-3 text-sm font-semibold';
    heading.textContent = 'Insert image';

    this.preview = document.createElement('img');
    this.preview.className = 'mx-auto mb-1 block max-h-48 w-auto rounded-md';
    this.preview.setAttribute('data-image-preview', 'true');
    this.preview.alt = '';

    this.where = document.createElement('p');
    this.where.className = 'mb-3 text-center text-xs opacity-60';
    this.where.setAttribute('data-image-where', 'true');

    const form = document.createElement('form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.save();
    });
    this.nameField = document.createElement('input');
    this.nameField.type = 'text';
    this.nameField.className = 'input input-bordered input-sm w-full';
    this.nameField.setAttribute('data-image-name', 'true');
    this.nameField.setAttribute('spellcheck', 'false');
    this.complaint = document.createElement('p');
    this.complaint.className = 'mt-1 min-h-4 text-xs opacity-70';
    this.complaint.setAttribute('data-image-complaint', 'true');
    form.append(
      this.field('Name', this.nameField),
      this.complaint,
      this.actions()
    );

    card.append(heading, this.preview, this.where, form);
    this.element.appendChild(card);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.answer !== null) {
        this.settle(null);
      }
    });
  }

  /** Asks. Null is the reader saying no: nothing is written and nothing is inserted. */
  async choose(request: ImageRequest): Promise<string | null> {
    if (this.answer !== null) {
      return null;
    }
    this.stamp = request.stamp;
    this.preview.src = request.preview;
    const defaultName = imageFileName('', request.stamp) ?? `${request.stamp}.png`;
    this.nameField.value = defaultName;
    this.complaint.textContent = '';
    this.where.textContent = `Saved in ${request.folder}`;
    this.mountOnFirstAsk();
    this.element.classList.remove('hidden');
    this.nameField.focus();
    this.nameField.setSelectionRange(0, defaultName.replace(/\.[^.]+$/, '').length);
    return await new Promise((resolve) => {
      this.answer = resolve;
    });
  }

  private save(): void {
    const name = imageFileName(this.nameField.value, this.stamp);
    if (name === null) {
      // The rule refuses a path or a hidden name; the reader is told which, and the card stays up.
      this.complaint.textContent = this.nameField.value.trim().startsWith('.')
        ? 'A name cannot start with a dot.'
        : 'A name cannot contain a folder: the image folder decides where it goes.';
      return;
    }
    this.settle(name);
  }

  private settle(name: string | null): void {
    const answer = this.answer;
    this.answer = null;
    this.element.classList.add('hidden');
    answer?.(name);
  }

  /** The card joins the page the first time it is asked, so importing this is free. */
  private mountOnFirstAsk(): void {
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const group = document.createElement('div');
    group.className = 'flex flex-col gap-1';
    const caption = document.createElement('span');
    caption.className = 'text-xs opacity-70';
    caption.textContent = label;
    group.append(caption, control);
    return group;
  }

  private actions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    actions.append(
      this.button('image-cancel', 'Cancel', 'btn btn-ghost btn-sm', () => this.settle(null)),
      this.button('image-save', 'Save', 'btn btn-primary btn-sm', null, 'submit')
    );
    return actions;
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

/** The app's image card. One per app, asked by whoever needs a name for a picture. */
export const imageDialog = new ImageDialog();
