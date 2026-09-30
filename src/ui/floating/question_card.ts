/**
 * A question the app asks over the page: the prompt's card, the image card, the new-note card.
 *
 * The veil is the family's; what this adds is the *answer*: one question at a time, a promise
 * settled once, and Escape giving the cautious answer — never the one that acts. The card's own
 * content belongs to the subclass, which fills `card`; nothing about a field or a button belongs
 * here.
 *
 * May import: the surface base. Upholds: a question is answered once, and Escape is never the answer
 * that acts.
 */

import { FloatingSurface } from './surface';

export abstract class QuestionCard<A> extends FloatingSurface {
  /** The centred card the subclass fills. */
  protected readonly card: HTMLElement = document.createElement('div');

  private answer: ((value: A) => void) | null = null;

  protected constructor(className: string) {
    super(['fixed', 'inset-0', 'z-[60]', 'flex', 'items-center', 'justify-center', 'bg-black/30']);
    this.card.className = `rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg ${className}`;
    // A press in the card belongs to the card: the toolbar behind it must not begin a window drag,
    // and the panels behind it must not hear the press.
    this.card.addEventListener('mousedown', (event) => event.stopPropagation());
    this.element.appendChild(this.card);
    // Escape is the answer that is not "yes". The listener is on the document because the card
    // deliberately never takes the focus.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.answer !== null) {
        this.settle(this.cautious());
      }
    });
  }

  /** The answer Escape gives: the cautious one, which the subclass names. */
  protected abstract cautious(): A;

  /** Asks, once: a question asked while one is open is answered with the cautious answer. */
  protected askWith(show: () => void): Promise<A> {
    if (this.answer !== null) {
      return Promise.resolve(this.cautious());
    }
    this.card.replaceChildren();
    show();
    this.open();
    return new Promise((resolve) => {
      this.answer = resolve;
    });
  }

  protected settle(value: A): void {
    const answer = this.answer;
    this.answer = null;
    this.close();
    answer?.(value);
  }

  /** Its place is the veil: it covers the window whatever the page is scrolled to. */
  protected mountForShow(): void {
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
  }

  protected placeForShow(): void {}
}
