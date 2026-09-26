/**
 * Checks the workspace tree's two pure rules in Node: what a rename starts with selected
 * (the name, without the file's markdown extension) and whether a drop into a folder is
 * allowed.
 *
 * The filesystem's own rules — what a name may be, what already exists — are the
 * backend's, and are tested in Rust (`src-tauri/src/files.rs`). These are the
 * interaction's.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/workspace/tree_rules.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-tree-rules-'));
const file = join(directory, 'tree_rules.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { nameSelection, nameWithoutExtension, dropDecision } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const selected = (basename, isFile) => {
  const range = nameSelection(basename, isFile);
  return basename.slice(range.start, range.end);
};

// What a rename starts with selected.
check('a file selects its name without the extension', selected('note.md', true), 'note');
check('and with a dotted name only the last extension goes', selected('a.b.md', true), 'a.b');
check('a longer markdown extension goes too', selected('note.markdown', true), 'note');
check('a file with no extension selects all of it', selected('notes', true), 'notes');
check('a dot file keeps its whole name', selected('.hidden', true), '.hidden');
check('a folder selects its whole name', selected('Notes', false), 'Notes');
check('and a folder whose name looks like a file too', selected('a.md', false), 'a.md');
check(
  'the selection is a range of the name that is really there',
  nameSelection('note.md', true),
  { start: 0, end: 4 }
);

// The name a reader means: what a rename selects, and what Copy name copies.
check('the name without the extension is the file`s name', nameWithoutExtension('note.md', true), 'note');
check('with a dotted name the last extension still goes', nameWithoutExtension('a.b.md', true), 'a.b');
check('a folder keeps its whole name', nameWithoutExtension('sub', false), 'sub');
check('and a folder named like a file too', nameWithoutExtension('a.md', false), 'a.md');
check('a file with no extension has no extension to drop', nameWithoutExtension('notes', true), 'notes');

// Whether a drop is allowed.
const folder = (path, basename) => ({ path, basename, isFile: false });
const asFile = (path, basename) => ({ path, basename, isFile: true });
const workspace = '/home/me/notes';
const allowed = (dragged, target) => dropDecision(dragged, target).allowed;

check(
  'a file drops into another folder',
  allowed(asFile(`${workspace}/a.md`, 'a.md'), folder(`${workspace}/sub`, 'sub')),
  true
);
check(
  'a folder drops into another folder',
  allowed(folder(`${workspace}/one`, 'one'), folder(`${workspace}/two`, 'two')),
  true
);
check(
  'nothing drops onto a file',
  dropDecision(asFile(`${workspace}/a.md`, 'a.md'), asFile(`${workspace}/b.md`, 'b.md')),
  { allowed: false, reason: 'not-a-folder' }
);
check(
  'an entry does not drop onto itself',
  dropDecision(folder(`${workspace}/one`, 'one'), folder(`${workspace}/one`, 'one')),
  { allowed: false, reason: 'itself' }
);
check(
  'a folder does not drop inside itself',
  dropDecision(folder(`${workspace}/one`, 'one'), folder(`${workspace}/one/inner`, 'inner')),
  { allowed: false, reason: 'inside-itself' }
);
check(
  'and a name that merely starts the same is not inside it',
  allowed(folder(`${workspace}/one`, 'one'), folder(`${workspace}/one-notes`, 'one-notes')),
  true
);
check(
  'a drop into the folder it already lives in is nothing to do',
  dropDecision(asFile(`${workspace}/a.md`, 'a.md'), folder(workspace, 'notes')),
  { allowed: false, reason: 'already-there' }
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('tree rules: all checks passed');
