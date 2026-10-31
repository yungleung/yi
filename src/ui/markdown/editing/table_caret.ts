/**
 * Table-aware caret movement, deletion guards and Enter/Tab behavior.
 *
 * Example: Enter moves down one cell in the same column; Tab in the last cell
 * adds a row and enters it, while Enter below the final row starts a paragraph.
 *
 * May import: table source/edit rules, quote projection, caret location and the
 * edit context. Upholds: caret placement is derived from the raw cell model and
 * only a cell that is mounted can receive it.
 */

import type { MarkdownBlock } from '../document/blocks';
import { caretLocation } from '../caret/offsets';
import {
  cellBelow,
  readTableSource,
  readTableSourceInQuote,
  rowAt,
  type TableSource
} from '../syntax/table_source';
import { insertRow } from '../syntax/table_edits';
import { quoteLineAt } from '../syntax/quote_edits';
import { applyEdit, restoreCaret, type EditorContext } from './context';

/** The table, block and cell the caret sits in, or null. */
function caretTable(
  context: EditorContext
): {
  source: TableSource;
  block: MarkdownBlock;
  row: number;
  column: number;
  quotePrefix: string | null;
} | null {
  const location = caretLocation(context.state);
  if (!location) {
    return null;
  }
  const quote = quoteLineAt(location.block.text, location.blockOffset);
  const quotePrefix =
    quote === null
      ? null
      : location.block.text.slice(quote.start, quote.prefixEnd).trimEnd();
  const source =
    readTableSource(location.block.text, location.blockOffset) ??
    (quotePrefix === null
      ? null
      : readTableSourceInQuote(location.block.text, location.blockOffset));
  if (!source) {
    return null;
  }
  const cell = source.rows
    .flatMap((row) => row.cells)
    .find(
      (candidate) =>
        location.blockOffset >= candidate.innerStart && location.blockOffset <= candidate.innerEnd
    );
  return cell
    ? {
        source,
        block: location.block,
        row: cell.row,
        column: cell.column,
        quotePrefix
      }
    : null;
}

/** Whether the caret sits inside a table cell. */
export function caretInTableCell(context: EditorContext): boolean {
  return caretTable(context) !== null;
}

/**
 * `Enter` inside a table cell: go down the column, and leave the table when
 * there is nothing below.
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
  return leaveTableBelow(context, found.block, found.source, found.quotePrefix);
}

/**
 * Starts an empty paragraph after the table, adding only the newlines the
 * current text still misses.
 */
function leaveTableBelow(
  context: EditorContext,
  block: MarkdownBlock,
  source: TableSource,
  quotePrefix: string | null
): boolean {
  const rows = source.rows;
  const lastRow = rows?.[rows.length - 1];
  if (!lastRow) {
    return false;
  }
  const after = block.charStart + lastRow.end;
  const text = context.state.getText();
  if (quotePrefix !== null) {
    const nextLineStart = after + 1;
    const nextLineEnd = text.indexOf('\n', nextLineStart);
    const nextLine = text.slice(nextLineStart, nextLineEnd < 0 ? text.length : nextLineEnd);
    if (text[after] === '\n' && nextLine.trimEnd() === quotePrefix) {
      return restoreCaret(context, nextLineStart + quotePrefix.length);
    }
    const insertion = `\n${quotePrefix}`;
    applyEdit(context, after, after, insertion, after + insertion.length);
    return true;
  }
  const run = /^\n+/.exec(text.slice(after))?.[0].length ?? 0;
  const endsTheDocument = text.slice(after + run) === '';
  const neededRun = endsTheDocument ? 2 : 3;
  const insertion = '\n'.repeat(Math.max(0, neededRun - run));
  const caret = (state: { firstEmptyParagraphAfter(offset: number): number | null }): number =>
    state.firstEmptyParagraphAfter(after) ?? after;
  if (insertion.length === 0) {
    const offset = context.state.firstEmptyParagraphAfter(after);
    return offset === null ? false : restoreCaret(context, offset);
  }
  applyEdit(context, after + run, after + run, insertion, caret);
  return true;
}

/**
 * Whether Backspace/Delete at the caret has nothing to delete *inside its
 * cell*: the cell is empty, or the caret is at the edge of its content.
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
 * Moves the caret to the next (+1) or previous (-1) cell in reading order. Tab
 * in the last cell adds a body row and moves into it.
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
  // A block that is not mounted cannot receive the caret yet.
  return restoreCaret(context, block.charStart + cell.contentStart);
}
