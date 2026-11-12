/**
 * Checks the one source-space-to-display-space mapping.
 *
 * The direct prose write depends on the rendered text preserving the source's
 * character count, even where HTML would collapse spaces.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/text_spacing.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-text-spacing-'));
const file = join(directory, 'text_spacing.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { preserveSpaces } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check('a single inner space is unchanged', preserveSpaces('one two'), 'one two');
check('a run keeps its first space and draws the rest', preserveSpaces('one  two'), 'one \u00a0two');
check('a trailing space is drawn', preserveSpaces('one two '), 'one two\u00a0');
check('a leading run is drawn from its second character', preserveSpaces('  one'), ' \u00a0one');
for (const value of ['', 'one', 'one two', 'one  two', '  one  two  ']) {
  check(`length is unchanged for ${JSON.stringify(value)}`, preserveSpaces(value).length, value.length);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('text spacing: all checks passed');
