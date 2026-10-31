/**
 * Stable table-editing facade over structural commands and cell navigation.
 *
 * Example: callers keep importing `insertTable`, `runTableCommand` or
 * `moveTableCell` from this module; the command and caret implementations can
 * change independently.
 *
 * May import: the table command and table caret modules. Upholds: the public
 * table API and command vocabulary remain one stable boundary for callers.
 */

export {
  TABLE_COMMANDS,
  insertTable,
  runTableCommand,
  tableSnapshot,
  type TableCommand,
  type TableTarget
} from './table_commands';
export {
  caretInTableCell,
  continueTableDown,
  moveTableCell,
  tableDeleteIsNoop
} from './table_caret';
