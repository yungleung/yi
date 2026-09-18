import { BaseComponent } from '../component';

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
export class TablePicker extends BaseComponent {
  private readonly label: HTMLSpanElement;
  private readonly squares: HTMLButtonElement[] = [];

  constructor(private readonly onPick: (size: TableSize) => void) {
    super('div', [
      'hidden',
      'absolute',
      'top-full',
      'left-1/2',
      '-translate-x-1/2',
      'mt-1',
      'z-50',
      'w-[248px]',
      'rounded-lg',
      'border',
      'border-base-300',
      'bg-base-200',
      'p-2',
      'shadow-lg',
      'select-none'
    ]);

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
    // The panel lives inside the titlebar, whose mousedown starts a window
    // drag: every square stops that on its own (see `createSquare`). Clicks
    // anywhere else close the panel.
    document.addEventListener('mousedown', (event) => {
      if (this.isOpen() && !this.element.contains(event.target as Node)) {
        this.close();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  isOpen(): boolean {
    return !this.element.classList.contains('hidden');
  }

  open(): void {
    this.element.classList.remove('hidden');
    this.highlight(1, 1);
  }

  close(): void {
    this.element.classList.add('hidden');
  }

  private createSquare(row: number, column: number): HTMLButtonElement {
    const square = document.createElement('button');
    square.type = 'button';
    square.className = `flex h-5 items-center justify-center text-base ${INACTIVE}`;
    square.dataset.row = String(row);
    square.dataset.column = String(column);
    square.setAttribute('aria-label', `${column} columns by ${row} rows`);
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
