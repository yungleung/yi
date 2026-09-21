/**
 * Table commands: create a table at the caret, and restructure the table a
 * right-click pointed at.
 *
 * Every command is one `applyEdit`, so a table operation undoes as one step and
 * re-renders only the block it changed. The geometry lives in `table_source.ts`
 * and `table_edits.ts`; this module is the only part that touches the editor.
 */

import type { MarkdownBlock } from '../blocks';
import { lineSpanAt } from '../syntax/lines';
import { caretLocation } from '../caret/offsets';
import { cellBelow, readTableSource, rowAt, type TableSource } from '../syntax/table_source';
import {
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
  type TableEdit
} from '../syntax/table_edits';
import { blockPadding } from './blank_lines';
import { applyEdit, caretOffset, restoreCaret, type EditorContext } from './context';

export interface TableTarget {
  /** The 1-based first line of the table's block. */
  lineStart: number;
  /** 0 is the header row; 1.. are the body rows. */
  row: number;
  column: number;
}

/**
 * Every operation the table menu offers, in the order the menu lists them.
 *
 * The registry registers one command per entry, so this list — not the menu's
 * markup — is what decides which table commands exist, and the item a menu
 * carries names one of them by type.
 */
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

/** One of the table commands above. */
export type TableCommand = (typeof TABLE_COMMANDS)[number];

/** The table a target points at: its block, its raw text and its model. */
export function tableSnapshot(
  context: EditorContext,
  target: TableTarget
): { block: MarkdownBlock; source: TableSource; text: string } | null {
  const block = context.state.getBlockAtLine(target.lineStart);
  if (!block) {
    return null;
  }
  const source = readTableSource(block.text);
  return source ? { block, source, text: block.text } : null;
}

/** The markdown of a new table: a header row, a delimiter row, then the body. */
function tableMarkdown(columns: number, rows: number): string {
  const header = `| ${Array.from({ length: columns }, () => '').join(' | ')} |`;
  const delimiter = `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`;
  const body = Array.from({ length: Math.max(0, rows - 1) }, () => header);
  return [header, delimiter, ...body].join('\n');
}

/**
 * Creates a table at the caret.
 *
 * The picked size counts the header row. An empty paragraph *becomes* the
 * table; anywhere else the paragraph is split and the table is inserted as a
 * block of its own, with the blank lines markdown needs to keep it from merging
 * into the paragraphs around it.
 */
export function insertTable(
  context: EditorContext,
  size: { rows: number; columns: number }
): boolean {
  const caret = caretOffset(context);
  if (caret === null) {
    return false;
  }
  const columns = Math.max(1, Math.min(10, Math.floor(size.columns)));
  const rows = Math.max(1, Math.min(10, Math.floor(size.rows)));
  const table = tableMarkdown(columns, rows);
  const firstCell = readTableSource(table)?.rows[0].cells[0].contentStart ?? 0;
  const text = context.state.getText();
  const block = context.state.getBlockAtOffset(caret);

  if (block?.kind === 'blank') {
    const line = lineSpanAt(text, caret);
    applyEdit(context, line.start, line.end, table, line.start + firstCell);
    return true;
  }

  // A block boundary needs a blank line on each side: keep the newlines that
  // are already there and add only the ones a paragraph break still misses.
  const { leading, trailing } = blockPadding(text, caret);
  applyEdit(
    context,
    caret,
    caret,
    `${leading}${table}${trailing}`,
    caret + leading.length + firstCell
  );
  return true;
}

