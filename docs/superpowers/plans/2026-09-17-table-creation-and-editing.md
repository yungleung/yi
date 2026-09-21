# Table Creation and Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the author create a GFM table from a titlebar picker and restructure it from a native right-click menu, with cells that behave like ordinary editable lines.

**Architecture:** The raw markdown stays the single source of truth. A pure module (`table_source.ts`) parses a table's raw slice into rows, cell spans and alignment; a second pure module (`table_edits.ts`) turns each operation into one range replacement; a thin command module (`editing/table.ts`) applies it through the existing `applyEdit`. The renderer only names cells by index (`data-table-cell="row:column"`), and the offset mappers turn that name into a real offset from the block text they already hold — so no render plumbing changes and no node reaches into the editor. The native menu is built from a pure item model and popped up by one Tauri-aware module.

**Tech Stack:** TypeScript, Vite, Tauri v2 (`@tauri-apps/api/menu`), remark-gfm, daisyUI/Tailwind, `rolldown` for Node-side checks of the pure modules.

**Spec:** `docs/superpowers/specs/2026-09-17-table-creation-and-editing-design.md`

## Global Constraints

- **Every shell command starts with `cd .`** — this session's working directory is a placeholder for the project.
- **Testing goes through the Tauri MCP bridge** (AGENTS.md). Start the app with `npm run tauri dev` (bridge on `127.0.0.1:9223`, window `main`); if the page stops answering, `node scripts/tauri-probe.mjs --reload`.
- A probe is **one expression**; keep partial results with `window.__t.report({...})` and read `window.__probeResult` / `window.__probeSteps` after a timeout.
- `npx tsc --noEmit` must pass before every commit.
- Offsets are **block-relative**; a document offset is `block.charStart + relative`, and `charStart` is refreshed on every edit, so absolute offsets are never stored.
- Every user action is **one edit**: `applyEdit(context, from, to, replacement, caret)` — undo/redo, block re-render and scroll-keeping then come free.
- Rows are named by **row index** (0 = header, 1.. = body). mdast drops the delimiter line, so row index *r* is source line *r* for the header and *r + 1* below it.
- A cell boundary is any **unescaped** `|`, including one inside inline code, matching remark-gfm. Rows are **not** padded to the header's column count.
- A line an operation touches is rewritten canonically (`| a | b |`, empty cell `|  |`); untouched lines keep their exact bytes.
- Alignment is **column-level** only: `:---`, `:---:`, `---:` in the delimiter row.
- `@tauri-apps/api/menu` may be imported **only** by `src/ui/table/table_menu.ts`, and only dynamically inside its popup function.

---

### Task 1: The table source model

**Files:**
- Create: `src/ui/markdown/table_source.ts`
- Test: `scripts/check-table-source.mjs`

**Interfaces:**
- Consumes: nothing — pure text in, plain data out.
- Produces:
  ```ts
  type ColumnAlign = 'left' | 'center' | 'right' | null;
  interface TableCellSpan {
    row: number; column: number;
    contentStart: number;   // where the cell's text starts: caret anchor, insert point
    innerStart: number;     // the cell's raw range between its pipes
    innerEnd: number;
  }
  interface TableRow {
    row: number; start: number; end: number; kind: 'header' | 'body';
    values: string[];       // padding trimmed; `x\|y` keeps its backslash
    cells: TableCellSpan[];
  }
  interface TableSource {
    rows: TableRow[];       // 0 = header, 1.. = body
    delimiter: { start: number; end: number };
    columns: number;
    align: ColumnAlign[];
  }
  function readTableSource(text: string, at?: number): TableSource | null;
  function rowAt(source: TableSource, row: number): TableRow | null;
  function locateCell(source: TableSource, offset: number): TableCellSpan | null;
  function cellValue(source: TableSource, text: string, row: number, column: number): string;
  function canonicalLine(values: readonly string[]): string;
  function alignmentMarker(align: ColumnAlign): string;
  ```

- [ ] **Step 1: Write the failing check**

Create `scripts/check-table-source.mjs`, the same shape as `scripts/check-blocks.mjs` (rolldown-bundle the real module, then assert):

```javascript
/**
 * Checks the table source model in Node: how a table's raw slice becomes rows,
 * cell spans and alignment. The model is pure text, so it needs no browser.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/table_source.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-table-'));
const file = join(directory, 'table_source.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { readTableSource, rowAt, locateCell, cellValue, canonicalLine, alignmentMarker } =
  await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const text = ['| A | B |', '| :--- | ---: |', '| 1 |  |', '| x\\|y | z |'].join('\n');
const source = readTableSource(text);

check('columns', source.columns, 2);
check('align', source.align, ['left', 'right']);
check('row kinds', source.rows.map((row) => row.kind), ['header', 'body', 'body']);
check('header values', source.rows[0].values, ['A', 'B']);
check('empty cell value', source.rows[1].values, ['1', '']);
check('escaped pipe stays in the cell', source.rows[2].values, ['x\\|y', 'z']);
check('header cell content start', source.rows[0].cells[0].contentStart, 2);
check('empty cell content start', source.rows[1].cells[1].contentStart, text.indexOf('|  |') + 2);
check('cellValue reads the raw text', cellValue(source, text, 2, 0), 'x\\|y');
check('cellValue of an empty cell', cellValue(source, text, 1, 1), '');
check('rowAt', rowAt(source, 1)?.values, ['1', '']);

check('canonical line', canonicalLine(['a', 'b']), '| a | b |');
check('canonical empty line', canonicalLine(['', '']), '|  |  |');
check('alignment markers', [alignmentMarker('left'), alignmentMarker('center'), alignmentMarker('right'), alignmentMarker(null)],
  [':---', ':---:', '---:', '---']);

const noOuter = readTableSource('a | b\n--- | ---\n1 | 2');
check('no outer pipes', noOuter.rows[0].values, ['a', 'b']);
check('no outer pipes, one cell', readTableSource('just text | more') !== null, false);
check('ragged row keeps its own cells', readTableSource('| a | b |\n| --- | --- |\n| 1 |').rows[1].values, ['1']);
check('not a table', readTableSource('plain text'), null);
check('a quoted table is not modelled', readTableSource('> | a |\n> | --- |\n> | 1 |'), null);
check(
  'locateCell finds the cell an offset sits in',
  locateCell(readTableSource('| a | b |\n| --- | --- |\n| 1 | 2 |'), 30)?.column,
  1
);
check(
  'a table later in the block is found around an offset',
  readTableSource('text\n\n| a |\n| --- |\n| 1 |', 12)?.rows[0].values,
  ['a']
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('table source: all checks passed');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd . && node scripts/check-table-source.mjs`
Expected: FAIL — the bundle of `src/ui/markdown/table_source.ts` cannot be resolved (the module does not exist yet).

- [ ] **Step 3: Write the module**

Create `src/ui/markdown/table_source.ts`. Two rules matter more than the rest and are commented in the code: a table is found *inside* a block (a block may hold a table and other content), and a cell boundary is an unescaped `|`.

