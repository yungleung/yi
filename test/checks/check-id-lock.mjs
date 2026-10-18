/**
 * Checks the frontmatter id lock in Node: which edits reach the `id:` line.
 *
 * The line is the note's name, written by the app, so a write may not change it. The rule is a
 * pure function of the text and the replaced range; the editor's path through it is the probe.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/editing/id_lock.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-id-lock-'));
const file = join(directory, 'id_lock.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { editsId } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const note = '---\nid: 20240707122715\ntitle: A note\n---\n\nBody\n';
const lineStart = note.indexOf('id:');
const lineEnd = note.indexOf('\n', lineStart);
const valueStart = lineStart + 'id: '.length;

check('a character typed in the value is a change to the id', editsId(note, valueStart + 2, valueStart + 2), true);
check('and so is one typed at its end', editsId(note, lineEnd, lineEnd), true);
check(
  'a character typed at the start of the line writes before it',
  editsId(note, lineStart, lineStart),
  false
);
check('typing in the title is not the id', editsId(note, note.indexOf('A note') + 1, note.indexOf('A note') + 1), false);
check('Backspace at the line’s start would join it to the line above', editsId(note, lineStart - 1, lineStart), true);
check('Delete at its end would join it to the line below', editsId(note, lineEnd, lineEnd + 1), true);
check('replacing the line is a change', editsId(note, lineStart, lineEnd), true);
check('replacing the whole frontmatter is too', editsId(note, 0, note.indexOf('---', 4) + 3), true);
check(
  'deleting the title line is not',
  editsId(note, note.indexOf('title:'), note.indexOf('title:') + 6),
  false
);
check('a note without frontmatter has nothing to pin', editsId('# A note\n\nBody\n', 3, 3), false);
check(
  'a note whose frontmatter has no id has nothing to pin',
  editsId('---\ntitle: A note\n---\n\nBody\n', 10, 10),
  false
);
check(
  'and an id in a frontmatter closed by ... is pinned',
  editsId('---\nid: 20240707122715\ntitle: A note\n...\n\nBody\n', 6, 6),
  true
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('id lock: all checks passed');
