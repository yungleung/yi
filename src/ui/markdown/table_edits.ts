/**
 * Every table operation, expressed as one replacement of a range of the
 * table's raw text.
 *
 * An operation never touches the document: it answers "what text replaces what
 * range", and the command layer applies that through `applyEdit`. A `null`
 * means the operation does not apply to this table — the state the menu shows
 * as a disabled item.
 *
 * Lines an operation changes are rewritten canonically; lines it does not
 * change are spliced through untouched, so hand-made padding survives
 * everywhere the edit did not have to touch.
 */

import {
  alignmentMarker,
  canonicalLine,
  rowAt,
  type ColumnAlign,
  type TableSource
} from './table_source';

export interface TableEdit {
  from: number;
  to: number;
  replacement: string;
}

/** Where an offset ends up once `edit` is applied. */
export function shiftOffset(offset: number, edit: TableEdit): number {
  if (offset <= edit.from) return offset;
  if (offset >= edit.to) return offset + (edit.replacement.length - (edit.to - edit.from));
  return edit.from;
}

/** One of the table's source lines: the delimiter line has no row index. */
interface TableLine {
  start: number;
  end: number;
  row: number;
  kind: 'header' | 'delimiter' | 'body';
}

/** The table's lines in order: header, delimiter, then the body rows. */
function linesOf(source: TableSource): TableLine[] {
  const header = source.rows[0];
  const lines: TableLine[] = [
    { start: header.start, end: header.end, row: 0, kind: 'header' },
    { start: source.delimiter.start, end: source.delimiter.end, row: -1, kind: 'delimiter' }
  ];
  for (const row of source.rows.slice(1)) {
    lines.push({ start: row.start, end: row.end, row: row.row, kind: 'body' });
  }
  return lines;
}

function lineOf(source: TableSource, row: number): TableLine {
  const lines = linesOf(source);
  return lines.find((line) => line.row === row) ?? lines[lines.length - 1];
}

/** A line's cells: the delimiter line's markers, or a row's own values. */
function rawValues(source: TableSource, line: TableLine): string[] {
  if (line.kind === 'delimiter') {
    return Array.from({ length: source.columns }, (_, column) => alignmentMarker(source.align[column]));
  }
  return [...(rowAt(source, line.row)?.values ?? [])];
}

/**
 * Rewrites the whole table, keeping every line the transform declines (`null`)
 * exactly as it was. One replacement covers the table, so the edit is one undo
 * step however many lines it changed.
 */
function rewriteLines(
  source: TableSource,
  text: string,
  transform: (line: TableLine, values: string[]) => string | null
): TableEdit {
  const lines = linesOf(source);
  const next = lines.map((line) => {
    const replaced = transform(line, rawValues(source, line));
    return replaced ?? text.slice(line.start, line.end);
  });
  return {
    from: lines[0].start,
    to: lines[lines.length - 1].end,
    replacement: next.join('\n')
  };
}

/** One row's line, rewritten canonically. */
function lineEdit(source: TableSource, row: number, values: readonly string[]): TableEdit {
  const line = lineOf(source, row);
  return { from: line.start, to: line.end, replacement: canonicalLine(values) };
}

/** An empty row of the table's width. */
function emptyValues(source: TableSource): string[] {
  return Array.from({ length: source.columns }, () => '');
}

export function insertRow(source: TableSource, row: number, where: 'above' | 'below'): TableEdit {
  const line = lineOf(source, row);
  const newLine = canonicalLine(emptyValues(source));
  // The newline travels with the new row, so it lands after the given row
  // whether or not that row is the document's last line.
  return where === 'below'
    ? { from: line.end, to: line.end, replacement: `\n${newLine}` }
    : { from: line.start, to: line.start, replacement: `${newLine}\n` };
}

export function deleteRow(source: TableSource, text: string, row: number): TableEdit | null {
  if (row <= 0 || !rowAt(source, row)) {
    return null;
  }
  const line = lineOf(source, row);
  return text[line.end] === '\n'
    ? { from: line.start, to: line.end + 1, replacement: '' }
    : { from: Math.max(0, line.start - 1), to: line.end, replacement: '' };
}