```ts
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
 * A table inside a blockquote or a list item is not modelled: those lines
 * carry a marker ("> ", "- ") that would have to be stripped per line first.
 * `readTableSource` returns null for them, so table edits simply do not apply
 * where the model cannot be trusted.
 */

export type ColumnAlign = 'left' | 'center' | 'right' | null;

export interface TableCellSpan {
  row: number;
  column: number;
  contentStart: number;
  innerStart: number;
  innerEnd: number;
}

export interface TableRow {
  row: number;
  start: number;
  end: number;
  kind: 'header' | 'body';
  values: string[];
  cells: TableCellSpan[];
}

export interface TableSource {
  rows: TableRow[];
  delimiter: { start: number; end: number };
  columns: number;
  align: ColumnAlign[];
}

/** One delimiter cell: `---`, `:---`, `:---:` or `---:`. */
const DELIMITER_CELL = /^\s*:?-+:?\s*$/;
/** A list or quote marker in front of a pipe: not a table we model. */
const BLOCK_MARKER = /^\s*(?:>\s*)+$|^\s*(?:[-+*]|\d+[.)])\s+$/;

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

/** Thrown when a line carries a block marker, so the table is not modelled. */
class MarkerError extends Error {}

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
 * The raw ranges between a line's unescaped pipes, in order: the cells
 * `| a | b |` and `a | b` both have two, and `| a | b` has two as well (a
 * missing outer pipe closes nothing, so the text after the last pipe is a cell).
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

/** The line index a table's header sits on, or -1. */
function headerLine(lines: string[], at: number | undefined): number {
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const delimiter = safeRanges(lines[index + 1]);
    if (delimiter.length === 0) {
      continue;
    }
    if (!delimiter.every((range) => DELIMITER_CELL.test(lines[index + 1].slice(range.start, range.end)))) {
      continue;
    }
    if (safeRanges(lines[index]).length === 0) {
      continue;
    }
    if (at !== undefined && index > at) {
      return -1;
    }
    return index;
  }
  return -1;
}

function safeRanges(line: string): Array<{ start: number; end: number }> {
  try {
    return innerRanges(line);
  } catch {
    return [];
  }
}

export function readTableSource(text: string, at?: number): TableSource | null {
  const spans = lineSpans(text);
  const lines = spans.map((span) => text.slice(span.start, span.end));
  const header = headerLine(lines, at === undefined ? undefined : spanOfOffset(spans, at));
  if (header < 0) {
    return null;
  }
  const delimiterRanges = safeRanges(lines[header + 1]);
  const align = delimiterRanges.map((range) => alignOf(lines[header + 1].slice(range.start, range.end)));
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

/** The line index an offset falls on. */
function spanOfOffset(spans: Array<{ start: number; end: number }>, offset: number): number {
  for (let index = 0; index < spans.length; index += 1) {
    if (offset <= spans[index].end) {
      return index;
    }
  }
  return spans.length - 1;
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
```

- [ ] **Step 4: Run the check again**

Run: `cd . && node scripts/check-table-source.mjs`
Expected: `table source: all checks passed`

Iterate on the module until every assertion passes. If a rule turns out wrong (for instance the
`at` hint picking the wrong table), fix the rule rather than the assertion, and note the change
in the commit message.

- [ ] **Step 5: Type-check and commit**

```bash
cd .
npx tsc --noEmit
git add src/ui/markdown/table_source.ts scripts/check-table-source.mjs
git commit -m "feat(editor): add the table source model"
```

### Task 2: The table operations as pure edits

**Files:**
- Create: `src/ui/markdown/table_edits.ts`
- Test: `scripts/check-table-edits.mjs`

**Interfaces:**
- Consumes: `readTableSource`, `rowAt`, `canonicalLine`, `alignmentMarker`, `TableSource`, `TableRow`, `ColumnAlign` from Task 1.
- Produces:
  ```ts
  interface TableEdit { from: number; to: number; replacement: string; }
  function shiftOffset(offset: number, edit: TableEdit): number;
  function insertRow(source, row: number, where: 'above' | 'below'): TableEdit;
  function deleteRow(source, text, row: number): TableEdit | null;
  function clearRow(source, row: number): TableEdit | null;
  function moveRow(source, text, row: number, delta: -1 | 1): TableEdit | null;
  function insertColumn(source, text, column: number, where: 'left' | 'right'): TableEdit;
  function deleteColumn(source, text, column: number): TableEdit | null;
  function clearColumn(source, text, column: number): TableEdit | null;
  function moveColumn(source, text, column: number, delta: -1 | 1): TableEdit | null;
  function alignColumn(source, column: number, align: ColumnAlign): TableEdit | null;
  function clearCell(source, row: number, column: number): TableEdit | null;
  function clearTable(source, text): TableEdit | null;
  function deleteTable(source, text): TableEdit;
  ```
  An operation takes the table's text only when it needs it: the ones that rewrite
  individual lines work from the spans the model already carries.
  A `null` return means "this operation does not apply here" — exactly the state the menu shows as a disabled item.

- [ ] **Step 1: Write the failing check**

Create `scripts/check-table-edits.mjs`:

```javascript
/**
 * Checks every table operation in Node: each one is a single range replacement
 * over the table's raw text, so applying it must produce the expected source.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

async function bundleModule(input) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const directory = mkdtempSync(join(tmpdir(), 'yi-table-edits-'));
  const file = join(directory, `${input.split('/').pop().replace('.ts', '')}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const { readTableSource } = await bundleModule('src/ui/markdown/table_source.ts');
const edits = await bundleModule('src/ui/markdown/table_edits.ts');

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const lines = (...rows) => rows.join('\n');
const applied = (base, edit) =>
  edit === null ? null : base.slice(0, edit.from) + edit.replacement + base.slice(edit.to);
const sourceOf = (text) => readTableSource(text);

const three = lines('| A | B |', '| :--- | --- |', '| 1 | 2 |');
const threeSource = sourceOf(three);

check('insert row below', applied(three, edits.insertRow(threeSource, three, 1, 'below')),
  lines('| A | B |', '| :--- | --- |', '| 1 | 2 |', '|  |  |'));
check('insert row above', applied(three, edits.insertRow(threeSource, three, 1, 'above')),
  lines('| A | B |', '| :--- | --- |', '|  |  |', '| 1 | 2 |'));
check('delete row', applied(three, edits.deleteRow(threeSource, three, 1)),
  lines('| A | B |', '| :--- | --- |'));
check('deleting the header row is refused', edits.deleteRow(threeSource, three, 0), null);
check('clear row', applied(three, edits.clearRow(threeSource, three, 1)),
  lines('| A | B |', '| :--- | --- |', '|  |  |'));
check('clearing a row that is already empty is refused',
  edits.clearRow(sourceOf(lines('| A |', '| --- |', '|  |')), lines('| A |', '| --- |', '|  |'), 1), null);

const four = lines('| A |', '| --- |', '| 1 |', '| 2 |');
const fourSource = sourceOf(four);
check('move row up', applied(four, edits.moveRow(fourSource, four, 2, -1)),
  lines('| A |', '| --- |', '| 2 |', '| 1 |'));
check('move row down', applied(four, edits.moveRow(fourSource, four, 1, 1)),
  lines('| A |', '| --- |', '| 2 |', '| 1 |'));
check('moving a row across the delimiter row is refused', edits.moveRow(fourSource, four, 1, -1), null);
check('moving the last row down is refused', edits.moveRow(fourSource, four, 2, 1), null);

check('insert column left', applied(three, edits.insertColumn(threeSource, three, 0, 'left')),
  lines('|  | A | B |', '| --- | :--- | --- |', '|  | 1 | 2 |'));
check('insert column right', applied(three, edits.insertColumn(threeSource, three, 1, 'right')),
  lines('| A | B |  |', '| :--- | --- | --- |', '| 1 | 2 |  |'));
check('delete column', applied(three, edits.deleteColumn(threeSource, three, 0)),
  lines('| B |', '| --- |', '| 2 |'));
check('deleting the last column is refused',
  edits.deleteColumn(sourceOf(lines('| A |', '| --- |')), lines('| A |', '| --- |'), 0), null);
check('clear column', applied(three, edits.clearColumn(threeSource, three, 1)),
  lines('| A |  |', '| :--- | --- |', '| 1 |  |'));
check('move column right', applied(three, edits.moveColumn(threeSource, three, 0, 1)),
  lines('| B | A |', '| --- | :--- |', '| 2 | 1 |'));
check('moving a column off the left edge is refused', edits.moveColumn(threeSource, three, 0, -1), null);
check('align column right', applied(three, edits.alignColumn(threeSource, three, 1, 'right')),
  lines('| A | B |', '| :--- | ---: |', '| 1 | 2 |'));
