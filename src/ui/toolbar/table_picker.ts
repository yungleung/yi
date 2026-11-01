/**
 * The table picker: the grid a reader drags over to say how big a new table is.
 *
 * May import: the catalogue and the anchored-panel base. Upholds: one place that turns a size into a
 * hover state and an answer, so the table command gets a size rather than a pointer stream.
 */

import { t } from '../../services/i18n';
import { AnchoredPanel } from '../floating';

/** The size the author picked, in rows (header included) and columns. */
export interface TableSize {
  rows: number;
  columns: number;
}

/** The largest table the picker offers. */
const GRID = 10;

/** One square of the chooser: an outlined cell the author clicks to size a table. */
const SQUARE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
  '<path d="M0 0h24v24H0z" fill="none" />' +
  '<path fill="currentColor" d="M4 20V4h16v16zm1-1h14V5H5zm0 0V5z" />' +
  '</svg>';

/** The classes a square wears when it is inside the highlighted region. */
const ACTIVE = 'text-primary';
/** …and when it is outside it. */
const INACTIVE = 'text-base-content/25';

/**
 * The table chooser: hovering a square highlights every square up to it and
 * labels the size, and clicking one picks it. The panel closes on Esc, on a
 * click outside, and after a pick.
 */
export class TablePicker extends AnchoredPanel {
  private readonly label: HTMLSpanElement;
  private readonly squares: HTMLButtonElement[] = [];

  constructor(private readonly onPick: (size: TableSize) => void) {
    super({ className: 'left-1/2 -translate-x-1/2 w-[248px] p-2' });

    this.label = document.createElement('span');
    this.label.className = 'mb-1 block text-center text-xs opacity-70';

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-10 gap-[2px]';
    grid.style.gridTemplateColumns = `repeat(${GRID}, minmax(0, 1fr))`;
    for (let row = 1; row <= GRID; row += 1) {
      for (let column = 1; column <= GRID; column += 1) {
        grid.appendChild(this.createSquare(row, column));
      }
    }

    this.element.append(this.label, grid);
    this.highlight(1, 1);
  }

  /** Opens on the first square, so hovering reads as the chooser it is. */
  open(): void {
    super.open();
    this.highlight(1, 1);
  }

  private createSquare(row: number, column: number): HTMLButtonElement {
    const square = document.createElement('button');
    square.type = 'button';
    square.className = `flex h-5 items-center justify-center text-base ${INACTIVE}`;
    square.dataset.row = String(row);
    square.dataset.column = String(column);
    square.setAttribute('aria-label', t('toolbar.tableSize', { columns: column, rows: row }));
    square.innerHTML = SQUARE_ICON;
    square.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    square.addEventListener('mouseenter', () => this.highlight(row, column));
    square.addEventListener('click', () => {
      this.close();
      this.onPick({ rows: row, columns: column });
    });
    this.squares.push(square);
    return square;
  }

  /** Highlights every square up to (row, column), the way a chooser reads. */
  private highlight(row: number, column: number): void {
    this.label.textContent = `${column} × ${row}`;
    for (const square of this.squares) {
      const active =
        Number(square.dataset.row) <= row && Number(square.dataset.column) <= column;
      square.classList.toggle(ACTIVE, active);
      square.classList.toggle(INACTIVE, !active);
    }
  }
}
