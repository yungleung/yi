/**
 * The list of choices, drawn beside the caret.
 *
 * The card is the app's own beside-card (`ui/floating/`), which places it beside the caret
 * and clamps it to the window; what is here is the list itself: one row per choice — the value in
 * monospace, the title dimmed beside it — and the selected row highlighted. A row has no margin of
 * its own: it is as wide as the card's own interior and flush with its border, so the highlight is
 * the row and not a box floating inside one. It never takes the focus: the author is typing, and a
 * focused card would take the caret out of the document the list is about.
 *
 * May import: the beside-card and placement types. Upholds: what is drawn is the choices it was
 * given, in the order it was given them, and nothing else — the ordering is the rule's
 * (`syntax/completions.ts`). An empty choice set has no card to draw.
 */

import { BesideCard, type Box } from '../floating';
import type { CompletionChoice } from './syntax/completions';

export class CompletionCard extends BesideCard {
  private readonly list: HTMLUListElement;
  private choices: CompletionChoice[] = [];
  private selected = 0;
  private pick: ((choice: CompletionChoice) => void) | null = null;
  /**
   * The caret's box, read from the caret's own range (`caret/geometry.ts: caretRect`) — not from
   * the drawn caret span, which is one frame behind it: a keystroke redraws the list before that
   * span has moved, and placing from it puts the card where the caret has already left.
   */
  private anchorBox: Box | null = null;

  constructor() {
    super({
      anchor: () => this.anchorBox,
      className: 'flex max-h-64 w-72 flex-col overflow-hidden p-0'
    });
    this.element.setAttribute('data-completion', 'true');
    this.list = document.createElement('ul');
    // The card's own box clips the rows to its rounded border; the list scrolls when it is longer
    // than the card may be, so a long bibliography does not grow the popover off the window.
    this.list.className = 'menu w-full gap-0 overflow-y-auto p-0';
    this.element.append(this.list);
  }

  /** The value of the row in hand, or null when nothing is offered. */
  get selectedValue(): string | null {
    return this.choices[this.selected]?.value ?? null;
  }

  /** Draws `choices` beside `anchor`, with `selected` in hand. */
  show(
    choices: readonly CompletionChoice[],
    selected: number,
    anchor: Box | null,
    onPick: (choice: CompletionChoice) => void
  ): void {
    this.anchorBox = anchor;
    this.choices = [...choices];
    this.selected = Math.max(0, Math.min(selected, this.choices.length - 1));
    this.pick = onPick;
    this.list.replaceChildren();
    this.choices.forEach((choice, index) => this.list.appendChild(this.row(choice, index)));
    this.open();
  }

  /** One row: the value it writes, and the title it carries. */
  private row(choice: CompletionChoice, index: number): HTMLLIElement {
    const item = document.createElement('li');
    // The list is daisyUI's own `menu`, whose items size to what they hold. A row that says more
    // than the card is wide would therefore be *wider* than the card — measured, 417px inside a
    // 288px card, with the title clipped at the border and a horizontal scroll of its own. The row
    // takes the card's width instead, and what does not fit is the title's ellipsis.
    item.className = 'w-full min-w-0';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `flex w-full min-w-0 items-baseline gap-2 rounded-none px-2 py-1 text-left ${
      index === this.selected ? 'bg-primary/15' : ''
    }`;
    button.setAttribute('data-completion-row', choice.value);
    button.setAttribute('aria-selected', String(index === this.selected));
    const value = document.createElement('span');
    value.className = 'min-w-0 truncate font-mono text-xs';
    value.textContent = choice.value;
    const title = document.createElement('span');
    // `min-w-0` is what lets a row be narrower than what it says: a flex child is otherwise as wide
    // as its own text, and a long title pushed the row out past the card (measured: 417px inside a
    // 288px card, with the text clipped and the row's highlight cut at the edge).
    title.className = 'min-w-0 flex-1 truncate text-xs opacity-70';
    title.textContent = choice.title;
    button.append(value, title);
    button.addEventListener('mousedown', (event) => {
      // The caret stays where it is: a press on the list is not a click in the document.
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.pick?.(choice);
    });
    item.appendChild(button);
    return item;
  }

}