check('aligning to the alignment it already has is refused',
  edits.alignColumn(threeSource, three, 0, 'left'), null);
check('clear cell', applied(three, edits.clearCell(threeSource, three, 1, 0)),
  lines('| A | B |', '| :--- | --- |', '|  | 2 |'));
check('clearing an empty cell is refused',
  edits.clearCell(sourceOf(lines('| A |', '| --- |', '|  |')), lines('| A |', '| --- |', '|  |'), 1, 0), null);
check('clear table', applied(three, edits.clearTable(threeSource, three)),
  lines('|  |  |', '| :--- | --- |', '|  |  |'));
check('delete table', applied(three, edits.deleteTable(threeSource, three)), '');

const ragged = lines('| A | B |', '| --- | --- |', '| 1 |');
check('a column op leaves a short row alone',
  applied(ragged, edits.clearColumn(sourceOf(ragged), ragged, 1)),
  lines('| A | B |', '| --- | --- |', '| 1 |'));

check('shiftOffset before the edit', edits.shiftOffset(3, { from: 10, to: 12, replacement: 'x' }), 3);
check('shiftOffset after the edit', edits.shiftOffset(20, { from: 10, to: 12, replacement: 'xxx' }), 21);
check('shiftOffset inside the edit clamps to its start',
  edits.shiftOffset(11, { from: 10, to: 12, replacement: 'xxx' }), 10);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('table edits: all checks passed');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd . && node scripts/check-table-edits.mjs`
Expected: FAIL — `src/ui/markdown/table_edits.ts` cannot be bundled.

- [ ] **Step 3: Write the module**

Create `src/ui/markdown/table_edits.ts`. One shape serves every operation: the table as a
list of source lines (header, delimiter, body) that a transform rewrites, so the untouched
lines are spliced through byte for byte.

```ts
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

/** One of the table's source lines: the delimiter row has no row index. */
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
  return (
    linesOf(source).find((line) => line.row === row) ??
    linesOf(source)[linesOf(source).length - 1]
  );
}

/** A line's cells: the delimiter row's markers, or a row's own values. */
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
function lineEdit(source: TableSource, text: string, row: number, values: readonly string[]): TableEdit {
  const line = lineOf(source, row);
  return { from: line.start, to: line.end, replacement: canonicalLine(values) };
}

/** An empty row of the table's width. */
function emptyValues(source: TableSource): string[] {
  return Array.from({ length: source.columns }, () => '');
}

