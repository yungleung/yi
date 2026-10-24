/**
 * Checks the source form of Yi's textless cross-reference syntax.
 *
 * `[#id]` is scanned as source text so the parser can turn it into an inline
 * node while escaped, empty, and unterminated forms stay literal.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-auto-references-'));
const bundle = await rolldown({
  input: 'src/ui/markdown/syntax/auto_references.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'auto_references.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { autoReferenceSpans } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check('a reference reports its source and id', autoReferenceSpans('See [#fig:model].'), [
  { from: 4, to: 16, id: 'fig:model' }
]);
check('several references retain their order', autoReferenceSpans('[#fig:a] and [#tbl:b]'), [
  { from: 0, to: 8, id: 'fig:a' },
  { from: 13, to: 21, id: 'tbl:b' }
]);
check('escaped references stay text', autoReferenceSpans('\\[#fig:model]'), []);
check('an even run of escapes does not escape', autoReferenceSpans('\\\\[#fig:model]'), [
  { from: 2, to: 14, id: 'fig:model' }
]);
check('empty references stay text', autoReferenceSpans('[# ]'), []);
check('line breaks end the search', autoReferenceSpans('[#fig:\nmodel]'), []);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('automatic references: all checks passed');
