/**
 * Checks every table operation in Node: each one is a single range replacement
 * over the table's raw text, so applying it must produce the expected source.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

async function bundleModule(input) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const directory = mkdtempSync(join(tmpdir(), 'yi-table-edits-'));
  const file = join(directory, `${input.split('/').pop().replace('.ts', '')}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(pathToFileURL(file).href);
}

const { readTableSource } = await bundleModule('src/ui/markdown/syntax/table/source.ts');
const edits = await bundleModule('src/ui/markdown/syntax/table/edits.ts');

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

check('insert row below', applied(three, edits.insertRow(threeSource, 1, 'below')),
  lines('| A | B |', '| :--- | --- |', '| 1 | 2 |', '|  |  |'));
check('insert row above', applied(three, edits.insertRow(threeSource, 1, 'above')),
  lines('| A | B |', '| :--- | --- |', '|  |  |', '| 1 | 2 |'));
check('delete row', applied(three, edits.deleteRow(threeSource, three, 1)),
  lines('| A | B |', '| :--- | --- |'));
check('deleting the header row is refused', edits.deleteRow(threeSource, three, 0), null);
check('clear row', applied(three, edits.clearRow(threeSource, 1)),
  lines('| A | B |', '| :--- | --- |', '|  |  |'));
check('clearing a row that is already empty is refused',
  edits.clearRow(sourceOf(lines('| A |', '| --- |', '|  |')), 1), null);

const four = lines('| A |', '| --- |', '| 1 |', '| 2 |');
const fourSource = sourceOf(four);
check('move row up', applied(four, edits.moveRow(fourSource, four, 2, -1)),
  lines('| A |', '| --- |', '| 2 |', '| 1 |'));
check('move row down', applied(four, edits.moveRow(fourSource, four, 1, 1)),
  lines('| A |', '| --- |', '| 2 |', '| 1 |'));
check('moving a row across the delimiter row is refused', edits.moveRow(fourSource, four, 1, -1), null);
check('moving the header row is refused', edits.moveRow(fourSource, four, 0, 1), null);
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
check('clearing a column that is already empty is refused',
  edits.clearColumn(sourceOf(lines('|  |', '| --- |', '|  |')), lines('|  |', '| --- |', '|  |'), 0), null);
check('move column right', applied(three, edits.moveColumn(threeSource, three, 0, 1)),
  lines('| B | A |', '| --- | :--- |', '| 2 | 1 |'));
check('moving a column off the left edge is refused', edits.moveColumn(threeSource, three, 0, -1), null);
check('align column right', applied(three, edits.alignColumn(threeSource, 1, 'right')),
  lines('| A | B |', '| :--- | ---: |', '| 1 | 2 |'));
check('aligning to the alignment it already has is refused',
  edits.alignColumn(threeSource, 0, 'left'), null);
check('clear cell', applied(three, edits.clearCell(threeSource, 1, 0)),
  lines('| A | B |', '| :--- | --- |', '|  | 2 |'));
check('clearing an empty cell is refused',
  edits.clearCell(sourceOf(lines('| A |', '| --- |', '|  |')), 1, 0), null);
check('clear table', applied(three, edits.clearTable(threeSource, three)),
  lines('|  |  |', '| :--- | --- |', '|  |  |'));
check('delete table', applied(three, edits.deleteTable(threeSource, three)), '');

const ragged = lines('| A | B |', '| --- | --- |', '| 1 |');
check('clearing a column leaves a short row alone',
  applied(ragged, edits.clearColumn(sourceOf(ragged), ragged, 1)),
  lines('| A |  |', '| --- | --- |', '| 1 |'));
check('an inserted column pads a short row',
  applied(ragged, edits.insertColumn(sourceOf(ragged), ragged, 1, 'right')),
  lines('| A | B |  |', '| --- | --- | --- |', '| 1 |  |  |'));

check('shiftOffset before the edit', edits.shiftOffset(3, { from: 10, to: 12, replacement: 'x' }), 3);
check('shiftOffset after the edit', edits.shiftOffset(20, { from: 10, to: 12, replacement: 'xxx' }), 21);
check('shiftOffset inside the edit clamps to its start',
  edits.shiftOffset(11, { from: 10, to: 12, replacement: 'xxx' }), 10);
check('shiftRangeEnd includes text inserted at the range end',
  edits.shiftRangeEnd(12, { from: 12, to: 12, replacement: 'abc' }), 15);
check('shiftRangeEnd moves with an edit beyond the range',
  edits.shiftRangeEnd(8, { from: 12, to: 12, replacement: 'abc' }), 8);
check('shiftRangeEnd ends at the replacement when the edit overlaps it',
  edits.shiftRangeEnd(12, { from: 10, to: 12, replacement: 'x' }), 11);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('table edits: all checks passed');