export function insertRow(
  source: TableSource,
  text: string,
  row: number,
  where: 'above' | 'below'
): TableEdit {
  const line = lineOf(source, row);
  const newLine = canonicalLine(emptyValues(source));
  // The newline goes with the new row, so it lands after the given row whether
  // or not that row is the document's last line.
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

export function clearRow(source: TableSource, text: string, row: number): TableEdit | null {
  const found = rowAt(source, row);
  if (!found || found.values.every((value) => value === '')) {
    return null;
  }
  return lineEdit(source, text, row, emptyValues(source));
}

export function moveRow(
  source: TableSource,
  text: string,
  row: number,
  delta: -1 | 1
): TableEdit | null {
  const target = row + delta;
  if (!rowAt(source, row) || !rowAt(source, target)) {
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
  return rewriteLines(source, text, (line, values) =>
    values.length <= column ? null : canonicalLine(values.filter((_, index) => index !== column))
  );
}

export function clearColumn(source: TableSource, text: string, column: number): TableEdit | null {
  const empty =
    source.rows.every((row) => (row.values[column] ?? '') === '') || column < 0 || column >= source.columns;
  if (empty) {
    return null;
  }
  return rewriteLines(source, text, (line, values) => {
    // A column's alignment is not its cells' content: the delimiter row stays.
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
  return rewriteLines(source, text, (line, values) => {
    if (values.length <= target) {
      return null;
    }
    const moved = values[column];
    values[column] = values[target];
    values[target] = moved;
    return canonicalLine(values);
  });
}

export function alignColumn(
  source: TableSource,
  text: string,
  column: number,
  align: ColumnAlign
): TableEdit | null {
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

export function clearCell(
  source: TableSource,
  text: string,
  row: number,
  column: number
): TableEdit | null {
  const found = rowAt(source, row);
  if (!found || (found.values[column] ?? '') === '') {
    return null;
  }
  const values = [...found.values];
  values[column] = '';
  return lineEdit(source, text, row, values);
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
  // Take one newline with the lines, so a table removed from the middle of a
  // block does not leave a blank line behind.
  return text[last.end] === '\n'
    ? { from: first.start, to: last.end + 1, replacement: '' }
    : { from: Math.max(0, first.start - 1), to: last.end, replacement: '' };
}
```

- [ ] **Step 4: Run the check again**

Run: `cd . && node scripts/check-table-edits.mjs`
Expected: `table edits: all checks passed`

- [ ] **Step 5: Type-check and commit**

```bash
cd .
npx tsc --noEmit
git add src/ui/markdown/table_edits.ts scripts/check-table-edits.mjs
git commit -m "feat(editor): add the pure table operations"
```

### Task 3: The command layer — inserting a table and running an operation

**Files:**
- Create: `src/ui/markdown/editing/table.ts`
- Modify: `src/ui/markdown/markdown_editor.ts` (subscribe to the two table events)
- Test: `scripts/probes/table-insert.js`, `scripts/probes/table-command.js`

**Interfaces:**
- Consumes: `readTableSource`/`rowAt`/`locateCell` (Task 1), the pure operations and `shiftOffset` (Task 2), `applyEdit`/`caretOffset`/`EditorContext` (`editing/context.ts`), `caretLocation` (`position.ts`), `lineSpanAt` (`list_lines.ts`).
- Produces:
  ```ts
  interface TableTarget { lineStart: number; row: number; column: number; }
  type TableCommand =
    | 'insertRowAbove' | 'insertRowBelow' | 'deleteRow' | 'clearRow' | 'moveRowUp' | 'moveRowDown'
    | 'insertColumnLeft' | 'insertColumnRight' | 'deleteColumn' | 'clearColumn'
    | 'moveColumnLeft' | 'moveColumnRight' | 'alignLeft' | 'alignCenter' | 'alignRight'
    | 'clearCell' | 'clearTable' | 'deleteTable';
  const TABLE_INSERT = 'table_insert';     // picker → editor, payload { rows, columns }
  const TABLE_COMMAND = 'table_command';   // menu → editor, payload { target, command }
  function insertTable(context: EditorContext, size: { rows: number; columns: number }): boolean;
  function runTableCommand(context: EditorContext, target: TableTarget, command: TableCommand): boolean;
  function tableSnapshot(context: EditorContext, target: TableTarget):
    { block: MarkdownBlock; source: TableSource; text: string } | null;
  function caretInTableCell(context: EditorContext): boolean;
  function tableDeleteIsNoop(context: EditorContext, forward: boolean): boolean;
  function moveTableCell(context: EditorContext, direction: -1 | 1): boolean;
  ```

- [ ] **Step 1: Write the module**

Create `src/ui/markdown/editing/table.ts`. `insertTable` follows the block rules the editor
already uses: an empty line becomes the table; anywhere else the table is inserted as a block
of its own, with exactly the newlines markdown needs on each side.

```ts
/**
 * Table commands: create a table at the caret, and restructure the table a
 * right-click pointed at.
 *
 * Every command is one `applyEdit`, so a table operation undoes as one step and
 * re-renders only the block it changed. The geometry lives in `table_source.ts`
 * and `table_edits.ts`; this module is the only part that touches the editor.
 */

import type { MarkdownBlock } from '../blocks';
import { lineSpanAt } from '../list_lines';
import { caretLocation } from '../position';
import { readTableSource, rowAt, type TableSource } from '../table_source';
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
} from '../table_edits';
import { applyEdit, caretOffset, type EditorContext } from './context';

export const TABLE_INSERT = 'table_insert';
export const TABLE_COMMAND = 'table_command';

export interface TableTarget {
  lineStart: number;
  row: number;
  column: number;
}

export type TableCommand =
  | 'insertRowAbove' | 'insertRowBelow' | 'deleteRow' | 'clearRow' | 'moveRowUp' | 'moveRowDown'
  | 'insertColumnLeft' | 'insertColumnRight' | 'deleteColumn' | 'clearColumn'
  | 'moveColumnLeft' | 'moveColumnRight' | 'alignLeft' | 'alignCenter' | 'alignRight'
  | 'clearCell' | 'clearTable' | 'deleteTable';

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

/** The markdown of a new table: header, delimiter, then the body rows. */
function tableMarkdown(columns: number, rows: number): string {
  const header = `| ${Array.from({ length: columns }, () => '').join(' | ')} |`;
  const delimiter = `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`;
  return [header, delimiter, ...Array.from({ length: Math.max(0, rows - 1) }, () => header)].join('\n');
}

/**
 * Creates a table at the caret.
 *
 * The picked size counts the header row. An empty paragraph is replaced by the
 * table; anywhere else the paragraph is split and the table becomes a block of
 * its own, with the blank lines markdown needs to keep it from merging into the
 * paragraphs around it.
 */
export function insertTable(context: EditorContext, size: { rows: number; columns: number }): boolean {
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

  const before = /(\n+)$/.exec(text.slice(0, caret))?.[1].length ?? 0;
  const after = /^\n+/.exec(text.slice(caret))?.[0].length ?? 0;
  const leading = '\n'.repeat(Math.max(0, 2 - before));
  const trailing = '\n'.repeat(Math.max(0, 2 - after));
  applyEdit(context, caret, caret, `${leading}${table}${trailing}`, caret + leading.length + firstCell);
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
    case 'insertRowAbove': return insertRow(source, row, 'above');
    case 'insertRowBelow': return insertRow(source, row, 'below');
    case 'deleteRow': return deleteRow(source, text, row);
    case 'clearRow': return clearRow(source, row);
    case 'moveRowUp': return moveRow(source, text, row, -1);
    case 'moveRowDown': return moveRow(source, text, row, 1);
    case 'insertColumnLeft': return insertColumn(source, text, column, 'left');
    case 'insertColumnRight': return insertColumn(source, text, column, 'right');
    case 'deleteColumn': return deleteColumn(source, text, column);
    case 'clearColumn': return clearColumn(source, text, column);
    case 'moveColumnLeft': return moveColumn(source, text, column, -1);
    case 'moveColumnRight': return moveColumn(source, text, column, 1);
    case 'alignLeft': return alignColumn(source, column, 'left');
    case 'alignCenter': return alignColumn(source, column, 'center');
    case 'alignRight': return alignColumn(source, column, 'right');
    case 'clearCell': return clearCell(source, row, column);
    case 'clearTable': return clearTable(source, text);
    case 'deleteTable': return deleteTable(source, text);
    default: return null;
  }
}

/**
 * Runs one table operation on the table the target points at.
 *
 * The caret keeps its place through the edit by the standard rule: text that
 * moved down moves the caret with it, and an edit above the caret shifts it.
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

/** The model and cell the caret currently sits in, or null. */
function caretTable(context: EditorContext): { source: TableSource; block: MarkdownBlock; row: number; column: number } | null {
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
    .find((candidate) => location.blockOffset >= candidate.innerStart && location.blockOffset <= candidate.innerEnd);
  return cell ? { source, block: location.block, row: cell.row, column: cell.column } : null;
}

/** Whether the caret sits inside a table cell. */
export function caretInTableCell(context: EditorContext): boolean {
  return caretTable(context) !== null;
}

/**
 * Whether Backspace/Delete at the caret has nothing to delete *inside its
 * cell*: an empty cell, the start of the first content character, or the end of
 * the last one. Deleting there would eat a pipe or a neighbouring cell, which
 * is never what the author meant.
 */
export function tableDeleteIsNoop(context: EditorContext, forward: boolean): boolean {
  const found = caretTable(context);
  if (!found) {
    return false;
  }
  const location = caretLocation(context.state);
  if (!location) {
    return false;
  }
  const cell = found.source.rows[found.row]?.cells[found.column];
  if (!cell) {
    return false;
  }
  const valueRange = found.block.text.slice(cell.contentStart, cell.innerEnd);
  const content = valueRange.trimEnd();
  if (content === '') {
    return true;
  }
  const contentStart = cell.contentStart;
  const contentEnd = cell.contentStart + content.length;
  return forward ? location.blockOffset >= contentEnd : location.blockOffset <= contentStart;
}

/**
 * Moves the caret to the next (+1) or previous (-1) cell of the table,
 * row-major. Tab in the last cell adds a body row and moves into it; there is
 * nothing to add behind the first cell, so Shift+Tab there stays put.
 */
export function moveTableCell(context: EditorContext, direction: -1 | 1): boolean {
  const found = caretTable(context);
  if (!found) {
    return false;
  }
  const { source, block } = found;
  const flat = source.rows.flatMap((row) => row.cells.map((cell) => ({ row: row.row, column: cell.column })));
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
  const appended = readTableSource(nextText)?.rows[source.rows.length];
  const caret = appended?.cells[0]?.contentStart;
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
  // `restoreCaret` returns false when the block is not mounted; `Tab` then does
  // nothing, which is better than moving the caret somewhere unrelated.
  return restoreCaret(context, block.charStart + cell.contentStart);
}
```

`restoreCaret` comes from `editing/context.ts` — add it to the import list of this module.

- [ ] **Step 2: Wire the two events**

In `src/ui/markdown/markdown_editor.ts`, inside `registerCommandEvents()`, add:

```ts
void eventManager.on(TABLE_INSERT, (event) => {
  const payload = (event.payload ?? event) as { rows?: number; columns?: number };
  if (payload.rows && payload.columns) {
    insertTable(this.context, { rows: payload.rows, columns: payload.columns });
  }
});
void eventManager.on(TABLE_COMMAND, (event) => {
  const payload = (event.payload ?? event) as { target?: TableTarget; command?: TableCommand };
  if (payload.target && payload.command) {
    runTableCommand(this.context, payload.target, payload.command);
  }
});
```

- [ ] **Step 3: Probe the insertion**

Create `scripts/probes/table-insert.js` (one expression):

```javascript
(async () => {
  const t = window.__t;
  const emit = (event, payload) =>
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event, payload });
  const doc = ['First paragraph.', '', '', 'Second paragraph.', ''].join('\n');
  await t.load(doc);
  const blocks = t.blocks();
  // The second block is the empty paragraph between the two paragraphs.
  await t.click(blocks[1]);
  await emit('table_insert', { rows: 3, columns: 2 });
  await t.sleep(300);
  const emptyLine = await t.raw();
  t.report({ emptyLine, caret: t.caretRect() });
  await t.load(doc);
  await t.click(t.textNodesIn(t.blocks()[0]).pop(), 0.99);
  await emit('table_insert', { rows: 2, columns: 3 });
  await t.sleep(300);
  return { emptyLine, midParagraph: await t.raw(), caret: t.caretRect() };
})()
```

Run: `cd . && node scripts/tauri-probe.mjs scripts/probes/table-insert.js`
Expected: `emptyLine` replaces the empty line with
`|  |  |\n| --- | --- |\n|  |  |\n|  |  |`; `midParagraph` splits the first paragraph with a
blank line on both sides of the table; the caret rect sits inside the table's first cell (not at
the viewport's top-left).

- [ ] **Step 4: Probe one operation end to end**

Create `scripts/probes/table-command.js`:

```javascript
(async () => {
  const t = window.__t;
  const emit = (event, payload) =>
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event, payload });
  const doc = ['| A | B |', '| :--- | --- |', '| 1 | 2 |', ''].join('\n');
  await t.load(doc);
  const cell = t.prose().querySelector('[data-table-cell="1:0"]');
  await t.click(cell ?? t.blocks()[0], 0.99);
  const target = { lineStart: 1, row: 1, column: 0 };
  await emit('table_command', { target, command: 'insertRowBelow' });
  await t.sleep(300);
  const insertedRow = await t.raw();
  await emit('table_command', { target, command: 'alignRight' });
  await t.sleep(300);
  const aligned = await t.raw();
  return { insertedRow, aligned, caret: t.caretRect() };
})()
```

Run: `cd . && node scripts/tauri-probe.mjs scripts/probes/table-command.js`
Expected: `insertedRow` gains `|  |  |` after `| 1 | 2 |`; `aligned` writes `---:` into the
delimiter row's first column. (Task 4 adds the cell tags, so until then the click may miss the
cell — the command still runs, because its target is explicit.)

- [ ] **Step 5: Type-check and commit**

```bash
cd .
npx tsc --noEmit
git add src/ui/markdown/editing/table.ts src/ui/markdown/markdown_editor.ts scripts/probes/table-insert.js scripts/probes/table-command.js
git commit -m "feat(editor): add table creation and table commands"
```

### Task 4: Cells as editable lines

**Files:**
- Modify: `src/ui/markdown/nodes/table.ts`, `src/ui/markdown/position.ts`, `src/styles.css`
- Test: `scripts/probes/table-cells.js`, `scripts/probes/table-align.js`

**Interfaces:**
- Consumes: `readTableSource`, `locateCell` (Task 1).
- Produces: every rendered cell carries `data-table-cell="row:column"` and
  `data-table-row-start="<block-relative offset>"`; an empty cell renders a
  `markdown-table-placeholder` span; column alignment renders as `text-align`.

- [ ] **Step 1: Tag cells and give empty cells a line**

Rewrite the cell rendering in `src/ui/markdown/nodes/table.ts`:

```ts
private renderCell(cell: AstTableCell, row: number, column: number): HTMLElement {
  const content = document.createElement('div');
  content.className = 'markdown-table-cell';
  content.dataset.tableCell = `${row}:${column}`;
  const rowStart = (this.node.children[row] as { position?: { start: { offset?: number } } })
    .position?.start.offset;
  if (rowStart !== undefined) {
    content.dataset.tableRowStart = String(rowStart);
  }
  if (cell.children.length === 0) {
    const placeholder = document.createElement('span');
    placeholder.className = 'markdown-table-placeholder markdown-node';
    placeholder.textContent = '\u00a0';
    content.appendChild(placeholder);
  }
  appendChildren(content, cell.children);
  const align = this.node.align?.[column] ?? null;
  if (align) {
    content.style.textAlign = align;
  }
  return content;
}
```

`renderCell` is called for the header (`row = 0`) and for each body row (`row = rowIndex`), and
`data-table-cell` goes on the `div` that holds the cell's content — the same element the caret
and the right-click both resolve through. Add to `src/styles.css`:

```css
.markdown-table-placeholder {
  display: inline-block;
  min-width: 0.5em;
}
```

- [ ] **Step 2: Map the caret through a cell, both ways**

In `src/ui/markdown/position.ts`, add a table branch to `documentOffsetAt` (before the
`[data-text-from]` branch) and one to `domPositionAtOffset` (before the rendered-offset
fallback):

```ts
// documentOffsetAt, inside the text-node branch:
const tablePlaceholder = containerNode.parentElement?.closest<HTMLElement>('.markdown-table-placeholder');
const cellElement = tablePlaceholder?.closest<HTMLElement>('[data-table-cell]') ?? null;
if (tablePlaceholder && cellElement) {
  const blockElement = cellElement.closest('.markdown-block') as HTMLElement | null;
  const block = blockElement ? state.getBlockAtLine(Number(blockElement.dataset.lineStart)) : null;
  const hint = Number(cellElement.dataset.tableRowStart);
  const [row, column] = (cellElement.dataset.tableCell ?? '').split(':').map(Number);
  const source = block ? readTableSource(block.text, Number.isFinite(hint) ? hint : undefined) : null;
  const span = source?.rows[row]?.cells[column];
  if (block && span) {
    return { block, offset: block.charStart + span.contentStart, blockOffset: span.contentStart };
  }
}

