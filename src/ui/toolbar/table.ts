/**
 * The table button: opens the picker, and runs the editor's own create-table command with the size it
 * answered.
 *
 * May import: the command registry, the picker, the catalogue and the toolbar base. Upholds: the
 * button names the command; what a table's source looks like stays with the table edits.
 */

import { TablePicker } from '../table';
import { boxOf } from '../floating';
import { t } from '../../services/i18n';
import { Toolbar } from '../toolbar';

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
 * take focus away from the editor's selection. The picker hands the size it
 * chose to the editor's `table:insert` command.
 */
export class TableToolbar extends Toolbar {
  constructor(private readonly picker: TablePicker) {
    super();
    this.addButton(
      { label: t('toolbar.table'), icon: TABLE_ICON, className: 'text-[1.1em]' },
      () => this.picker.toggleAt(() => boxOf(this.element))
    );
  }
}
