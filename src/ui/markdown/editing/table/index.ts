/**
 * The table-editing command domain.
 *
 * Example: `insertTable` and `runTableCommand` change structural rows and cells, while
 * `moveTableCell` and `continueTableDown` navigate the same raw table model.
 *
 * May import: the domain's operation and caret modules. Upholds: table command
 * vocabulary, mutation and navigation have one public entrypoint.
 */

export {
  TABLE_COMMANDS,
  insertTable,
  runTableCommand,
  tableSnapshot,
  type TableCommand,
  type TableTarget
} from './operations';
export {
  caretInTableCell,
  continueTableDown,
  moveTableCell,
  tableDeleteIsNoop
} from './caret';
export { tableMenuModel } from './menu_model';
export type { TableMenuNode } from './menu_model';
