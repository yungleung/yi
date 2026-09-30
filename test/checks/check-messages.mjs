/**
 * What a message is and where it goes (`services/messages.ts`) in Node: a place names the tree row
 * of a file or the button that ran a command, a message with no place goes to the corner, and a
 * path with a quote, a backslash or a newline in it still makes a selector that finds it.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-messages-'));
const bundle = await rolldown({ input: 'src/services/messages.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'messages.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { placeSelector } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check(
  'a file is found by its row',
  placeSelector({ path: '/notes/a.md' }),
  '[data-tree-path="/notes/a.md"]'
);
check(
  'a command by the button that ran it',
  placeSelector({ command: 'edit:insertImage' }),
  '[data-command="edit:insertImage"]'
);
check('and a message with no place is in the corner', placeSelector(undefined), null);
check(
  'a quote in a file name is escaped',
  placeSelector({ path: '/notes/say "hi".md' }),
  '[data-tree-path="/notes/say \\"hi\\".md"]'
);
check(
  'a backslash is escaped too',
  placeSelector({ path: '/notes/a\\b.md' }),
  '[data-tree-path="/notes/a\\\\b.md"]'
);
check(
  'and a newline cannot break the selector',
  placeSelector({ path: '/notes/a\nb.md' }),
  '[data-tree-path="/notes/a\\a b.md"]'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('messages: all checks passed');