// domPositionAtOffset, after the block element is found:
const blockOffset = clamped - block.charStart;
const source = readTableSource(block.text, blockOffset);
if (source) {
  const cell = locateCell(source, blockOffset);
  const element = cell
    ? blockElement.querySelector<HTMLElement>(`[data-table-cell="${cell.row}:${cell.column}"]`)
    : null;
  const textSpan = element?.querySelector<HTMLElement>('[data-text-from]') ?? null;
  const node = textSpan?.firstChild ?? element?.querySelector('.markdown-table-placeholder')?.firstChild;
  if (element && node && node.nodeType === Node.TEXT_NODE) {
    const from = textSpan ? block.charStart + Number(textSpan.dataset.textFrom) : cell!.contentStart + block.charStart;
    return { node, offset: Math.max(0, Math.min(clamped - from, (node as Text).data.length)) };
  }
}
```

- [ ] **Step 3: Probe the cells**

Create `scripts/probes/table-cells.js`:

```javascript
(async () => {
  const t = window.__t;
  const doc = ['| A | B |', '| --- | --- |', '| 1 |  |', ''].join('\n');
  await t.load(doc);
  const empty = t.prose().querySelector('[data-table-cell="1:1"]');
  await t.click(empty ?? t.blocks()[0]);
  const caret = t.caretRect();
  t.report({ caret, cellRect: empty ? t.rectOf(empty) : null });
  t.key('x');
  await t.sleep(300);
  return { raw: await t.raw(), caret, cellRect: empty ? t.rectOf(empty) : null };
})()
```

Run: `cd . && node scripts/tauri-probe.mjs scripts/probes/table-cells.js`
Expected: the caret rect sits inside the empty cell's rect (not at the viewport's top-left), and
the raw text becomes `| 1 | x |` — the typed character lands in the clicked cell.

- [ ] **Step 4: Probe the alignment rendering**

Create `scripts/probes/table-align.js`:

```javascript
(async () => {
  const t = window.__t;
  await t.load(['| A | B |', '| :--- | ---: |', '| 1 | 2 |', ''].join('\n'));
  const align = (selector) => getComputedStyle(t.prose().querySelector(selector)).textAlign;
  return {
    headerLeft: align('[data-table-cell="0:0"]'),
    headerRight: align('[data-table-cell="0:1"]'),
    bodyRight: align('[data-table-cell="1:1"]')
  };
})()
```

Run: `cd . && node scripts/tauri-probe.mjs scripts/probes/table-align.js`
Expected: `headerLeft: "left"`, `headerRight: "right"`, `bodyRight: "right"` (today all three are
`"start"` or `"left"`, which is the bug this step fixes).

- [ ] **Step 5: Type-check and commit**

```bash
cd .
npx tsc --noEmit
git add src/ui/markdown/nodes/table.ts src/ui/markdown/position.ts src/styles.css scripts/probes/table-cells.js scripts/probes/table-align.js
git commit -m "feat(editor): render table cells as editable lines"
```

### Task 5: Keys inside a cell

**Files:**
- Modify: `src/ui/markdown/editing/text_commands.ts`, `src/ui/markdown/markdown_editor.ts`
- Test: `scripts/probes/table-keys.js`

**Interfaces:**
- Consumes: `tableDeleteIsNoop`, `caretInTableCell`, `moveTableCell` (Task 3).
- Produces: no new interface — the key rules the spec fixes.

- [ ] **Step 1: Guard the deleting keys**

In `src/ui/markdown/editing/text_commands.ts`, inside `deleteText`, right after `let { from, to } = offsets;`
and before `deleteBlankItem`:

```ts
// A caret in a table cell deletes inside its own cell only: at the cell's
// edges there is nothing to delete that belongs to the cell, and deleting the
// pipe or the neighbouring cell is never what the author meant.
if (from === to && tableDeleteIsNoop(context, forward)) {
  return true;
}
```

And in `insertNewline`, after the offsets are known and before the block rules:

```ts
// Enter in a table cell would split the row and shred the table; a cell holds
// text, not lines.
if (caretInTableCell(context)) {
  return true;
}
```

Add the two names to the module's import from `./table`.

- [ ] **Step 2: Tab moves between cells**

In `src/ui/markdown/markdown_editor.ts`, in `handleKeydown`, before the arrow-key fallback:

```ts
if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
  if (moveTableCell(this.context, event.shiftKey ? -1 : 1)) {
    event.preventDefault();
  }
  return;
}
```

- [ ] **Step 3: Probe the keys**

Create `scripts/probes/table-keys.js`:

```javascript
(async () => {
  const t = window.__t;
  const keyWith = (name, shift = false) =>
    t.scroller().dispatchEvent(
      new KeyboardEvent('keydown', { key: name, shiftKey: shift, bubbles: true, cancelable: true })
    );
  const steps = {};
  await t.load(['| A | B |', '| --- | --- |', '| 1 |  |', ''].join('\n'));

  await t.click(t.prose().querySelector('[data-table-cell="1:1"]'));
  const caretBefore = t.caretRect();
  keyWith('Delete');
  keyWith('Backspace');
  await t.sleep(200);
  steps.emptyCellDelete = { raw: await t.raw(), caret: t.caretRect(), caretBefore };

  await t.click(t.prose().querySelector('[data-table-cell="1:0"]'), 0.99);
  keyWith('Backspace');
  await t.sleep(200);
  steps.deletingInsideACell = await t.raw();

  await t.click(t.prose().querySelector('[data-table-cell="0:0"]'), 0.99);
  keyWith('Enter');
  await t.sleep(200);
  steps.enterInACell = await t.raw();

  keyWith('Tab');
  await t.sleep(150);
  steps.afterTab = t.caretRect();
  const cellRect = (selector) => t.rectOf(t.prose().querySelector(selector));
  steps.secondCell = cellRect('[data-table-cell="0:1"]');

  await t.click(t.prose().querySelector('[data-table-cell="1:1"]'));
  keyWith('Tab');
  await t.sleep(300);
  steps.tabInTheLastCell = { raw: await t.raw(), caret: t.caretRect() };
  keyWith('Tab', true);
  await t.sleep(200);
  steps.afterShiftTab = t.caretRect();
  return steps;
})()
```

Run: `cd . && node scripts/tauri-probe.mjs scripts/probes/table-keys.js`
Expected:
- `emptyCellDelete.raw` is unchanged and the caret rect equals `caretBefore` (the reported bug);
- `deletingInsideACell` shows `|  | B |` (one character gone);
- `enterInACell` is unchanged;
- `afterTab` matches `secondCell` (the caret moved one cell right);
- `tabInTheLastCell.raw` gains a `|  |  |` line under the last row;
- `afterShiftTab` is back in the previous cell.

- [ ] **Step 4: Type-check and commit**

```bash
cd .
npx tsc --noEmit
git add src/ui/markdown/editing/text_commands.ts src/ui/markdown/markdown_editor.ts scripts/probes/table-keys.js
git commit -m "feat(editor): keep table cells intact while typing and deleting"
```

### Task 6: The picker and its titlebar button

**Files:**
- Create: `src/ui/table/table_picker.ts`, `src/ui/table/table_toolbar.ts`
- Modify: `src/main.ts`
- Test: `scripts/probes/table-picker.js`

**Interfaces:**
- Consumes: `BaseComponent` (`ui/component.ts`), `eventManager` (`services/event_manager.ts`), the `TABLE_INSERT` event and payload shape from Task 3.
- Produces: `class TableToolbar extends BaseComponent` — the titlebar-centre button that owns the picker; `class TablePicker extends BaseComponent` with `open()`, `close()`, `isOpen()`.

- [ ] **Step 1: Write the picker**

Create `src/ui/table/table_picker.ts`:

```ts
import { BaseComponent } from '../component';

