/**
 * Checks automatic-reference parsing and the shared heading target index.
 *
 * The index is the one source of target order, IDs, and labels; automatic
 * references read that source rather than inventing a second resolution rule.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-reference-index-'));
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return await import(pathToFileURL(file).href);
};

const { parseMarkdown } = await load('src/ui/markdown/syntax/parser.ts', 'parser');
const {
  equationBlockNumber,
  firstReference,
  referenceIndex,
  referenceLabel
} = await load(
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

const withTables = referenceIndex(
  '| A |\n| --- |\n| 1 |\n: First caption\n\n' +
    '| B |\n| --- |\n| 2 |\n\n: Second caption {#tbl:second}\n\n' +
    '| C |\n| --- |\n| 3 |\n'
);
check(
  'every captioned table is numbered in document order',
  withTables
    .filter((entry) => entry.kind === 'table')
    .map((entry) => [entry.id, entry.number, entry.title]),
  [
    [null, 1, 'First caption'],
    ['tbl:second', 2, 'Second caption']
  ]
);
check(
  'a table automatic reference uses the document label',
  referenceLabel(withTables.find((entry) => entry.id === 'tbl:second')),
  'Table 2'
);
check(
  'an ID-only table is a numbered target',
  referenceIndex('| A |\n| --- |\n| 1 |\n: {#tbl:id}\n').find(
    (entry) => entry.kind === 'table'
  )?.number,
  1
);

const configuredTables = referenceIndex(
  '---\nreference-labels:\n  table: Data table\nreference-number-prefixes:\n  table: "2-"\n---\n\n' +
    '| A | B |\n| --- | --- |\n| 1 | 2 |\n: Results {#tbl:x}\n'
);
const configuredTable = configuredTables.find((entry) => entry.kind === 'table');
check('a table uses its configured label and prefix', referenceLabel(configuredTable), 'Data table 2-1');
check('a table target starts at its first header cell', configuredTable?.caretAt, 90);

const equationDoc =
  '---\nreference-labels:\n  equation: Formula\nreference-number-prefixes:\n  equation: "2-"\n---\n\n' +
  '[$$\nx=1\n$$]{#eq:first}\n\n' +
  '[$$\ny=2\n$$]{}\n\n' +
  '[$$\nz=3\n$$]{#eq:third}\n';
const equationEntries = referenceIndex(equationDoc).filter((entry) => entry.kind === 'equation');
check(
  'only labeled equations enter the index',
  equationEntries.map((entry) => [entry.id, entry.number, entry.title]),
  [
    ['eq:first', 1, ''],
    ['eq:third', 2, '']
  ]
);
check(
  'an equation uses the configured label and prefix',
  referenceLabel(equationEntries[0]),
  'Formula (2-1)'
);
check(
  'a visible equation number omits the reference label',
  equationBlockNumber(equationEntries[0]),
  '(2-1)'
);
check('an equation target starts at its formula body', equationEntries[0]?.caretAt, 95);

const listDocument =
  '---\n' +
  'reference-labels:\n' +
  '  list: Procedure\n' +
  'reference-number-prefixes:\n' +
  '  list: "3-"\n' +
  '---\n\n' +
  '- First item\n- Second item\n: Steps\n\n' +
  '3. Third item\n4. Fourth item\n: {#list:target}\n';
const listEntries = referenceIndex(listDocument).filter((entry) => entry.kind === 'list');
check(
  'every captioned list is numbered in document order',
  listEntries.map((entry) => [entry.id, entry.number, entry.title]),
  [
    [null, 1, 'Steps'],
    ['list:target', 2, '']
  ]
);
check(
  'a list uses its configured label and prefix',
  referenceLabel(listEntries[1]),
  'Procedure 3-2'
);
check(
  'a list target starts at its first item content',
  [listEntries[0]?.caretAt, listEntries[0]?.caretAt == null
    ? null
    : listDocument.slice(listEntries[0].caretAt, listEntries[0].caretAt + 10)],
  [listDocument.indexOf('First item'), 'First item']
);
check(
  'an ID-only list keeps a non-default ordered start',
  [listEntries[1]?.caretAt, listEntries[1]?.caretAt == null
    ? null
    : listDocument.slice(listEntries[1].caretAt, listEntries[1].caretAt + 10)],
  [listDocument.indexOf('Third item'), 'Third item']
);

const equationBeforeFigure = referenceIndex(
  '[$$\nx=1\n$$]{#eq:before}\n\n' +
    '![After](after.png){#fig:after}\n'
);
check(
  'a labeled equation does not hide a following figure from the index',
  equationBeforeFigure.map((entry) => [entry.kind, entry.id, entry.number]),
  [
    ['equation', 'eq:before', 1],
    ['figure', 'fig:after', 1]
  ]
);
check(
  'the figure after an equation keeps its visible number',
  referenceLabel(equationBeforeFigure.find((entry) => entry.kind === 'figure')),
  'Figure 1'
);

const listingMarkdown = `---
reference-labels:
  listing: Code excerpt
reference-number-prefixes:
  listing: "A."
---

\`\`\`python {caption="Unnumbered"}
print(0)
\`\`\`

\`\`\`python {#lst:one}
print(1)
\`\`\`

\`\`\`python {#lst:two caption="Second"}
print(2)
\`\`\`
`;
const withListings = referenceIndex(listingMarkdown);
check(
  'only identified listings consume listing numbers',
  withListings
    .filter((entry) => entry.kind === 'listing')
    .map((entry) => [entry.id, entry.number, entry.title]),
  [
    ['lst:one', 1, ''],
    ['lst:two', 2, 'Second']
  ]
);
check(
  'a listing automatic reference uses the document label and prefix',
  referenceLabel(withListings.find((entry) => entry.id === 'lst:two')),
  'Code excerpt A.2'
);
check(
  'a listing caret starts on its first body line',
  withListings.find((entry) => entry.id === 'lst:one')?.caretAt,
  listingMarkdown.indexOf('print(1)')
);

const theoremSource = [
  '---',
  'amsthm:',
  '  plain:',
  '    - Theorem:',
  '        - Lemma',
  '  name_to_text:',
  '    Theorem: 定理',
  '    Lemma: 引理',
  '---',
  '',
  '::: {#thm:one .Theorem}',
  'One.',
  ':::',
  '',
  '::: {.Lemma}',
  'The same counter.',
  ':::',
  '',
  '::: {#thm:three .Theorem}',
  'Three.',
  ':::',
  '',
  '::: proof',
  'Done.',
  ':::'
].join('\n');
const theoremEntries = referenceIndex(theoremSource)
  .filter((entry) => entry.kind === 'theorem');
check(
  'theorems consume shared counters in document order',
  theoremEntries.map((entry) => [entry.id, entry.number]),
  [['thm:one', 1], [null, 2], ['thm:three', 3], [null, null]]
);
check(
  'a theorem reference uses the note-owned title and number',
  theoremEntries[2] === undefined ? null : referenceLabel(theoremEntries[2]),
  '定理 3'
);
check(
  'an ID-less lemma remains a counter consumer without a target',
  theoremEntries[1]?.label,
  '引理'
);

const sectionedTheoremSource = [
  '---',
  'amsthm:',
  '  plain:',
  '    - Theorem:',
  '        - Lemma',
  '  parent_counter: section',
  '---',
  '',
  '# First',
  '',
  '::: {.Theorem}',
  'One.',
  ':::',
  '',
  '# Second',
  '',
  '::: {.Lemma}',
  'Shared two.',
  ':::'
].join('\n');
check(
  'a theorem parent counter follows the numbered heading',
  referenceIndex(sectionedTheoremSource)
    .filter((entry) => entry.kind === 'theorem')
    .map((entry) => entry.number),
  ['1.1', '2.1']
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('reference index: all checks passed');
