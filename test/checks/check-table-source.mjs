/**
 * Checks the table source model in Node: how a table's raw slice becomes rows,
 * cell spans and alignment. The model is pure text, so it needs no browser.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/syntax/table_source.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-table-'));
const file = join(directory, 'table_source.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { readTableSource, rowAt, locateCell, cellBelow, cellValue, canonicalLine, alignmentMarker } =
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
check(
  'alignment markers',
  [alignmentMarker('left'), alignmentMarker('center'), alignmentMarker('right'), alignmentMarker(null)],
  [':---', ':---:', '---:', '---']
);

const noOuter = readTableSource('a | b\n--- | ---\n1 | 2');
check('no outer pipes', noOuter.rows[0].values, ['a', 'b']);
check('one line is not a table', readTableSource('just text | more'), null);
check('not a table', readTableSource('plain text'), null);
check('ragged row keeps its own cells', readTableSource('| a | b |\n| --- | --- |\n| 1 |').rows[1].values, ['1']);
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
const twoTables = '| a |\n| --- |\n| 1 |\n\ntext\n\n| b |\n| --- |\n| 2 |';
check(
  'the table containing the offset wins',
  readTableSource(twoTables, twoTables.indexOf('| b |') + 2)?.rows[0].values,
  ['b']
);
check(
  'an offset in the first table keeps the first table',
  readTableSource(twoTables, 2)?.rows[0].values,
  ['a']
);
check('cellBelow finds the cell under the header', cellBelow(source, 0, 1)?.row, 1);
check('cellBelow finds the cell under a body cell', cellBelow(source, 1, 0)?.column, 0);
check('the last row has nothing below it', cellBelow(source, 2, 0), null);
check(
  'a short row has nothing below its missing column',
  cellBelow(readTableSource('| A | B |\n| --- | --- |\n| 1 |'), 0, 1),
  null
);
check(
  'an offset past the last cell belongs to that cell, not the first',
  locateCell(readTableSource('| a | b |\n| --- | --- |\n| 1 | 2 |'), 33)?.column,
  1
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('table source: all checks passed');
