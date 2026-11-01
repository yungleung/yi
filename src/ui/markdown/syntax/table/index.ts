/**
 * The table syntax domain.
 *
 * Example: callers use `readTableSource` to locate a caret's cell, then one of the builders in
 * this same façade to turn a row or column command into a source edit.
 *
 * May import: the domain's source, caption, edit and command modules. Upholds: table syntax has one
 * explicit public surface, while shared caption grammar remains outside the domain.
 */

export {
  alignmentMarker,
  canonicalLine,
  cellBelow,
  cellValue,
  locateCell,
  readTableSource,
  readTableSourceInQuote,
  rowAt
} from './source';
export type {
  ColumnAlign,
  TableCellSpan,
  TableRow,
  TableSource
} from './source';
export {
  isTableCaptionLine,
  tableCaptionAfterTable,
  tableCaptionLine
} from './captions';
export type {
  TableCaptionAttachment,
  TableCaptionData,
  TableCaptionNode
} from './captions';
export {
  alignColumn,
  clearCell,
  clearColumn,
  clearRow,
  clearTable,
  deleteColumn,
  deleteRow,
  deleteTable,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  shiftOffset,
  shiftRangeEnd
} from './edits';
export type { TableEdit } from './edits';
export { TABLE_COMMANDS } from './commands';
export type { TableCommand } from './commands';
