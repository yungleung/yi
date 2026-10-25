/**
 * Checks automatic-reference parsing and the shared heading target index.
 *
 * The index is the one source of target order, IDs, and labels; automatic
 * references read that source rather than inventing a second resolution rule.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-reference-index-'));
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return await import(file);
};

const { parseMarkdown } = await load('src/ui/markdown/syntax/parser.ts', 'parser');
const { firstReference, referenceIndex, referenceLabel } = await load(
  'src/ui/markdown/document/reference_index.ts',
  'reference_index'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const parsed = parseMarkdown('See [#start].\n');
const inlines = parsed.children[0].children;
check(
  'an automatic reference becomes its own inline node',
  inlines.map((node) => [node.type, node.value, node.id]),
  [
    ['text', 'See ', undefined],
    ['autoReference', '[#start]', 'start'],
    ['text', '.', undefined]
  ]
);
check(
  'an escaped automatic reference remains text',
  parseMarkdown('\\[#start]\n').children[0].children.map((node) => node.type),
  ['text']
);

const entries = referenceIndex('# Start\n\n# Start\n\n# Custom {#same}\n');
check(
  'headings remain ordered targets with Pandoc duplicate suffixes',
  entries.map((entry) => [entry.kind, entry.id, entry.explicit, entry.number]),
  [
    ['heading', 'start', false, null],
    ['heading', 'start-1', false, null],
    ['heading', 'same', true, null]
  ]
);
check(
  'the first matching target wins',
  firstReference(entries, 'start')?.from,
  entries[0].from
);
check(
  'a heading automatic reference displays its title',
  referenceLabel(entries[0]),
  'Start'
);

const withFigures = referenceIndex(
  '# Start\n\n' +
    '![First](one.png){#fig:one}\n\n' +
    '![Second](two.png)\n\n' +
    'The [inline ![icon](icon.png).](#figure)'
);
check(
  'implicit figures are numbered in document order, including unlabeled ones',
  withFigures
    .filter((entry) => entry.kind === 'figure')
    .map((entry) => [entry.id, entry.number, entry.title]),
  [
    ['fig:one', 1, 'First'],
    [null, 2, 'Second']
  ]
);
check(
  'a figure automatic reference also spells its localized kind',
  referenceLabel(withFigures.find((entry) => entry.id === 'fig:one')),
  'Figure 1'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('reference index: all checks passed');
