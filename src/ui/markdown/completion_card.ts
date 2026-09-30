/**
 * The list of choices, drawn beside the caret.
 *
 * A card in the editor's own surface (`fixed`, clamped to the window) like the footnote preview:
 * one row per choice — the value in monospace, the title dimmed beside it — and the selected row
 * highlighted. A row has no margin of its own: it is as wide as the card's own interior and flush
 * with its border, so the highlight is the row and not a box floating inside one. It never takes
 * the focus: the author is typing, and a focused card would take the caret out of the document the
 * list is about.
 *
 * May import: the component base and the app's words. Upholds: what is drawn is the choices it was
 * given, in the order it was given them, and nothing else — the ordering is the rule's
 * (`syntax/completions.ts`).
 */

import { t } from '../../services/i18n';
import { BaseComponent } from '../component';
import type { CompletionChoice } from './syntax/completions';

/**
 * Where the card sits: the caret's box, read from the caret's own range (`caret/geometry.ts:
 * caretRect`). The card takes this rather than the drawn caret span, which is one frame behind the
 * range — a keystroke redraws the list before that span has moved, and placing from it puts the
 * card where the caret has already left.
 */
export interface CompletionAnchor {
  left: number;
  top: number;
  height: number;
}

export class CompletionCard extends BaseComponent {
  private readonly list: HTMLUListElement;
  private readonly empty: HTMLParagraphElement;
  private choices: CompletionChoice[] = [];
  private selected = 0;
  private pick: ((choice: CompletionChoice) => void) | null = null;

  constructor() {
    super('div', [
      'hidden',
      'fixed',
      'z-50',
      'flex',
      'max-h-64',
      'w-72',
      'flex-col',
      'overflow-hidden',
      'rounded-lg',
      'border',
      'border-base-300',
      'bg-base-200',
      'p-0',
      'shadow-lg',
      'select-none'
    ]);
    this.element.setAttribute('data-completion', 'true');
    this.list = document.createElement('ul');
    // The card's own box clips the rows to its rounded border; the list scrolls when it is longer
    // than the card may be, so a long bibliography does not grow the popover off the window.
    this.list.className = 'menu w-full gap-0 overflow-y-auto p-0';
    this.empty = document.createElement('p');
    this.empty.className = 'px-2 py-1 text-xs opacity-70';
    this.empty.setAttribute('data-completion-empty', 'true');
    this.element.append(this.list, this.empty);
  }

  /** Whether the list is on screen. */
  get open(): boolean {
    return !this.element.classList.contains('hidden');
  }

  /** The value of the row in hand, or null when nothing is offered. */
  get selectedValue(): string | null {
    return this.choices[this.selected]?.value ?? null;
  }

  /** Draws `choices` beside `anchor`, with `selected` in hand. */
  show(
    choices: readonly CompletionChoice[],
    selected: number,
    anchor: CompletionAnchor | null,
    onPick: (choice: CompletionChoice) => void
  ): void {
    this.choices = [...choices];
    this.selected = Math.max(0, Math.min(selected, this.choices.length - 1));
    this.pick = onPick;
    this.list.replaceChildren();
    this.choices.forEach((choice, index) => this.list.appendChild(this.row(choice, index)));
    this.empty.textContent = t('completion.empty');
    this.empty.hidden = this.choices.length > 0;
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
    this.element.classList.remove('hidden');
    this.place(anchor);
  }

  hide(): void {
    this.element.classList.add('hidden');
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

  /** Under the caret when it fits, above it when it does not, and never off the window. */
  private place(anchor: CompletionAnchor | null): void {
    const box = this.element.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor?.left ?? 8, window.innerWidth - box.width - 8));
    const below = (anchor ? anchor.top + anchor.height : 8) + 4;
    const top =
      below + box.height <= window.innerHeight - 8
        ? below
        : Math.max(8, (anchor?.top ?? 8) - box.height - 4);
    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }
}
