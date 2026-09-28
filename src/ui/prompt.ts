/**
 * Asking the reader a question and getting an answer back.
 *
 * The app asks before something is lost — a document on screen that is not in the stack, a file
 * or a folder a delete would take with it — and the work waits on the answer, which is why this
 * is a call and not an event (`eventManager` carries news; this carries a request). One class
 * owns it, and it answers with one of two hands:
 *
 * - the **reader** gets the system dialog the app has always used for these: modal to the app,
 *   and unmissable;
 * - a **probe** gets a **card in the page**. A native modal blocks the webview, and the harness
 *   reaches the app *through* the webview — measured, two probes hung for their whole five-second
 *   budget on one and the app had to be restarted — while a card is a button like any other, so a
 *   probe presses the answer it wants.
 *
 * Which hand is in the room is read from the page rather than configured: `test/probes/lib.js`
 * installs `window.__t`, and only the harness does. Both hands are given the same words, so the
 * question a test answers is the question a reader answers.
 *
 * May import: the dialog plugin and the component base. Upholds: one question at a time — a
 * second ask while the card is up is refused rather than queued — and neither hand takes the
 * focus, because a caller may be asking in the middle of an editing gesture whose caret and
 * selection have to survive it.
 */

import { ask as askNative } from '@tauri-apps/plugin-dialog';
import { BaseComponent } from './component';

/** A question: its name, its words, and what each of its two answers says. */
export interface Question {
  /** The question's name: the system dialog needs one, and the card shows it as its heading. */
  title: string;
  message: string;
  /** The answer that goes ahead. */
  yes: string;
  /** The answer that does not. */
  no: string;
}

/** Whoever can ask one. A module that needs an answer takes one of these rather than a card. */
export interface Prompter {
  ask(question: Question): Promise<boolean>;
}

export class Prompt extends BaseComponent implements Prompter {
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
    this.element.dataset.prompt = 'true';

    const card = document.createElement('div');
    card.className = 'w-[26rem] rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg';
    this.heading = document.createElement('p');
    this.heading.className = 'mb-1 text-sm font-semibold';
    this.heading.dataset.promptTitle = 'true';
    this.message = document.createElement('p');
    this.message.className = 'text-sm';
    this.message.dataset.promptMessage = 'true';

    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    this.no = this.makeButton('prompt-no', 'btn btn-ghost btn-sm', () => this.settle(false));
    this.yes = this.makeButton('prompt-yes', 'btn btn-primary btn-sm', () => this.settle(true));
    actions.append(this.no, this.yes);
    card.append(this.heading, this.message, actions);
    this.element.appendChild(card);

    // Escape is the answer that is not "yes": a caller names its own two answers, so the one
    // that is not the first is the cautious one. The listener is on the document because the
    // card deliberately never takes the focus.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.answer !== null) {
        this.settle(false);
      }
    });
  }

  /** Asks, on the card when a probe is driving the page and in the system dialog otherwise. */
  async ask(question: Question): Promise<boolean> {
    if (!drivenByTools()) {
      return await askNative(question.message, { title: question.title, kind: 'warning' });
    }
    return await this.askOnTheCard(question);
  }

  /** The card, which is what a probe answers. */
  private askOnTheCard(question: Question): Promise<boolean> {
    if (this.answer !== null) {
      return Promise.resolve(false);
    }
    this.heading.textContent = question.title;
    this.message.textContent = question.message;
    this.yes.textContent = question.yes;
    this.no.textContent = question.no;
    this.mountOnFirstAsk();
    this.element.classList.remove('hidden');
    return new Promise((resolve) => {
      this.answer = resolve;
    });
  }

  /** The card joins the page the first time a question is asked, so importing this is free. */
  private mountOnFirstAsk(): void {
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
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
 * The app's prompt. One per app, asked by whoever needs an answer — the session, the workspace
 * tree's delete, and whatever comes next.
 */
export const prompt = new Prompt();

/**
 * Whether a probe is driving this page. `test/probes/lib.js` is the only thing that puts `__t`
 * on the window, so this is the whole of the "under test" test.
 */
function drivenByTools(): boolean {
  return typeof (window as { __t?: unknown }).__t === 'object';
}
