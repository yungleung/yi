/**
 * The list of choices, drawn beside the caret.
 *
 * A card in the editor's own surface (`fixed`, clamped to the window) like the footnote preview:
 * one row per choice — the value in monospace, the title dimmed beside it — and the selected row
 * highlighted. It never takes the focus: the author is typing, and a focused card would take the
 * caret out of the document the list is about.
 *
 * May import: the component base and the app's words. Upholds: what is drawn is the choices it was
 * given, in the order it was given them, and nothing else — the ordering is the rule's
 * (`syntax/completions.ts`).
 */

import { t } from '../../services/i18n';
import { BaseComponent } from '../component';
import type { CompletionChoice } from './syntax/completions';

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
      'max-h-64',
      'w-72',
      'overflow-auto',
      'rounded-lg',
      'border',
      'border-base-300',
      'bg-base-200',
      'p-1',
      'shadow-lg',
      'select-none'
    ]);
    this.element.setAttribute('data-completion', 'true');
    this.list = document.createElement('ul');
    this.list.className = 'menu w-full gap-0 p-0';
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
    anchor: DOMRect | null,
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `flex w-full items-baseline gap-2 rounded-none px-2 py-1 text-left ${
      index === this.selected ? 'bg-primary/15' : ''
    }`;
    button.setAttribute('data-completion-row', choice.value);
    button.setAttribute('aria-selected', String(index === this.selected));
    const value = document.createElement('span');
    value.className = 'font-mono text-xs';
    value.textContent = choice.value;
    const title = document.createElement('span');
    title.className = 'truncate text-xs opacity-70';
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
  private place(anchor: DOMRect | null): void {
    const box = this.element.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor?.left ?? 8, window.innerWidth - box.width - 8));
    const below = (anchor?.bottom ?? 8) + 4;
    const top =
      below + box.height <= window.innerHeight - 8
        ? below
        : Math.max(8, (anchor?.top ?? 8) - box.height - 4);
    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }
}
