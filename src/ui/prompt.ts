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
 * Which hand is in the room is read from the page rather than configured (`under_test.ts`):
 * `test/probes/lib.js` installs `window.__t`, and only the harness does. Both hands are given
 * the same words, so the question a test answers is the question a reader answers.
 *
 * May import: the dialog plugin and the question card. Upholds: one question at a time — a second
 * ask while the card is up is refused rather than queued — and neither hand takes the focus,
 * because a caller may be asking in the middle of an editing gesture whose caret and selection
 * have to survive it.
 */

import { ask as askNative } from '@tauri-apps/plugin-dialog';
import { QuestionCard } from './floating/question_card';
import { drivenByTools } from './under_test';

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

export class Prompt extends QuestionCard<boolean> implements Prompter {
  private readonly heading: HTMLParagraphElement;
  private readonly message: HTMLParagraphElement;
  private readonly actions: HTMLDivElement;
  private readonly yes: HTMLButtonElement;
  private readonly no: HTMLButtonElement;

  constructor() {
    super('w-[26rem]');
    this.element.dataset.prompt = 'true';

    this.heading = document.createElement('p');
    this.heading.className = 'mb-1 text-sm font-semibold';
    this.heading.dataset.promptTitle = 'true';
    this.message = document.createElement('p');
    this.message.className = 'text-sm';
    this.message.dataset.promptMessage = 'true';

    this.actions = document.createElement('div');
    this.actions.className = 'mt-3 flex justify-end gap-2';
    this.no = this.makeButton('prompt-no', 'btn btn-ghost btn-sm', () => this.settle(false));
    this.yes = this.makeButton('prompt-yes', 'btn btn-primary btn-sm', () => this.settle(true));
    this.actions.append(this.no, this.yes);
  }

  /** Escape answers the question the cautious way: no. */
  protected cautious(): boolean {
    return false;
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
    return this.askWith(() => this.fill(question));
  }

  /** Draws one question into the card the kind owns. */
  private fill(question: Question): void {
    this.heading.textContent = question.title;
    this.message.textContent = question.message;
    this.yes.textContent = question.yes;
    this.no.textContent = question.no;
    this.card.append(this.heading, this.message, this.actions);
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
