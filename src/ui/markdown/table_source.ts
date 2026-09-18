/**
 * The source model of a GFM table.
 *
 * A table is a slice of a block's raw text: a header line, a delimiter line,
 * then body lines. This module turns that slice into rows, cell spans and
 * alignment, and answers the two questions the rest of the editor asks of a
 * table: which cell holds a given offset, and what a cell's text is.
 *
 * Two rules are copied from remark-gfm on purpose, because the renderer shows
 * what remark-gfm parsed: a cell boundary is any unescaped `|` (including one
 * inside inline code), and rows are not padded to the header's column count.
 *
 * A table inside a blockquote or a list item is not modelled: those lines carry
 * a marker (`> `, `- `) that would have to be stripped from every line first.
 * `readTableSource` returns null for them, so table edits simply do not apply
 * where the model cannot be trusted.
 */

export type ColumnAlign = 'left' | 'center' | 'right' | null;

export interface TableCellSpan {
  row: number;
  column: number;
  /** Where the cell's text starts: the caret anchor and the insert point. */
  contentStart: number;
  /** The cell's raw range between its pipes, padding included. */
  innerStart: number;
  innerEnd: number;
}

export interface TableRow {
  row: number;
  start: number;
  end: number;
  kind: 'header' | 'body';
  /** The cell values, padding trimmed. A `\|` keeps its backslash. */
  values: string[];
  cells: TableCellSpan[];
}

export interface TableSource {
  /** The header row, then the body rows: the delimiter line is not a row. */
  rows: TableRow[];
  delimiter: { start: number; end: number };
  columns: number;
  align: ColumnAlign[];
}

/** One delimiter cell: `---`, `:---`, `:---:` or `---:`. */
const DELIMITER_CELL = /^\s*:?-+:?\s*$/;
/** A quote or list marker in front of a pipe: not a table this model can read. */
const BLOCK_MARKER = /^\s*(?:>\s*)+$|^\s*(?:[-+*]|\d+[.)])\s+$/;

/** Thrown when a line carries a block marker, so its table is not modelled. */
class MarkerError extends Error {}

/** The span of each line of `text`, without its newline. */
function lineSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (;;) {
    const breakAt = text.indexOf('\n', start);
    const end = breakAt < 0 ? text.length : breakAt;
    spans.push({ start, end });
    if (breakAt < 0) {
      return spans;
    }
    start = breakAt + 1;
  }
}

/** The indexes of a line's unescaped pipes. */
function unescapedPipes(line: string): number[] {
  const pipes: number[] = [];
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '\\') {
      index += 1;
      continue;
    }
    if (line[index] === '|') {
      pipes.push(index);
    }
  }
  return pipes;
}

/**
 * The raw ranges between a line's unescaped pipes, in order.
 *
 * `| a | b |` and `a | b` both have two cells, and so has `| a | b`: a missing
 * outer pipe closes nothing, so what follows the last pipe is a cell too. A
 * trailing pipe leaves nothing after it and is not one.
 */
function innerRanges(line: string): Array<{ start: number; end: number }> {
  const pipes = unescapedPipes(line);
  if (pipes.length === 0) {
    return [];
  }
  const ranges: Array<{ start: number; end: number }> = [];
  const prefix = line.slice(0, pipes[0]);
  if (prefix.trim() !== '') {
    if (BLOCK_MARKER.test(prefix)) {
      throw new MarkerError();
    }
    ranges.push({ start: 0, end: pipes[0] });
  }
  for (let index = 0; index + 1 < pipes.length; index += 1) {
    ranges.push({ start: pipes[index] + 1, end: pipes[index + 1] });
  }
  const last = pipes[pipes.length - 1];
  if (line.slice(last + 1).trim() !== '') {
    ranges.push({ start: last + 1, end: line.length });
  }
  return ranges;
}

/** `innerRanges`, with a block-marked line answering "no cells". */
function safeRanges(line: string): Array<{ start: number; end: number }> {
  try {
    return innerRanges(line);
  } catch {
    return [];
  }
}

/** Whether a line is a delimiter row, and nothing else. */
function isDelimiter(line: string): boolean {
  const ranges = safeRanges(line);
  return (
    ranges.length > 0 &&
    ranges.every((range) => DELIMITER_CELL.test(line.slice(range.start, range.end)))
  );
}

/** Where typing in this cell lands: past the padding, never past the text. */
function contentStartOf(line: string, range: { start: number; end: number }): number {
  let start = range.start;
  while (start < range.end - 1 && line[start] === ' ') {
    start += 1;
  }
  return start;
}

function alignOf(cell: string): ColumnAlign {
  const left = cell.trimStart().startsWith(':');
  const right = cell.trimEnd().endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return null;
}