/**
 * The 10 × 10 table chooser: hovering a square highlights every square up to
 * it and labels the size, and clicking picks it. The panel closes on Esc, on a
 * click outside, and after a pick.
 */
export class TablePicker extends BaseComponent {
  private readonly label: HTMLSpanElement;
  private readonly squares: HTMLButtonElement[] = [];
  private selected = { rows: 1, columns: 1 };

  constructor(private readonly onPick: (size: { rows: number; columns: number }) => void) {
    super('div', [
      'hidden', 'absolute', 'top-full', 'left-1/2', '-translate-x-1/2', 'mt-1', 'z-50',
      'rounded-lg', 'border', 'border-base-300', 'bg-base-200', 'p-2', 'shadow-lg', 'select-none'
    ]);
    this.label = document.createElement('span');
    this.label.className = 'mb-1 block text-center text-xs opacity-70';
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-10 gap-px';
    for (let row = 1; row <= 10; row += 1) {
      for (let column = 1; column <= 10; column += 1) {
        const square = document.createElement('button');
        square.type = 'button';
        square.className = 'size-4 rounded-[2px] bg-base-content/15';
        square.dataset.row = String(row);
        square.dataset.column = String(column);
        // The titlebar starts a window drag on any mousedown inside it.
        square.addEventListener('mousedown', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        square.addEventListener('mouseenter', () => this.highlight(row, column));
        square.addEventListener('click', () => {
          this.close();
          this.onPick({ rows: row, columns: column });
        });
        this.squares.push(square);
        grid.appendChild(square);
      }
    }
    this.element.append(this.label, grid);
    this.highlight(1, 1);
    document.addEventListener('mousedown', (event) => {
      if (this.isOpen() && !this.element.contains(event.target as Node)) {
        this.close();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  isOpen(): boolean {
    return !this.element.classList.contains('hidden');
  }

  open(): void {
    this.element.classList.remove('hidden');
  }

  close(): void {
    this.element.classList.add('hidden');
  }

  /** Highlights every square up to (row, column), the way a chooser reads. */
  private highlight(row: number, column: number): void {
    this.selected = { rows: row, columns: column };
    this.label.textContent = `${column} × ${row}`;
    for (const square of this.squares) {
      const active =
        Number(square.dataset.row) <= row && Number(square.dataset.column) <= column;
      square.classList.toggle('bg-primary', active);
      square.classList.toggle('bg-base-content/15', !active);
    }
  }
}
```

Create `src/ui/table/table_toolbar.ts`:

```ts
import { BaseComponent } from '../component';
import { eventManager } from '../../services/event_manager';
import { TABLE_INSERT } from '../markdown/editing/table';
import { TablePicker } from './table_picker';

/** Table grid icon, sized like the formatting icons. */
const TABLE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
  '<path d="M0 0h24v24H0z" fill="none" />' +
  '<path fill="currentColor" d="M3 3h18v18H3zm2 2v4h14V5zm0 6v4h6v-4zm8 0v4h6v-4zm-8 6v2h6v-2zm8 0v2h6v-2z" />' +
  '</svg>';

/** The create-table button and the picker it opens, at the titlebar's centre. */
export class TableToolbar extends BaseComponent {
  private readonly picker: TablePicker;

  constructor() {
    super('div', ['relative', 'flex', 'items-center']);
    const button = document.createElement('button');
    button.className = 'btn btn-ghost btn-xs';
    button.title = 'Insert table';
    button.setAttribute('aria-label', 'Insert table');
    button.innerHTML = TABLE_ICON;
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', () => {
      if (this.picker.isOpen()) {
        this.picker.close();
      } else {
        this.picker.open();
      }
    });
    this.picker = new TablePicker((size) => {
      void eventManager.emit(TABLE_INSERT, size);
    });
    this.element.append(button, this.picker.element);
  }
}
```

- [ ] **Step 2: Mount it in the titlebar**

In `src/main.ts`, import `TableToolbar` and add it to the centre group after the formatting
toolbar:

```ts
const tableToolbar = new TableToolbar();
titleBar.addComponent(formattingToolbar, 'center');
titleBar.addComponent(tableToolbar, 'center');
```

- [ ] **Step 3: Probe the picker**

Create `scripts/probes/table-picker.js`:

```javascript
(async () => {
  const t = window.__t;
  const button = [...document.querySelectorAll('.titlebar button, .btn-ghost')].find(
    (element) => element.getAttribute('aria-label') === 'Insert table'
  );
  await t.load(['First paragraph.', '', ''].join('\n'));
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  button.click();
  await t.sleep(150);
  const panel = document.querySelector('.grid-cols-10')?.parentElement ?? null;
  const square = (row, column) =>
    panel?.querySelector(`button[data-row="${row}"][data-column="${column}"]`) ?? null;
  square(3, 4)?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await t.sleep(150);
  const label = panel?.querySelector('span')?.textContent ?? null;
  const highlighted = panel
    ? [...panel.querySelectorAll('button')].filter((element) => element.className.includes('bg-primary')).length
    : null;
  square(3, 4)?.click();
  await t.sleep(350);
  return { label, highlighted, raw: await t.raw(), panelOpen: panel?.className.includes('hidden') === false };
})()
```

Run: `cd . && node scripts/tauri-probe.mjs scripts/probes/table-picker.js`
Expected: `label` is `"4 × 3"`, `highlighted` is `12`, `raw` contains four table lines (a header, a
delimiter and two body rows of four cells), and `panelOpen` is false.

- [ ] **Step 4: Type-check and commit**

```bash
cd .
npx tsc --noEmit
git add src/ui/table/table_picker.ts src/ui/table/table_toolbar.ts src/main.ts scripts/probes/table-picker.js
git commit -m "feat(ui): add the create-table picker to the titlebar"
```

### Task 7: The native context menu

**Files:**
- Create: `src/ui/table/table_menu_model.ts`, `src/ui/table/table_menu.ts`, `scripts/check-table-menu.mjs`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Test: `scripts/probes/table-menu.js`

**Interfaces:**
- Consumes: `TableSource`, `rowAt` (Task 1); `TableCommand`, `TableTarget`, `TABLE_COMMAND`, `tableSnapshot` (Task 3).
- Produces:
  ```ts
  type TableMenuNode =
    | { kind: 'submenu'; label: string; items: TableMenuNode[] }
    | { kind: 'item'; id: string; label: string; enabled: boolean; command?: TableCommand }
    | { kind: 'separator' };
  function tableMenuModel(source: TableSource, row: number, column: number): TableMenuNode[];
  function showTableMenu(nodes: TableMenuNode[], target: TableTarget, at: { x: number; y: number }): Promise<void>;
  ```

- [ ] **Step 1: Write the failing menu-model check**

Create `scripts/check-table-menu.mjs` (same rolldown harness as Task 2; bundle
`src/ui/markdown/table_source.ts` and `src/ui/table/table_menu_model.ts`):

```javascript
const flat = (nodes) =>
  nodes.flatMap((node) => (node.kind === 'submenu' ? flat(node.items) : node.kind === 'item' ? [node] : []));
const byId = (nodes, id) => flat(nodes).find((node) => node.id === id) ?? null;

const twoColumns = readTableSource(['| A | B |', '| :--- | --- |', '| 1 | 2 |'].join('\n'));
const headerCell = tableMenuModel(twoColumns, 0, 0);
const bodyCell = tableMenuModel(twoColumns, 1, 0);
const oneColumn = readTableSource(['| A |', '| --- |', '|  |'].join('\n'));

check('the menu has the row and column groups', headerCell.slice(0, 2).map((node) => node.label),
  ['Row', 'Column']);
check('delete row is disabled in the header', byId(headerCell, 'row-delete').enabled, false);
check('delete row is enabled in the body', byId(bodyCell, 'row-delete').enabled, true);
check('moving the first body row up is disabled', byId(bodyCell, 'row-up').enabled, false);
check('moving a row down is enabled', byId(bodyCell, 'row-down').enabled, true);
check('delete column is disabled in a one-column table', byId(tableMenuModel(oneColumn, 1, 0), 'column-delete').enabled, false);
check('clear cell is disabled in an empty cell', byId(tableMenuModel(oneColumn, 1, 0), 'clear-cell').enabled, false);
check('clear table is disabled in an empty table', byId(tableMenuModel(oneColumn, 1, 0), 'clear-table').enabled, false);
check('clear cell is enabled in a filled cell', byId(bodyCell, 'clear-cell').enabled, true);
check('delete table is always enabled', byId(headerCell, 'delete-table').enabled, true);
check('align items carry their command', flat(headerCell).filter((node) => node.id.startsWith('align-')).map((node) => node.command),
  ['alignLeft', 'alignCenter', 'alignRight']);
check('every item has a label', flat(headerCell).every((node) => node.label.length > 0), true);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd . && node scripts/check-table-menu.mjs`
Expected: FAIL — `src/ui/table/table_menu_model.ts` cannot be bundled.

- [ ] **Step 3: Write the model**

Create `src/ui/table/table_menu_model.ts` — the item tree, pure and assertable. The disabled
rules are exactly the ones the spec lists, and they come from the same source model the
operations use, so an item is never disabled while its operation would work:

```ts
import { rowAt, type TableSource } from '../markdown/table_source';
import type { TableCommand } from '../markdown/editing/table';

export type TableMenuNode =
  | { kind: 'submenu'; label: string; items: TableMenuNode[] }
  | { kind: 'item'; id: string; label: string; enabled: boolean; command?: TableCommand }
  | { kind: 'separator' };

/** The context menu for one cell: what can be done to its row, its column and itself. */
export function tableMenuModel(source: TableSource, row: number, column: number): TableMenuNode[] {
  const rows = source.rows;
  const lastRow = rows[rows.length - 1].row;
  const values = rowAt(source, row)?.values ?? [];
  const inBody = row > 0;
  const rowEmpty = (rowAt(source, row)?.values ?? []).every((value) => value === '');
  const columnEmpty = rows.every((candidate) => (candidate.values[column] ?? '') === '');
  const tableEmpty = rows.every((candidate) => candidate.values.every((value) => value === ''));
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
    item('clear-cell', 'Clear Cell', (values[column] ?? '') !== '', 'clearCell'),
    item('clear-table', 'Clear Table', !tableEmpty, 'clearTable'),
    item('delete-table', 'Delete Table', true, 'deleteTable')
  ];
}
```

- [ ] **Step 4: Run the check again**

Run: `cd . && node scripts/check-table-menu.mjs`
Expected: `table menu: all checks passed`

- [ ] **Step 5: Pop the menu up**

Create `src/ui/table/table_menu.ts` — the only module that knows Tauri exists, and only inside
the function:

```ts
import { eventManager } from '../../services/event_manager';
import { TABLE_COMMAND, type TableCommand, type TableTarget } from '../markdown/editing/table';
import type { TableMenuNode } from './table_menu_model';

/**
 * Shows the native context menu for a captured table target.
 *
 * The menu is rebuilt for every right-click, so its items are always enabled
 * exactly as the table currently is. Choosing an item emits `TABLE_COMMAND`
 * with the *captured* target: a native menu can move focus (and with it the
 * caret), so the command must never read the caret to find out what it acts on.
 */
export async function showTableMenu(
  nodes: TableMenuNode[],
  target: TableTarget,
  at: { x: number; y: number }
): Promise<void> {
  const { Menu, LogicalPosition } = await import('@tauri-apps/api/menu');
  const menu = await Menu.new({ items: nodes.map((node) => toOption(node, target)) });
  await menu.popup(new LogicalPosition(at.x, at.y));
}

type MenuOption = {
  id?: string;
  text?: string;
  enabled?: boolean;
  action?: () => void;
  items?: MenuOption[];
  item?: string;
};

function toOption(node: TableMenuNode, target: TableTarget): MenuOption {
  if (node.kind === 'separator') {
    return { item: 'Separator' };
  }
  if (node.kind === 'submenu') {
    return { text: node.label, items: node.items.map((child) => toOption(child, target)) };
  }
  const command: TableCommand = node.command ?? 'clearCell';
  return {
    id: node.id,
    text: node.label,
    enabled: node.enabled,
    action: () => {
      void eventManager.emit(TABLE_COMMAND, { target, command });
    }
  };
}
```

The plain-object form is what the installed API expects: `newMenu` in
`node_modules/@tauri-apps/api/menu/base.js` walks `items` recursively and turns each leaf's
`action` into a `Channel` (`injectChannel`), so `{ id, text, enabled, action }` and
`{ text, items }` are accepted directly. If the runtime ever rejects them, build the items with
`MenuItem.new` / `Submenu.new` / `PredefinedMenuItem.new` and pass those instances to
`Menu.new({ items })`.

- [ ] **Step 6: Handle the right-click**

In `src/ui/markdown/markdown_editor.ts`, register the listener next to the other content
listeners and add the handler:

```ts
this.contentView.addEventListener('contextmenu', (event) => this.handleContextMenu(event));

/** A right-click inside a table cell opens the table's menu on that cell. */
private handleContextMenu(event: MouseEvent): void {
  const cell = (event.target as Element | null)?.closest<HTMLElement>('[data-table-cell]') ?? null;
  if (!cell) {
    return;
  }
  // The webview has its own context menu; ours replaces it.
  event.preventDefault();
  const blockElement = cell.closest('.markdown-block') as HTMLElement | null;
  const lineStart = Number(blockElement?.dataset.lineStart);
  const [row, column] = (cell.dataset.tableCell ?? '').split(':').map(Number);
  if (!Number.isFinite(lineStart) || !Number.isFinite(row) || !Number.isFinite(column)) {
    return;
  }
  const target: TableTarget = { lineStart, row, column };
  const snapshot = tableSnapshot(this.context, target);
  if (!snapshot) {
    return;
  }
  void showTableMenu(tableMenuModel(snapshot.source, row, column), target, {
    x: event.clientX,
    y: event.clientY
  });
}
```

- [ ] **Step 7: Probe the right-click**

Create `scripts/probes/table-menu.js`:

```javascript
(async () => {
  const t = window.__t;
  await t.load(['| A | B |', '| --- | --- |', '| 1 | 2 |', ''].join('\n'));
  const cell = t.prose().querySelector('[data-table-cell="1:1"]');
  const rect = cell.getBoundingClientRect();
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2)
  });
  cell.dispatchEvent(event);
  await t.sleep(400);
  return {
    prevented: event.defaultPrevented,
    // Dispatching a contextmenu outside a cell must be left to the webview.
    outsidePrevented: (() => {
      const outside = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      t.blocks()[0].dispatchEvent(outside);
      return outside.defaultPrevented;
    })()
  };
})()
```

Run: `cd . && node scripts/tauri-probe.mjs scripts/probes/table-menu.js`
Expected: `prevented: true`, `outsidePrevented: false`.

Then take a screenshot with the MCP bridge's screenshot tool while the menu is open, and check
by eye that the Tauri menu is the only one shown and that it lands on the cell that was
right-clicked. This is the one part of the feature a probe cannot assert.

- [ ] **Step 8: Type-check and commit**

```bash
cd .
npx tsc --noEmit
git add src/ui/table/table_menu_model.ts src/ui/table/table_menu.ts src/ui/markdown/markdown_editor.ts scripts/check-table-menu.mjs scripts/probes/table-menu.js
git commit -m "feat(ui): add the native table context menu"
```

### Task 8: End-to-end verification and cleanup

**Files:**
- Test: `scripts/probes/table-e2e.js`
- Modify: `docs/superpowers/specs/2026-09-17-table-creation-and-editing-design.md` (only if behaviour changed)

**Interfaces:**
- Consumes: everything above.
- Produces: no new interface — evidence that the feature works and nothing else moved.

- [ ] **Step 1: Probe the whole flow, including undo and redo**

Create `scripts/probes/table-e2e.js`:

```javascript
(async () => {
  const t = window.__t;
  const emit = (event, payload) =>
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event, payload });
  const button = [...document.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === 'Insert table'
  );
  const steps = [];
  await t.load(['Intro paragraph.', '', ''].join('\n'));
  t.click(t.blocks()[0], 0.99);
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  button.click();
  await t.sleep(150);
  const square = document.querySelector('button[data-row="3"][data-column="2"]');
  square.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  square.click();
  await t.sleep(350);
  steps.created = await t.raw();

  const target = { lineStart: 3, row: 1, column: 1 };
  for (const command of ['insertRowBelow', 'insertColumnRight', 'clearCell', 'moveColumnLeft', 'alignCenter', 'deleteRow']) {
    await emit('table_command', { target, command });
    await t.sleep(250);
    steps[command] = await t.raw();
  }
  for (let step = 0; step < 6; step += 1) {
    await emit('undo', null);
    await t.sleep(200);
  }
  steps.afterUndo = await t.raw();
  for (let step = 0; step < 6; step += 1) {
    await emit('redo', null);
    await t.sleep(200);
  }
  steps.afterRedo = await t.raw();
  steps.blockCount = window.__t.blocks().length;
  return steps;
})()
```

Run: `cd . && node scripts/tauri-probe.mjs scripts/probes/table-e2e.js`
Expected: `created` is the 3 × 2 table split into its own block; each command changes exactly the
rows/columns it names; `afterUndo` equals the document before the commands and `afterRedo` equals
the document after them.

- [ ] **Step 2: Run every check and the regression probes**

```bash
cd .
npx tsc --noEmit
node scripts/check-table-source.mjs
node scripts/check-table-edits.mjs
node scripts/check-table-menu.mjs
node scripts/check-blocks.mjs
node scripts/check-enter.mjs
node scripts/tauri-probe.mjs scripts/probes/regression-arrows.js
node scripts/tauri-probe.mjs scripts/probes/regression-list.js
node scripts/tauri-probe.mjs scripts/probes/regression-undo.js
node scripts/tauri-probe.mjs scripts/probes/empty-line-delete.js
node scripts/tauri-probe.mjs scripts/probes/enter-smoke.js
```

Expected: every check prints its pass line; the regression probes report the same values they
reported before this feature (compare with `git stash` output if a value looks different).

- [ ] **Step 3: Confirm the boundaries held**

```bash
cd .
rg -n "@tauri-apps/api/menu" src/
rg -n "data-table-cell|markdown-table-placeholder" src/ | wc -l
```

Expected: `@tauri-apps/api/menu` appears only in `src/ui/table/table_menu.ts`, and the table's DOM
contract appears in the table node, the position mapper and the editor's context-menu handler —
nowhere else.

- [ ] **Step 4: Clean up and commit**

Remove any dead code the tasks left behind (an unused import, a helper the final shape did not
need), keep the module comments accurate, and if any behaviour ended up different from the spec,
update the spec first and commit it separately:

```bash
cd .
git add -A
git commit -m "test(editor): verify table creation and editing end to end"
```
