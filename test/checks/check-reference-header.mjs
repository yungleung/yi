/**
 * Checks the LaTeX header that makes table references follow the document's own counter.
 *
 * The header carries the document-configured table word and literal prefix, while
 * `\yiTableRef` reads the final number through `\ref` rather than carrying Yi's
 * precomputed value into the source.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-reference-header-'));
const bundle = await rolldown({
  input: 'src/ui/export/reference_header.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'reference_header.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { referenceHeader } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const markdown =
  '---\n' +
  'reference-labels:\n' +
  '  table: Data table\n' +
  'reference-number-prefixes:\n' +
  '  table: "2-"\n' +
  '---\n\n' +
  '| A |\n' +
  '| --- |\n' +
  '| 1 |\n' +
  ': Results {#tbl:x}\n';
const header = referenceHeader(markdown);
check(
  'the table word and literal prefix follow document metadata',
  header.includes(
    '\\AtBeginDocument{%\n' +
      '  \\renewcommand{\\tablename}{Data table}%\n' +
      '  \\renewcommand{\\thetable}{\\mbox{2-}\\arabic{table}}%\n' +
      '}'
  ),
  true
);
check(
  'the portable reference goes through the native counter',
  header.includes(
    '\\providecommand{\\yiTableRef}[1]{%\n' +
      '  \\hyperref[#1]{\\tablename~\\ref*{#1}}%\n' +
      '}'
  ),
  true
);
check(
  'an empty prefix leaves the native table counter unchanged',
  referenceHeader('| A |\n| --- |\n| 1 |\n: Results\n').includes('\\renewcommand{\\thetable}'),
  false
);
check(
  'a note with no captioned table has no table header',
  referenceHeader('# No tables\n'),
  ''
);
const equationHeader = referenceHeader(
  '---\n' +
    'reference-labels:\n' +
    '  equation: Formula\n' +
    'reference-number-prefixes:\n' +
    '  equation: "A-"\n' +
    '---\n\n' +
    '[$$\nx=1\n$$]{#eq:x}\n'
);
check(
  'equation metadata reaches its own native counter',
  equationHeader.includes(
    '\\AtBeginDocument{%\n' +
      '  \\renewcommand{\\equationname}{Formula}%\n' +
      '  \\renewcommand{\\theequation}{\\mbox{A-}\\arabic{equation}}%\n' +
      '}'
  ),
  true
);
check(
  'the equation macro is generated only when an equation exists',
  [
    equationHeader.includes('\\providecommand{\\yiEquationRef}[1]'),
    equationHeader.includes('\\providecommand{\\yiTableRef}[1]')
  ],
  [true, false]
);
check(
  'LaTeX syntax in a literal prefix is escaped',
  referenceHeader(
    '---\nreference-number-prefixes:\n  table: "A&B"\n---\n\n' +
      '| A |\n| --- |\n| 1 |\n: Results\n'
  ).includes('\\mbox{A\\&B}\\arabic{table}'),
  true
);
check(
  'a backslash in a literal prefix is an escaped text command',
  referenceHeader(
    '---\nreference-number-prefixes:\n  table: \'A\\B\'\n---\n\n' +
      '| A |\n| --- |\n| 1 |\n: Results\n'
  ).includes('\\mbox{A\\textbackslash{}B}\\arabic{table}'),
  true
);

const listHeader = referenceHeader(
  '---\n' +
    'reference-labels:\n' +
    '  list: Procedure\n' +
    'reference-number-prefixes:\n' +
    '  list: "3-"\n' +
    '---\n\n' +
    '- first\n- second\n\n: Steps {#list:steps}\n'
);
check(
  'list metadata reaches its namespaced object counter',
  listHeader.includes(
    '\\@ifundefined{c@yilist}{\\newcounter{yilist}}{}\n' +
      '\\makeatother\n' +
      '\\providecommand{\\yiListNumber}{\\arabic{yilist}}\n' +
      '\\renewcommand{\\theyilist}{\\yiListNumber}\n' +
      '\\providecommand{\\yiListName}{List}\n' +
      '\\providecommand{\\yiListCounterSetup}{}\n' +
      '\\AtBeginDocument{%\n' +
      '  \\yiListCounterSetup\n' +
      '  \\renewcommand{\\yiListName}{Procedure}%\n' +
      '  \\renewcommand{\\theyilist}{\\mbox{3-}\\yiListNumber}%\n' +
      '}'
  ),
  true
);
check(
  'the list reference uses the native reference machinery',
  listHeader.includes(
    '\\providecommand{\\yiListRef}[1]{%\n' +
      '  \\hyperref[#1]{\\yiListName~\\ref*{#1}}%\n' +
      '}'
  ),
  true
);
check(
  'a note without a captioned list emits no list header',
  referenceHeader('- ordinary\n'),
  ''
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('reference header: all checks passed');
