/**
 * The question the session asks before a document can be lost, answered by one of two hands —
 * and this class is where that choice lives, so nothing else in the app has to know which.
 *
 * - A **probe** drives the app through the webview, so it is answered on a card in the page. A
 *   native dialog blocks the webview until a person answers it, and the harness reaches the app
 *   *through* the webview: measured, two probes hung for their whole five-second budget on one
 *   and the app had to be restarted. A card is a button like any other, so a probe presses the
 *   answer it wants.
 * - A **reader** is answered by the system dialog the app's other question — the workspace tree's
 *   delete — already uses: modal to the app, and unmissable.
 *
 * Which is in the room is read from the page rather than configured: the probe harness installs
 * `window.__t` on it (`test/probes/lib.js`), and only the harness does. No build flag, no manual
 * edit, and no second copy of the question: both hands show the same words.
 *
 * May import: the prompt port (`services/session.ts`), the dialog plugin and the component base.
 * Upholds: one question at a time — a second ask while the card is up is refused — and neither
 * hand takes the focus, because the question is asked *inside* an open, a moment before the
 * reader's caret is captured with it: a focused button moves the caret first (measured).
 */

import { ask as askNative } from '@tauri-apps/plugin-dialog';
import type { SessionPrompter, SessionQuestion } from '../../services/session';
import { BaseComponent } from '../component';

export class SessionPrompt extends BaseComponent implements SessionPrompter {
  private readonly heading: HTMLParagraphElement;
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
    this.heading = document.createElement('p');
    this.heading.className = 'mb-1 text-sm font-semibold';
    this.heading.dataset.sessionPromptTitle = 'true';
    this.message = document.createElement('p');
    this.message.className = 'text-sm';
    this.message.dataset.sessionPromptMessage = 'true';

    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    this.no = this.makeButton('session-prompt-no', 'btn btn-ghost btn-sm', () => this.settle(false));
    this.yes = this.makeButton('session-prompt-yes', 'btn btn-primary btn-sm', () => this.settle(true));
    actions.append(this.no, this.yes);
    card.append(this.heading, this.message, actions);
    this.element.appendChild(card);

    // Escape is the answer that is not "yes": the caller names its own two answers, so the one
    // that is not the first is the cautious one. The listener is on the document because the
    // card deliberately never takes focus.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.answer !== null) {
        this.settle(false);
      }
    });
  }

  /** Asks, on the card when a probe is driving the page and in the system dialog otherwise. */
  async ask(question: SessionQuestion): Promise<boolean> {
    if (!drivenByTools()) {
      return await askNative(question.message, { title: question.title, kind: 'warning' });
    }
    return await this.askOnTheCard(question);
  }

  /** The card, for the harness: a question a button can answer. */
  private askOnTheCard(question: SessionQuestion): Promise<boolean> {
    if (this.answer !== null) {
      return Promise.resolve(false);
    }
    this.heading.textContent = question.title;
    this.message.textContent = question.message;
    this.yes.textContent = question.yes;
    this.no.textContent = question.no;
    this.element.classList.remove('hidden');
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

/**
 * Whether a probe is driving this page. `test/probes/lib.js` is the only thing that puts `__t`
 * on the window, so this is the whole of the "under test" test.
 */
function drivenByTools(): boolean {
  return typeof (window as { __t?: unknown }).__t === 'object';
}
