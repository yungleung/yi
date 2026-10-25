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

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('reference header: all checks passed');
