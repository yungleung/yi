/**
 * Creates tables and applies structural table commands to a target cell.
 *
 * Example: `insertTable({ rows: 3, columns: 2 })` creates a header, delimiter
 * and two body rows as one edit; `deleteRow` addresses the clicked row by its
 * model position rather than a rendered DOM coordinate.
 *
 * May import: table source/edit rules, quote projection, line padding, the edit
 * context and table command vocabulary. Upholds: each operation is one
 * `applyEdit`, and its target comes from the table's raw source.
 */

import type { MarkdownBlock } from '../../document/block';
import { TABLE_COMMANDS, type TableCommand } from '../../syntax/table';
import { lineSpanAt } from '../../syntax/lines';
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
  readTableSource,
  shiftOffset,
  type TableEdit,
  type TableSource
} from '../../syntax/table';
import {
  prefixInsertedBreaks,
  projectQuoteSource,
  quoteLineAt
} from '../../syntax/container';
import { blockPadding } from '../blank_lines';
import { applyEdit, caretOffset, type EditorContext } from '../context';

export interface TableTarget {
  /** The 1-based first line of the table's block. */
  lineStart: number;
  /** 0 is the header row; 1.. are the body rows. */
  row: number;
  column: number;
}

export { TABLE_COMMANDS, type TableCommand };

/**
 * The table a target points at: its block, its raw text and its model.
 *
 * Example: target `{ lineStart: 12, row: 1, column: 0 }` returns the table
 * block beginning on line 12 and its first body cell.
 */
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
 * block of its own, with the blank lines markdown needs to keep it apart.
 *
 * Example: `insertTable(context, { rows: 3, columns: 2 })` inserts one header,
 * one delimiter and two body rows, then puts the caret in the first header cell.
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
  if (block !== null) {
    const blockOffset = caret - block.charStart;
    const quote = quoteLineAt(block.text, blockOffset);
    if (quote !== null) {
      const projected = projectQuoteSource(block.text);
      const sourceFrom =
        quote.content.trim() === '' ? quote.end : blockOffset;
      const projectedFrom =
        projected.projectedOffsets[sourceFrom] ?? projected.text.length;
      const { leading, trailing } = blockPadding(projected.text, projectedFrom);
      const insertion = prefixInsertedBreaks(
        block.text.slice(quote.start, quote.prefixEnd),
        `${leading}${table}${trailing}`,
        leading.length + firstCell
      );
      applyEdit(
        context,
        block.charStart + sourceFrom,
        block.charStart + sourceFrom,
        insertion.replacement,
        block.charStart + sourceFrom + insertion.caret
      );
      return true;
    }
  }

  if (block?.kind === 'blank') {
    const line = lineSpanAt(text, caret);
    // The line becomes the table, and the blank lines the table needs come from
    // the same rule the mid-paragraph insert uses: without the one below it, a
    // paragraph on the next line is read as a ragged table row.
    const { leading, trailing } = blockPadding(text, line.start);
    applyEdit(
      context,
      line.start,
      line.end,
      `${leading}${table}${trailing}`,
      line.start + leading.length + firstCell
    );
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
 * The caret keeps its place through the edit: moved text carries it along, and
 * an edit above the caret shifts it by the same byte delta.
 *
 * Example: `runTableCommand(context, target, 'deleteRow')` removes the clicked
 * body row and keeps the caret in the same logical table position when possible.
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