/** The pure edit a command makes, or null when it does not apply here. */
function editFor(
  source: TableSource,
  text: string,
  target: TableTarget,
  command: TableCommand
): TableEdit | null {
  const { row, column } = target;
  switch (command) {
    case 'insertRowAbove':
      return insertRow(source, row, 'above');
    case 'insertRowBelow':
      return insertRow(source, row, 'below');
    case 'deleteRow':
      return deleteRow(source, text, row);
    case 'clearRow':
      return clearRow(source, row);
    case 'moveRowUp':
      return moveRow(source, text, row, -1);
    case 'moveRowDown':
      return moveRow(source, text, row, 1);
    case 'insertColumnLeft':
      return insertColumn(source, text, column, 'left');
    case 'insertColumnRight':
      return insertColumn(source, text, column, 'right');
    case 'deleteColumn':
      return deleteColumn(source, text, column);
    case 'clearColumn':
      return clearColumn(source, text, column);
    case 'moveColumnLeft':
      return moveColumn(source, text, column, -1);
    case 'moveColumnRight':
      return moveColumn(source, text, column, 1);
    case 'alignLeft':
      return alignColumn(source, column, 'left');
    case 'alignCenter':
      return alignColumn(source, column, 'center');
    case 'alignRight':
      return alignColumn(source, column, 'right');
    case 'clearCell':
      return clearCell(source, row, column);
    case 'clearTable':
      return clearTable(source, text);
    case 'deleteTable':
      return deleteTable(source, text);
    default:
      return null;
  }
}

/**
 * Runs one table operation on the table the target points at.
 *
 * The caret keeps its place through the edit by the standard rule: text that
 * moved down carries the caret with it, and an edit above the caret shifts it.
 */
export function runTableCommand(
  context: EditorContext,
  target: TableTarget,
  command: TableCommand
): boolean {
  const snapshot = tableSnapshot(context, target);
  if (!snapshot) {
    return false;
  }
  const edit = editFor(snapshot.source, snapshot.text, target, command);
  if (!edit) {
    return false;
  }
  const caret = caretOffset(context) ?? snapshot.block.charStart + edit.from;
  const moved = shiftOffset(caret - snapshot.block.charStart, edit);
  applyEdit(
    context,
    snapshot.block.charStart + edit.from,
    snapshot.block.charStart + edit.to,
    edit.replacement,
    snapshot.block.charStart + moved
  );
  return true;
}

/** The table, block and cell the caret sits in, or null. */
function caretTable(
  context: EditorContext
): { source: TableSource; block: MarkdownBlock; row: number; column: number } | null {
  const location = caretLocation(context.state);
  if (!location) {
    return null;
  }
  const source = readTableSource(location.block.text, location.blockOffset);
  if (!source) {
    return null;
  }
  const cell = source.rows
    .flatMap((row) => row.cells)
    .find(
      (candidate) =>
        location.blockOffset >= candidate.innerStart && location.blockOffset <= candidate.innerEnd
    );
  return cell ? { source, block: location.block, row: cell.row, column: cell.column } : null;
}

/** Whether the caret sits inside a table cell. */
export function caretInTableCell(context: EditorContext): boolean {
  return caretTable(context) !== null;
}

/**
 * `Enter` inside a table cell: go down the column, and leave the table when
 * there is nothing below.
 *
 * The caret moves to the cell under it — the same column, the next row — which
 * is how a table is filled in. A cell with no cell under it ends the column,
 * and there the key starts an empty paragraph below the table, the way `Enter`
 * at the end of any other block behaves.
 */
export function continueTableDown(context: EditorContext): boolean {
  const found = caretTable(context);
  if (!found) {
    return false;
  }
  const below = cellBelow(found.source, found.row, found.column);
  if (below) {
    return restoreCaret(context, found.block.charStart + below.contentStart);
  }
  return leaveTableBelow(context, found.block);
}

/**
 * Starts an empty paragraph after the table.
 *
 * The newlines already sitting after the table are counted and only the
 * missing ones are added. Between the table and a following block one blank
 * line is the separator and the next one is the empty paragraph, so three
 * newlines are needed there; at the end of the document no separator is due
 * and the paragraph is the second newline.
 *
 * The caret is put on the paragraph by asking the state where the first empty
 * paragraph after the table is, rather than by counting characters: the line
 * the author sees is the one the caret has to land on.
 */
