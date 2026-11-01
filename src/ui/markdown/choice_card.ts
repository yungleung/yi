/**
 * A beside-card list whose rows can be chosen by pointer or keyboard.
 *
 * Language and Div-kind pickers differ only in the values they offer and the
 * attribute their probes read. This module owns their shared selection state:
 * one active choice card, Arrow Up/Down movement wrapped through the rows,
 * Home/End, and Enter or Space to choose. A filtering card narrows its rows by
 * both keydown characters and text committed through the input seam, and
 * leaves a space to the source so a code fence can name attributes after its
 * language. The card never takes focus, so the caret stays in the document
 * under it.
 *
 * May import: the beside-card and its placement types. Upholds: one open choice
 * card at a time, and its highlighted row is the row a key will choose.
 */

import { BesideCard, type Box } from '../floating';

export interface Choice {
  value: string;
  label: string;
}

export interface ChoiceCardOptions {
  /** Write typed characters into the editor and filter the rows by them. */
  typeToFilter?: boolean;
}

let active: ChoiceCard | null = null;

/** Lets the editor's key path offer a key to the open choice card first. */
export function handleChoiceCardKey(event: KeyboardEvent): boolean {
  return active?.handleKey(event) ?? false;
}

/** Whether a choice card was already open before an edit reaches the text path. */
export function choiceCardIsOpen(): boolean {
  return active?.isOpen() ?? false;
}

/** Lets text committed by an input method participate in an open filter. */
export function handleChoiceCardText(text: string): void {
  active?.handleText(text);
}

export class ChoiceCard {
  private readonly card: BesideCard;
  private readonly list: HTMLElement;
  private readonly attribute: string;
  private allChoices: Choice[] = [];
  private choices: Choice[] = [];
  private selected = 0;
  private choose: ((value: string) => void) | null = null;
  private query = '';
  private typeToFilter = false;

  constructor(attribute: string, className: string) {
    this.attribute = attribute;
    this.card = new BesideCard({
      anchor: () => this.anchor,
      className,
      onClose: () => {
        this.choose = null;
        if (active === this) {
          active = null;
        }
      }
    });
    this.list = document.createElement('div');
    this.list.className = 'flex flex-col';
    this.card.element.appendChild(this.list);
    this.card.element.addEventListener('click', (event) => {
      const row = (event.target as Element | null)?.closest<HTMLElement>(
        `[${attribute}]`
      );
      const value = row?.getAttribute(attribute);
      if (value !== null && value !== undefined) {
        this.answer(value);
      }
    });
    this.card.element.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.card.isOpen()) {
          return;
        }
        const target = event.target as Element | null;
        if (
          target !== null &&
          (this.card.element.contains(target) ||
            target.closest('[data-chrome]') !== null)
        ) {
          return;
        }
        this.close();
      },
      true
    );
  }

  private anchor: Box | null = null;

  open(
    anchor: Box | null,
    current: string,
    choices: readonly Choice[],
    choose: (value: string) => void,
    options: ChoiceCardOptions = {}
  ): void {
    if (active !== null && active !== this) {
      active.close();
    }
    active = this;
    this.anchor = anchor;
    this.allChoices = [...choices];
    this.choose = choose;
    this.query = '';
    this.typeToFilter = options.typeToFilter ?? false;
    this.filter('');
    const currentIndex = this.choices.findIndex((choice) => choice.value === current);
    this.selected = Math.max(0, currentIndex);
    this.draw();
    this.card.open();
  }

  close(): void {
    this.card.close();
  }

  isOpen(): boolean {
    return this.card.isOpen();
  }

  private draw(): void {
    const rows = this.choices.map((choice, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.setAttribute(this.attribute, choice.value);
      row.className = 'rounded px-2 py-1 text-left text-sm hover:bg-base-300';
      this.mark(row, index);
      row.textContent = choice.label;
      return row;
    });
    this.list.replaceChildren(...rows);
    rows[this.selected]?.scrollIntoView({ block: 'nearest' });
  }

  /** Filters the rows by what has been typed into the source field. */
  private filter(query: string): void {
    this.query = query;
    const wanted = query.toLocaleLowerCase();
    this.choices =
      this.typeToFilter && wanted !== ''
        ? this.allChoices.filter(
            (choice) =>
              choice.value.toLocaleLowerCase().includes(wanted) ||
              choice.label.toLocaleLowerCase().includes(wanted)
          )
        : [...this.allChoices];
    this.selected = 0;
  }

  private mark(row: HTMLElement, index: number): void {
    row.classList.toggle('bg-base-300', index === this.selected);
    row.setAttribute('aria-selected', String(index === this.selected));
  }

  private rows(): HTMLElement[] {
    return [...this.list.querySelectorAll<HTMLElement>(`[${this.attribute}]`)];
  }

  private move(step: number): void {
    if (this.choices.length === 0) {
      return;
    }
    const previous = this.rows()[this.selected];
    this.selected =
      (this.selected + step + this.choices.length) % this.choices.length;
    const rows = this.rows();
    if (previous !== undefined) {
      this.mark(previous, -1);
    }
    const next = rows[this.selected];
    if (next !== undefined) {
      this.mark(next, this.selected);
      next.scrollIntoView({ block: 'nearest' });
    }
  }

  private edge(index: number): void {
    if (this.choices.length === 0) {
      return;
    }
    this.selected = index;
    const rows = this.rows();
    for (const [at, row] of rows.entries()) {
      this.mark(row, at);
    }
    rows[this.selected]?.scrollIntoView({ block: 'nearest' });
  }

  private answer(value: string): void {
    const choose = this.choose;
    this.close();
    choose?.(value);
  }

  /** Applies text that reached the document through the input seam rather than keydown. */
  handleText(text: string): void {
    if (!this.card.isOpen() || !this.typeToFilter || text === '') {
      return;
    }
    if (/\s/u.test(text)) {
      this.close();
      return;
    }
    this.filter(`${this.query}${text}`);
    this.draw();
  }

  /** Offers a key to this open card; false leaves it to the editor. */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.card.isOpen() || event.isComposing) {
      return false;
    }
    if (event.key === 'ArrowDown') {
      this.move(1);
      return true;
    }
    if (event.key === 'ArrowUp') {
      this.move(-1);
      return true;
    }
    if (event.key === 'Home') {
      this.edge(0);
      return true;
    }
    if (event.key === 'End') {
      this.edge(this.choices.length - 1);
      return true;
    }
    if (event.key === 'Escape') {
      this.close();
      return true;
    }
    if (this.typeToFilter) {
      if (event.key === ' ') {
        // The source field needs this space before attributes can follow the
        // language. Leaving the key to the editor writes it after closing us.
        this.close();
        return false;
      }
      if (
        event.key === 'Backspace' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (this.query === '') {
          this.close();
        } else {
          this.filter(this.query.slice(0, -1));
          this.draw();
        }
        return false;
      }
      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        this.filter(`${this.query}${event.key}`);
        this.draw();
        return false;
      }
    }
    const value = this.choices[this.selected]?.value;
    if (
      value !== undefined &&
      (event.key === 'Enter' || (event.key === ' ' && !this.typeToFilter))
    ) {
      this.answer(value);
      return true;
    }
    return false;
  }
}