/** The line index an offset falls on. */
function spanOfOffset(spans: Array<{ start: number; end: number }>, offset: number): number {
  for (let index = 0; index < spans.length; index += 1) {
    if (offset <= spans[index].end) {
      return index;
    }
  }
  return spans.length - 1;
}

/**
 * The header line of the table the block holds.
 *
 * Without `at` the first table in the block wins. With `at` (a line index) the
 * *last* table starting at or before it wins, so in a block holding two tables
 * the offset decides which one is meant.
 */
function headerLine(lines: string[], at?: number): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (index + 1 >= lines.length || !isDelimiter(lines[index + 1]) || safeRanges(lines[index]).length === 0) {
      continue;
    }
    if (at === undefined || index <= at) {
      return at === undefined ? firstHeader(lines, index) : index;
    }
  }
  return -1;
}

/** The first header at or before `last` — used when no offset pins the table. */
function firstHeader(lines: string[], last: number): number {
  for (let index = 0; index <= last; index += 1) {
    if (index + 1 < lines.length && isDelimiter(lines[index + 1]) && safeRanges(lines[index]).length > 0) {
      return index;
    }
  }
  return last;
}

export function readTableSource(text: string, at?: number): TableSource | null {
  const spans = lineSpans(text);
  const lines = spans.map((span) => text.slice(span.start, span.end));
  const header =
    at === undefined
      ? headerLine(lines)
      : headerLine(lines, spanOfOffset(spans, at));
  if (header < 0) {
    return null;
  }
  const delimiterLine = lines[header + 1];
  const delimiterRanges = safeRanges(delimiterLine);
  const align = delimiterRanges.map((range) => alignOf(delimiterLine.slice(range.start, range.end)));

  const buildRow = (lineIndex: number, row: number, kind: 'header' | 'body'): TableRow => {
    const line = lines[lineIndex];
    const ranges = safeRanges(line);
    return {
      row,
      start: spans[lineIndex].start,
      end: spans[lineIndex].end,
      kind,
      values: ranges.map((range) => line.slice(range.start, range.end).trim()),
      cells: ranges.map((range, column) => ({
        row,
        column,
        contentStart: spans[lineIndex].start + contentStartOf(line, range),
        innerStart: spans[lineIndex].start + range.start,
        innerEnd: spans[lineIndex].start + range.end
      }))
    };
  };

  const rows: TableRow[] = [buildRow(header, 0, 'header')];
  for (let lineIndex = header + 2; lineIndex < lines.length; lineIndex += 1) {
    // A row must carry a pipe; the first line without one ends the table.
    if (safeRanges(lines[lineIndex]).length === 0) {
      break;
    }
    rows.push(buildRow(lineIndex, lineIndex - header - 1, 'body'));
  }
  return {
    rows,
    delimiter: { start: spans[header + 1].start, end: spans[header + 1].end },
    columns: delimiterRanges.length,
    align
  };
}

/** The row with this index, or null. */
export function rowAt(source: TableSource, row: number): TableRow | null {
  return source.rows.find((candidate) => candidate.row === row) ?? null;
}

/** The cell whose inner range holds `offset`, or the first cell otherwise. */
export function locateCell(source: TableSource, offset: number): TableCellSpan | null {
  let nearest: TableCellSpan | null = null;
  for (const row of source.rows) {
    for (const cell of row.cells) {
      nearest = nearest ?? cell;
      if (offset >= cell.innerStart && offset <= cell.innerEnd) {
        return cell;
      }
    }
  }
  return nearest;
}

/**
 * The cell directly below this one, or null when there is nothing below it —
 * the last row, or a short row that does not reach this column.
 */
export function cellBelow(source: TableSource, row: number, column: number): TableCellSpan | null {
  const next = source.rows.find((candidate) => candidate.row === row + 1);
  return next?.cells.find((cell) => cell.column === column) ?? null;
}

/** The cell's text, as the author wrote it (padding trimmed). */
export function cellValue(source: TableSource, text: string, row: number, column: number): string {
  const cell = rowAt(source, row)?.cells.find((candidate) => candidate.column === column);
  return cell ? text.slice(cell.innerStart, cell.innerEnd).trim() : '';
}

/** A line rewritten canonically: `| a | b |`, an empty cell as `|  |`. */
export function canonicalLine(values: readonly string[]): string {
  return `| ${values.join(' | ')} |`;
}

export function alignmentMarker(align: ColumnAlign): string {
  if (align === 'left') return ':---';
  if (align === 'right') return '---:';
  if (align === 'center') return ':---:';
  return '---';
}