export function clearRow(source: TableSource, row: number): TableEdit | null {
  const found = rowAt(source, row);
  if (!found || found.values.every((value) => value === '')) {
    return null;
  }
  return lineEdit(source, row, emptyValues(source));
}

export function moveRow(
  source: TableSource,
  text: string,
  row: number,
  delta: -1 | 1
): TableEdit | null {
  const target = row + delta;
  // Only the body rows move: the header row stays the header, and the
  // delimiter line is not a row at all.
  if (row <= 0 || target <= 0 || !rowAt(source, row) || !rowAt(source, target)) {
    return null;
  }
  const first = lineOf(source, Math.min(row, target));
  const second = lineOf(source, Math.max(row, target));
  return {
    from: first.start,
    to: second.end,
    replacement: [text.slice(second.start, second.end), text.slice(first.start, first.end)].join('\n')
  };
}

export function insertColumn(
  source: TableSource,
  text: string,
  column: number,
  where: 'left' | 'right'
): TableEdit {
  const index = where === 'left' ? column : column + 1;
  return rewriteLines(source, text, (line, values) => {
    // A short row has no cell at that index yet: the new column's cells are
    // what makes it as wide as the table.
    while (values.length < source.columns) {
      values.push('');
    }
    values.splice(index, 0, line.kind === 'delimiter' ? '---' : '');
    return canonicalLine(values);
  });
}

export function deleteColumn(source: TableSource, text: string, column: number): TableEdit | null {
  if (source.columns <= 1 || column < 0 || column >= source.columns) {
    return null;
  }
  return rewriteLines(source, text, (_line, values) =>
    values.length <= column ? null : canonicalLine(values.filter((_, index) => index !== column))
  );
}

export function clearColumn(source: TableSource, text: string, column: number): TableEdit | null {
  if (column < 0 || column >= source.columns) {
    return null;
  }
  if (source.rows.every((row) => (row.values[column] ?? '') === '')) {
    return null;
  }
  return rewriteLines(source, text, (line, values) => {
    // A column's alignment is not its cells' content: the delimiter line stays.
    if (line.kind === 'delimiter' || values.length <= column) {
      return null;
    }
    values[column] = '';
    return canonicalLine(values);
  });
}

export function moveColumn(
  source: TableSource,
  text: string,
  column: number,
  delta: -1 | 1
): TableEdit | null {
  const target = column + delta;
  if (column < 0 || column >= source.columns || target < 0 || target >= source.columns) {
    return null;
  }
  return rewriteLines(source, text, (_line, values) => {
    if (values.length <= target) {
      return null;
    }
    const moved = values[column];
    values[column] = values[target];
    values[target] = moved;
    return canonicalLine(values);
  });
}

export function alignColumn(source: TableSource, column: number, align: ColumnAlign): TableEdit | null {
  if (column < 0 || column >= source.columns || source.align[column] === align) {
    return null;
  }
  const values = Array.from({ length: source.columns }, (_, index) =>
    alignmentMarker(index === column ? align : source.align[index])
  );
  return {
    from: source.delimiter.start,
    to: source.delimiter.end,
    replacement: canonicalLine(values)
  };
}

export function clearCell(source: TableSource, row: number, column: number): TableEdit | null {
  const found = rowAt(source, row);
  if (!found || (found.values[column] ?? '') === '') {
    return null;
  }
  const values = [...found.values];
  values[column] = '';
  return lineEdit(source, row, values);
}

export function clearTable(source: TableSource, text: string): TableEdit | null {
  const changed = source.rows.some((row) => row.values.some((value) => value !== ''));
  if (!changed) {
    return null;
  }
  return rewriteLines(source, text, (line, values) =>
    line.kind === 'delimiter' ? null : canonicalLine(values.map(() => ''))
  );
}

export function deleteTable(source: TableSource, text: string): TableEdit {
  const lines = linesOf(source);
  const first = lines[0];
  const last = lines[lines.length - 1];
  // One newline goes with the lines, so a table removed from the middle of a
  // block does not leave a blank line behind.
  return text[last.end] === '\n'
    ? { from: first.start, to: last.end + 1, replacement: '' }
    : { from: Math.max(0, first.start - 1), to: last.end, replacement: '' };
}
