/**
 * The table operations a command trigger may name.
 *
 * Example: the context menu names `deleteRow`, and the editor registers the
 * same value as `table:deleteRow`; neither module owns a second operation list.
 *
 * May import: nothing. Upholds: the set and order of table commands have one home.
 */

/** Every operation the table menu offers, in the order the menu lists them. */
export const TABLE_COMMANDS = [
  'insertRowAbove',
  'insertRowBelow',
  'deleteRow',
  'clearRow',
  'moveRowUp',
  'moveRowDown',
  'insertColumnLeft',
  'insertColumnRight',
  'deleteColumn',
  'clearColumn',
  'moveColumnLeft',
  'moveColumnRight',
  'alignLeft',
  'alignCenter',
  'alignRight',
  'clearCell',
  'clearTable',
  'deleteTable'
] as const;

/** One of the table operations above. */
export type TableCommand = (typeof TABLE_COMMANDS)[number];
