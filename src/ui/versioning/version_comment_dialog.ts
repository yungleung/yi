/**
 * Asking what to call the version about to be saved.
 *
 * The question has **one hand**, unlike the app's other questions: no system surface answers with a
 * line of text (`ui/image/index.ts` has no native twin for the same reason). So this is a
 * card for a reader and for a probe both, with a field that carries the caret when it opens, Enter
 * or the button saving with what is typed, and Escape answering the cautious way — *no version at
 * all*, since a reader who cancels here has asked for nothing else.
 *
 * May import: the question card and the catalogue. Upholds: one question, one answer — the comment
 * as typed, or null — so the flow cannot write a version nobody answered for.
 */

import { t } from '../../services/i18n';
import { QuestionCard } from '../floating/question_card';

export class VersionCommentDialog extends QuestionCard<string | null> {
  private readonly heading: HTMLParagraphElement;
  private readonly label: HTMLLabelElement;
  private readonly field: HTMLInputElement;
  private readonly form: HTMLFormElement;
  private readonly save: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;

  constructor() {
    super('w-[26rem]');
    this.element.dataset.versionComment = 'true';

    this.heading = document.createElement('p');
    this.heading.className = 'mb-1 text-sm font-semibold';
    this.heading.setAttribute('data-version-comment-title', 'true');
    this.label = document.createElement('label');
    this.label.className = 'label-text text-xs';
    this.label.setAttribute('data-version-comment-label', 'true');
    this.field = document.createElement('input');
    this.field.type = 'text';
    this.field.className = 'input input-bordered input-sm w-full';
    this.field.setAttribute('data-version-comment-field', 'true');
    this.field.setAttribute('spellcheck', 'false');

    this.form = document.createElement('form');
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.settle(this.field.value);
    });
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    this.cancel = this.button('version-comment-cancel', 'btn btn-ghost btn-sm', 'button', () =>
      this.settle(null)
    );
    this.save = this.button('version-comment-save', 'btn btn-primary btn-sm', 'submit', () => {});
    actions.append(this.cancel, this.save);
    this.form.append(this.label, this.field, actions);
  }

  /** Escape is the answer that does not act: no version. */
  protected cautious(): string | null {
    return null;
  }

  /** Asks, with the caret in the field so the comment is typed straight away. */
  async ask(): Promise<string | null> {
    const answered = this.askWith(() => {
      this.heading.textContent = t('version.comment.title');
      this.label.textContent = t('version.comment.label');
      this.save.textContent = t('version.comment.save');
      this.cancel.textContent = t('version.comment.cancel');
      this.field.value = '';
      // The card is cleared before every question (`question_card.ts: askWith`), so what this kind
      // is made of is put back here — the shape `Prompt.fill` has.
      this.card.append(this.heading, this.form);
    });
    this.field.focus();
    this.field.select();
    return await answered;
  }

  private button(
    name: string,
    className: string,
    type: 'button' | 'submit',
    onPress: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = type;
    button.className = className;
    // By attribute, not by `dataset`: a key with a hyphen in it is a SyntaxError in WebKit.
    button.setAttribute(`data-${name}`, 'true');
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', onPress);
    return button;
  }
}

/** The app's version comment question. One per app. */
export const versionCommentDialog = new VersionCommentDialog();
