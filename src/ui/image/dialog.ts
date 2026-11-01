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
 * May import: the question card, the app's stamp and the image rules. Upholds: one card at a
 * time, and no answer but a name the rule accepts, or a cancel.
 */

import { t } from '../../services/i18n';
import { imageFileName } from '../markdown/syntax/image_edits';
import { QuestionCard } from '../floating';

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

export class ImageDialog extends QuestionCard<string | null> implements ImageChooser {
  private readonly heading: HTMLParagraphElement;
  private readonly preview: HTMLImageElement;
  private readonly where: HTMLParagraphElement;
  private readonly nameField: HTMLInputElement;
  private readonly complaint: HTMLParagraphElement;
  private readonly form: HTMLFormElement;
  private stamp = '';

  constructor() {
    super('w-[26rem]');
    this.element.setAttribute('data-image-dialog', 'true');

    this.heading = document.createElement('p');
    this.heading.className = 'mb-3 text-sm font-semibold';
    this.heading.textContent = t('image.title');

    this.preview = document.createElement('img');
    this.preview.className = 'mx-auto mb-1 block max-h-48 w-auto rounded-md';
    this.preview.setAttribute('data-image-preview', 'true');
    this.preview.alt = '';

    this.where = document.createElement('p');
    this.where.className = 'mb-3 text-center text-xs opacity-60';
    this.where.setAttribute('data-image-where', 'true');

    this.form = document.createElement('form');
    this.form.addEventListener('submit', (event) => {
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
    this.form.append(
      this.field(t('image.name'), this.nameField),
      this.complaint,
      this.actions()
    );
  }

  /** Escape means no image: nothing is written and nothing is inserted. */
  protected cautious(): string | null {
    return null;
  }

  /** Asks. Null is the reader saying no: nothing is written and nothing is inserted. */
  async choose(request: ImageRequest): Promise<string | null> {
    this.stamp = request.stamp;
    this.preview.src = request.preview;
    const defaultName = imageFileName('', request.stamp) ?? `${request.stamp}.png`;
    this.nameField.value = defaultName;
    this.complaint.textContent = '';
    this.where.textContent = t('image.where', { folder: request.folder });
    const answered = this.askWith(() =>
      this.card.append(this.heading, this.preview, this.where, this.form)
    );
    this.nameField.focus();
    this.nameField.setSelectionRange(0, defaultName.replace(/\.[^.]+$/, '').length);
    return await answered;
  }

  private save(): void {
    const name = imageFileName(this.nameField.value, this.stamp);
    if (name === null) {
      // The rule refuses a path or a hidden name; the reader is told which, and the card stays up.
      this.complaint.textContent = this.nameField.value.trim().startsWith('.')
        ? t('image.badNameDot')
        : t('image.badNameFolder');
      return;
    }
    this.settle(name);
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
      this.button('image-cancel', t('image.cancel'), 'btn btn-ghost btn-sm', () => this.settle(null)),
      this.button('image-save', t('image.save'), 'btn btn-primary btn-sm', null, 'submit')
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
