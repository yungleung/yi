/**
 * Checks the table context menu's shape in Node: the groups, the order, and
 * exactly which items are disabled for a header cell, a body cell, a
 * one-column table and an empty one.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

async function bundleModule(input) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const directory = mkdtempSync(join(tmpdir(), 'yi-table-menu-'));
  const file = join(directory, `${input.split('/').pop().replace('.ts', '')}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const { readTableSource } = await bundleModule('src/ui/markdown/syntax/table/source.ts');
const { tableMenuModel } = await bundleModule('src/ui/table/model.ts');

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const flat = (nodes) =>
  nodes.flatMap((node) =>
    node.kind === 'submenu' ? flat(node.items) : node.kind === 'item' ? [node] : []
  );
const byId = (nodes, id) => flat(nodes).find((node) => node.id === id) ?? null;
const lines = (...rows) => rows.join('\n');

const twoColumns = readTableSource(lines('| A | B |', '| :--- | --- |', '| 1 | 2 |'));
const threeRows = readTableSource(lines('| A | B |', '| :--- | --- |', '| 1 | 2 |', '| 3 | 4 |'));
const headerCell = tableMenuModel(twoColumns, 0, 0);
const bodyCell = tableMenuModel(twoColumns, 1, 0);
const middleRow = tableMenuModel(threeRows, 1, 0);
const oneEmptyColumn = readTableSource(lines('|  |', '| --- |', '|  |'));
const oneColumnMenu = tableMenuModel(oneEmptyColumn, 1, 0);
const ragged = tableMenuModel(readTableSource(lines('| A | B |', '| --- | --- |', '| 1 |')), 1, 1);

check('the menu groups rows before columns', headerCell.slice(0, 2).map((node) => node.label), [
  'Row',
  'Column'
]);
check('the column group ends with alignment',
  headerCell[1].items[headerCell[1].items.length - 1].label, 'Align Column');
check('deleting a row is disabled in the header', byId(headerCell, 'row-delete').enabled, false);
check('deleting a row is enabled in the body', byId(bodyCell, 'row-delete').enabled, true);
check('moving the first body row up is disabled', byId(bodyCell, 'row-up').enabled, false);
check('moving a row down is disabled in the last row', byId(bodyCell, 'row-down').enabled, false);
check('moving a row down is enabled above another row', byId(middleRow, 'row-down').enabled, true);
check('clearing a filled row is enabled', byId(bodyCell, 'row-clear').enabled, true);
check('deleting the last column is disabled', byId(oneColumnMenu, 'column-delete').enabled, false);
check('moving the first column left is disabled', byId(headerCell, 'column-move-left').enabled, false);
check('moving the first column right is enabled', byId(headerCell, 'column-move-right').enabled, true);
check('clearing an empty cell is disabled', byId(oneColumnMenu, 'clear-cell').enabled, false);
check('clearing a filled cell is enabled', byId(bodyCell, 'clear-cell').enabled, true);
check('clearing an empty table is disabled', byId(oneColumnMenu, 'clear-table').enabled, false);
check('clearing a filled table is enabled', byId(bodyCell, 'clear-table').enabled, true);
check('deleting the table is always enabled', byId(headerCell, 'delete-table').enabled, true);
check('clearing a cell past the end of a short row is disabled', byId(ragged, 'clear-cell').enabled, false);
check('the align items carry their commands',
  flat(headerCell).filter((node) => node.id.startsWith('align-')).map((node) => node.command),
  ['alignLeft', 'alignCenter', 'alignRight']);
check('the already-set alignment is disabled', byId(headerCell, 'align-left').enabled, false);
check('every item has a label and a unique id',
  flat(headerCell).every((node) => node.label.length > 0) &&
    new Set(flat(headerCell).map((node) => node.id)).size === flat(headerCell).length,
  true);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('table menu: all checks passed');
