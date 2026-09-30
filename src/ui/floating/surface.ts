/**
 * What every surface that floats over the page has, and nothing else.
 *
 * A surface is hidden until it is opened, wears the one card this app gives its floating panels,
 * answers Escape by going away, and never takes the focus or the caret: the author is typing in the
 * document under it, and a focused card would take that away. *Where* it floats, and what else
 * dismisses it, belong to the kind (`beside.ts`, `panel.ts`, `question_card.ts`).
 *
 * The base must not grow a switch (`interactive`, `modal`, `autoHide`): a fact one kind has is a
 * parameter that kind is built with, or a subclass of it — otherwise this is a class that needs a
 * paragraph to explain itself (see the design's appendix).
 *
 * May import: the component base. Upholds: one card, one Escape, one refusal to take the focus.
 */

import { BaseComponent } from '../component';

export abstract class FloatingSurface extends BaseComponent {
  /** The card every surface in the app wears, in one place. */
  static readonly CHROME = 'rounded-lg border border-base-300 bg-base-200 shadow-lg';

  private watchingEscape = false;

  protected constructor(classes: readonly string[]) {
    super('div', ['hidden', ...classes.filter((name) => name.length > 0)]);
  }

  /** Whether the surface is on screen. */
  isOpen(): boolean {
    return !this.element.classList.contains('hidden');
  }

  /**
   * Shows it: mounted where its kind says, unhidden, then placed — a hidden element measures as
   * nothing, so the order matters.
   */
  open(): void {
    this.watchEscape();
    this.mountForShow();
    this.element.classList.remove('hidden');
    this.placeForShow();
  }

  close(): void {
    this.element.classList.add('hidden');
  }

  /** Where the surface goes the first time it is shown: the body, or its own host. */
  protected abstract mountForShow(): void;

  /** Where it sits each time it is shown. */
  protected abstract placeForShow(): void;

  /**
   * Escape puts every surface away. Wired on the first open, once, because the listener lives as
   * long as the window: a surface that has never been shown has nothing to put away.
   */
  private watchEscape(): void {
    if (this.watchingEscape) {
      return;
    }
    this.watchingEscape = true;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }
}