function leaveTableBelow(context: EditorContext, block: MarkdownBlock): boolean {
  const rows = readTableSource(block.text)?.rows;
  const lastRow = rows?.[rows.length - 1];
  if (!lastRow) {
    return false;
  }
  const after = block.charStart + lastRow.end;
  const text = context.state.getText();
  const run = /^\n+/.exec(text.slice(after))?.[0].length ?? 0;
  const endsTheDocument = text.slice(after + run) === '';
  const neededRun = endsTheDocument ? 2 : 3;
  const insertion = '\n'.repeat(Math.max(0, neededRun - run));
  const caret = (state: { firstEmptyParagraphAfter(offset: number): number | null }): number =>
    state.firstEmptyParagraphAfter(after) ?? after;
  if (insertion.length === 0) {
    // The empty paragraph is already there: Enter moves onto it.
    const offset = context.state.firstEmptyParagraphAfter(after);
    return offset === null ? false : restoreCaret(context, offset);
  }
  applyEdit(context, after + run, after + run, insertion, caret);
  return true;
}

/**
 * Whether Backspace/Delete at the caret has nothing to delete *inside its
 * cell*: the cell is empty, or the caret is at the edge of its content. There
 * the key would eat a pipe or the neighbouring cell instead, which is never
 * what the author meant.
 */
export function tableDeleteIsNoop(context: EditorContext, forward: boolean): boolean {
  const found = caretTable(context);
  const location = caretLocation(context.state);
  if (!found || !location) {
    return false;
  }
  const cell = rowAt(found.source, found.row)?.cells.find(
    (candidate) => candidate.column === found.column
  );
  if (!cell) {
    return false;
  }
  const content = found.block.text.slice(cell.contentStart, cell.innerEnd).trimEnd();
  if (content === '') {
    return true;
  }
  const contentEnd = cell.contentStart + content.length;
  return forward
    ? location.blockOffset >= contentEnd
    : location.blockOffset <= cell.contentStart;
}

/**
 * Moves the caret to the next (+1) or previous (-1) cell of the table, in
 * reading order. Tab in the last cell adds a body row and moves into it; there
 * is nothing to add behind the first cell, so Shift+Tab there stays put.
 */
export function moveTableCell(context: EditorContext, direction: -1 | 1): boolean {
  const found = caretTable(context);
  if (!found) {
    return false;
  }
  const { source, block } = found;
  const flat = source.rows.flatMap((row) =>
    row.cells.map((cell) => ({ row: row.row, column: cell.column }))
  );
  const index = flat.findIndex((cell) => cell.row === found.row && cell.column === found.column);
  const target = flat[index + direction];
  if (target) {
    return placeCaretInCell(context, block, source, target.row, target.column);
  }
  if (direction < 0) {
    return false;
  }
  const lastRow = source.rows[source.rows.length - 1];
  const edit = insertRow(source, lastRow.row, 'below');
  const nextText = `${block.text.slice(0, edit.from)}${edit.replacement}${block.text.slice(edit.to)}`;
  const caret = readTableSource(nextText)?.rows[source.rows.length]?.cells[0]?.contentStart;
  if (caret === undefined) {
    return false;
  }
  applyEdit(
    context,
    block.charStart + edit.from,
    block.charStart + edit.to,
    edit.replacement,
    block.charStart + caret
  );
  return true;
}

/** Puts the caret at the start of a cell's content. */
function placeCaretInCell(
  context: EditorContext,
  block: MarkdownBlock,
  source: TableSource,
  row: number,
  column: number
): boolean {
  const cell = rowAt(source, row)?.cells.find((candidate) => candidate.column === column);
  if (!cell) {
    return false;
  }
  // `restoreCaret` returns false when the block is not mounted: Tab then does
  // nothing, which is better than moving the caret somewhere unrelated.
  return restoreCaret(context, block.charStart + cell.contentStart);
}
