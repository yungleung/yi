/**
 * The question the session asks before a document can be lost.
 *
 * A small card in the page rather than a native dialog, and the reason is not decoration. The
 * question is asked *inside* an open of a document, so it has to be answerable by everything
 * that opens one — including a probe, which cannot press a native dialog: the harness reaches
 * the app through the webview, and a native modal blocks the webview until a person answers it
 * (measured: two probes hung for the harness's whole budget on one, and the app had to be
 * restarted). A card in the page is a button like any other button: a probe presses the answer
 * it wants, the way it presses the stack's own buttons.
 *
 * May import: the component base. Upholds: one question at a time — a second ask while one is
 * open is refused, so two documents can never both be waiting on the same card.
 */

import type { SessionPrompter, SessionQuestion } from '../../services/session';
import { BaseComponent } from '../component';

export class SessionPrompt extends BaseComponent implements SessionPrompter {
  private readonly message: HTMLParagraphElement;
  private readonly yes: HTMLButtonElement;
  private readonly no: HTMLButtonElement;
  private answer: ((value: boolean) => void) | null = null;

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
    this.element.dataset.sessionPrompt = 'true';

    const card = document.createElement('div');
    card.className = 'w-[26rem] rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg';
    this.message = document.createElement('p');
    this.message.className = 'text-sm';
    this.message.dataset.sessionPromptMessage = 'true';

    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    this.no = this.makeButton('session-prompt-no', 'btn btn-ghost btn-sm', () => this.settle(false));
    this.yes = this.makeButton('session-prompt-yes', 'btn btn-primary btn-sm', () => this.settle(true));
    actions.append(this.no, this.yes);
    card.append(this.message, actions);
    this.element.appendChild(card);

    // Escape is the cautious answer, whichever that is: the caller decides by naming its
    // buttons, so the button that is not "yes" is the one it means.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.answer !== null) {
        this.settle(false);
      }
    });
  }

  ask(question: SessionQuestion): Promise<boolean> {
    if (this.answer !== null) {
      return Promise.resolve(false);
    }
    this.message.textContent = question.message;
    this.yes.textContent = question.yes;
    this.no.textContent = question.no;
    this.element.classList.remove('hidden');
    // No `focus()`: the caret and the selection belong to the document, and this card appears
    // *while* a document is being left — focusing a button here would move the reader's caret
    // out of the text that is about to be captured with it. Escape answers "no" from a listener
    // on the document, which needs no focus.
    return new Promise((resolve) => {
      this.answer = resolve;
    });
  }

  private settle(value: boolean): void {
    const answer = this.answer;
    this.answer = null;
    this.element.classList.add('hidden');
    answer?.(value);
  }

  private makeButton(name: string, className: string, onPress: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    // By attribute, not by `dataset`: a `dataset` key with a hyphen in it is a SyntaxError in
    // WebKit, and this one is named for the probe that presses it.
    button.setAttribute(`data-${name}`, 'true');
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', onPress);
    return button;
  }
}
