/**
 * Checks the walk that says where a new note may go (`services/workspace_folders.ts`): the order
 * and depth of what it offers, a folder it cannot read, the folder it refuses to walk past, and
 * the two path rules the card and the tree share.
 *
 * The lister is a port, so the walk is asserted here in Node with a stand-in rather than driven
 * through the app; the card that shows the list is `test/probes/new-markdown.js`, and the tree's
 * use of the same path rules is `test/probes/tree-*.js`.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-folders-'));

/** Bundles one module and imports it, the way every check loads its subject. */
async function bundleModule(input, name) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const { FOLDER_LIMIT, fileName, parentFolder, placementOfPath, workspaceFolders } = await bundleModule(
  'src/services/workspace_folders.ts',
  'workspace_folders'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** A folder lister over a plain map, the way the backend lists a folder. */
const listerFor = (contents) => async (folder) =>
  (contents[folder] ?? []).map((entry) =>
    typeof entry === 'string'
      ? { path: `${folder}/${entry}`, basename: entry, is_file: false }
      : entry
  );

const VAULT = {
  '/vault': ['a', 'b', { path: '/vault/note.md', basename: 'note.md', is_file: true }],
  '/vault/a': ['a1'],
  '/vault/b': ['b1']
};

check(
  'the workspace root comes first, then each folder under it, in the order it is listed',
  await workspaceFolders('/vault', listerFor(VAULT)),
  [
    { path: '/vault', name: 'vault', depth: 0 },
    { path: '/vault/a', name: 'a', depth: 1 },
    { path: '/vault/a/a1', name: 'a1', depth: 2 },
    { path: '/vault/b', name: 'b', depth: 1 },
    { path: '/vault/b/b1', name: 'b1', depth: 2 }
  ]
);
check(
  'and a file is not a place a note can go',
  (await workspaceFolders('/vault', listerFor(VAULT))).some((folder) => folder.path.endsWith('.md')),
  false
);
check(
  'a folder that cannot be read is passed over, and its siblings are not',
  await workspaceFolders('/vault', async (folder) => {
    if (folder === '/vault') {
      return [{ path: '/vault/locked', basename: 'locked', is_file: false }];
    }
    throw new Error('permission denied');
  }),
  [
    { path: '/vault', name: 'vault', depth: 0 },
    { path: '/vault/locked', name: 'locked', depth: 1 }
  ]
);
check(
  'and a folder that leads back into itself is not followed forever',
  (
    await workspaceFolders('/deep', async (folder) => [
      { path: `${folder}/deeper`, basename: 'deeper', is_file: false }
    ])
  ).length,
  FOLDER_LIMIT
);

// --- the two path rules -------------------------------------------------------------------

check('a file name is the last piece of its path', fileName('/vault/notes/a note.md'), 'a note.md');
check('on a path written with the other separator too', fileName('C:\\vault\\a note.md'), 'a note.md');
check('a folder name is its own last piece', fileName('/vault/notes/'), 'notes');
check('and a path with nothing to take is itself', fileName('/'), '/');
check('the folder a path lives in is everything above it', parentFolder('/vault/notes/a.md'), '/vault/notes');
check('on the other separator too', parentFolder('C:\\vault\\a.md'), 'C:\\vault');
check('and a path with no folder has none', parentFolder('/'), null);
check(
  'what a chosen path means is the folder it is in, and its own file name',
  placementOfPath('/vault/notes/A note.md'),
  { folder: '/vault/notes', name: 'A note.md' }
);
check('on the other separator too', placementOfPath('C:\\vault\\A note.md'), {
  folder: 'C:\\vault',
  name: 'A note.md'
});
check('and a path with no folder means nothing at all', placementOfPath('/'), null);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('workspace folders: all checks passed');
