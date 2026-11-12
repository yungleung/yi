/**
 * Where a hint goes (`services/hints.ts`) in Node: a hint names the tree's row for a file, and a
 * path with a quote, a backslash or a newline in it still makes a selector that finds it.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-hints-'));
const bundle = await rolldown({ input: 'src/services/hints.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'hints.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { hintPlaceSelector } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check(
  'a hint is found by the row of its file',
  hintPlaceSelector({ path: '/notes/a.md' }),
  '[data-tree-path="/notes/a.md"]'
);
check(
  'a quote in a file name is escaped',
  hintPlaceSelector({ path: '/notes/say "hi".md' }),
  '[data-tree-path="/notes/say \\"hi\\".md"]'
);
check(
  'a backslash is escaped too',
  hintPlaceSelector({ path: '/notes/a\\b.md' }),
  '[data-tree-path="/notes/a\\\\b.md"]'
);
check(
  'and a newline cannot break the selector',
  hintPlaceSelector({ path: '/notes/a\nb.md' }),
  '[data-tree-path="/notes/a\\a b.md"]'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('hints: all checks passed');
