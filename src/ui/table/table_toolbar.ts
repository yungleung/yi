import { eventManager } from '../../services/event_manager';
import { BaseComponent } from '../component';
import { TablePicker, type TableSize } from './table_picker';

/** The table picker announces a chosen size; the editor creates the table. */
export const TABLE_INSERT = 'table_insert';

/** The grid icon, sized like the formatting icons it sits beside. */
const TABLE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 36 36">' +
  '<path d="M0 0h36v36H0z" fill="none" />' +
  '<path fill="currentColor" d="M8 34a1 1 0 0 1-1-1V2.92a1 1 0 0 1 2 0V33a1 1 0 0 1-1 1" />' +
  '<path fill="currentColor" d="M17 33.92a1 1 0 0 1-1-1V9.1a1 1 0 1 1 2 0v23.82a1 1 0 0 1-1 1" />' +
  '<path fill="currentColor" d="M26 34a1 1 0 0 1-1-1V9a1 1 0 0 1 2 0v24a1 1 0 0 1-1 1" />' +
  '<path fill="currentColor" d="M33.11 18h-25a1 1 0 1 1 0-2h25a1 1 0 1 1 0 2" />' +
  '<path fill="currentColor" d="M33.1 26.94h-25a1 1 0 1 1 0-1.94h25a1 1 0 1 1 0 1.92Z" />' +
  '<path fill="currentColor" d="M33 8.92H3A1 1 0 1 1 3 7h30a1 1 0 1 1 0 1.94Z" />' +
  '</svg>';

/**
 * The create-table button at the titlebar's centre, and the picker it opens.
 * Like the formatting buttons, it must not start a window drag and must not
 * take focus away from the editor's selection.
 */
export class TableToolbar extends BaseComponent {
  private readonly picker: TablePicker;

  constructor() {
    super('div', ['relative', 'flex', 'items-center']);

    const button = document.createElement('button');
    button.className = 'btn btn-ghost btn-xs';
    button.title = 'Insert table';
    button.setAttribute('aria-label', 'Insert table');
    button.innerHTML = TABLE_ICON;
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', () => {
      if (this.picker.isOpen()) {
        this.picker.close();
      } else {
        this.picker.open();
      }
    });

    this.picker = new TablePicker((size: TableSize) => {
      void eventManager.emit(TABLE_INSERT, size);
    });
    this.element.append(button, this.picker.element);
  }
}
