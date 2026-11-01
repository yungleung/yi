/**
 * What the table's context menu offers, for the row that was right-clicked: the pure model the native
 * menu is built from.
 *
 * May import: the table's source reader. Upholds: one rule for which commands a row may be given, so
 * the menu and its check read the same model.
 */

import { rowAt, type TableSource } from '../markdown/syntax/table_source';
import type { TableCommand } from '../markdown/editing/table';

/** One node of the table context menu. */
export type TableMenuNode =
  | { kind: 'submenu'; label: string; items: TableMenuNode[] }
  | { kind: 'item'; id: string; label: string; enabled: boolean; command: TableCommand }
  | { kind: 'separator' };

/**
 * The context menu for one cell: what can be done to its row, its column, and
 * the cell itself.
 *
 * The enabled flags come from the same model the operations use, so an item is
 * never offered while its operation would refuse to run — and never withheld
 * while it would work. Items that cannot apply stay in the menu, disabled, so
 * the groups keep the same shape wherever the author right-clicks.
 */
export function tableMenuModel(source: TableSource, row: number, column: number): TableMenuNode[] {
  const rows = source.rows;
  const lastRow = rows[rows.length - 1].row;
  const inBody = row > 0;
  const rowEmpty = (rowAt(source, row)?.values ?? []).every((value) => value === '');
  const columnEmpty = rows.every((candidate) => (candidate.values[column] ?? '') === '');
  const tableEmpty = rows.every((candidate) => candidate.values.every((value) => value === ''));
  const cellEmpty = (rowAt(source, row)?.values[column] ?? '') === '';
  const item = (
    id: string,
    label: string,
    enabled: boolean,
    command: TableCommand
  ): TableMenuNode => ({ kind: 'item', id, label, enabled, command });

  return [
    {
      kind: 'submenu',
      label: 'Row',
      items: [
        item('row-above', 'Insert Row Above', true, 'insertRowAbove'),
        item('row-below', 'Insert Row Below', true, 'insertRowBelow'),
        { kind: 'separator' },
        item('row-delete', 'Delete Row', inBody, 'deleteRow'),
        item('row-clear', 'Clear Row', !rowEmpty, 'clearRow'),
        { kind: 'separator' },
        item('row-up', 'Move Row Up', inBody && row > 1, 'moveRowUp'),
        item('row-down', 'Move Row Down', inBody && row < lastRow, 'moveRowDown')
      ]
    },
    {
      kind: 'submenu',
      label: 'Column',
      items: [
        item('column-left', 'Insert Column Left', true, 'insertColumnLeft'),
        item('column-right', 'Insert Column Right', true, 'insertColumnRight'),
        { kind: 'separator' },
        item('column-delete', 'Delete Column', source.columns > 1, 'deleteColumn'),
        item('column-clear', 'Clear Column', !columnEmpty, 'clearColumn'),
        { kind: 'separator' },
        item('column-move-left', 'Move Column Left', column > 0, 'moveColumnLeft'),
        item('column-move-right', 'Move Column Right', column < source.columns - 1, 'moveColumnRight'),
        { kind: 'separator' },
        {
          kind: 'submenu',
          label: 'Align Column',
          items: [
            item('align-left', 'Left', source.align[column] !== 'left', 'alignLeft'),
            item('align-center', 'Center', source.align[column] !== 'center', 'alignCenter'),
            item('align-right', 'Right', source.align[column] !== 'right', 'alignRight')
          ]
        }
      ]
    },
    { kind: 'separator' },
    item('clear-cell', 'Clear Cell', !cellEmpty, 'clearCell'),
    item('clear-table', 'Clear Table', !tableEmpty, 'clearTable'),
    item('delete-table', 'Delete Table', true, 'deleteTable')
  ];
}
