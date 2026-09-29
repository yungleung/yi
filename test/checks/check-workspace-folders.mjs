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

const {
  FOLDER_LIMIT,
  destinationForFile,
  fileName,
  imagePathCandidates,
  joinPath,
  parentFolder,
  placementOfPath,
  relativePathFrom,
  workspaceFolders
} = await bundleModule('src/services/workspace_folders.ts', 'workspace_folders');

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

// --- what a destination says about a file, and how it is read back -------------------------

check('a file inside a folder is its path from there', relativePathFrom('/vault', '/vault/a/b.png'), 'a/b.png');
check('a file above it is reached with ..', relativePathFrom('/vault/notes', '/vault/a.png'), '../a.png');
check('a file beside it is its own name', relativePathFrom('/vault/notes', '/vault/notes/a.png'), 'a.png');
check('and a folder is not its own relative path', relativePathFrom('/vault', '/vault'), null);
check(
  'and one under another top-level folder is reached by climbing',
  relativePathFrom('/Users/x', '/Volumes/y/a.png'),
  '../../Volumes/y/a.png'
);
check('and neither has one that is not absolute', relativePathFrom('/Users/x', 'a.png'), null);
check('a Windows drive reads the same way', relativePathFrom('C:\\vault', 'C:\\vault\\a.png'), 'a.png');
check('and another drive has none', relativePathFrom('C:\\vault', 'D:\\a.png'), null);

check('a relative path joins the folder it is read from', joinPath('/vault', 'a/b.png'), '/vault/a/b.png');
check('and .. takes a piece off it', joinPath('/vault/notes', '../a.png'), '/vault/a.png');
check('with . left out', joinPath('/vault', './a.png'), '/vault/a.png');
check('a folder that is not absolute joins nothing', joinPath('relative', 'a.png'), null);

check(
  'a saved image is named from the folder the settings gave',
  destinationForFile('/pics/2026.png', '/pics', '/vault/notes'),
  '2026.png'
);
check(
  'and with no such folder, from the document it was inserted into',
  destinationForFile('/vault/notes/2026.png', null, '/vault/notes'),
  '2026.png'
);
check(
  'a file under neither keeps its own path',
  destinationForFile('/Volumes/other/a.png', '/pics', '/vault/notes'),
  '/Volumes/other/a.png'
);

// --- which file an image destination names ---------------------------------------------------

check(
  'a relative destination is read from the document first, and from the image folder after it',
  imagePathCandidates('a.png', '/pics', '/vault/notes'),
  ['/vault/notes/a.png', '/pics/a.png']
);
check(
  'a relative destination climbs out of the folder it is read from',
  imagePathCandidates('../a.png', '/pics/yi', '/vault/notes'),
  ['/vault/a.png', '/pics/a.png']
);
check('an absolute destination is itself', imagePathCandidates('/pics/a.png', '/pics', '/vault/notes'), ['/pics/a.png']);
check(
  'a destination with a scheme is left to the webview',
  [imagePathCandidates('https://x.example/a.png', '/pics', '/vault'), imagePathCandidates('data:image/png;base64,AAA', null, '/vault')],
  [[], []]
);
check('an empty destination names nothing', imagePathCandidates('', '/pics', '/vault'), []);
check(
  'and with neither folder named, there is nothing to read it from',
  imagePathCandidates('a.png', null, null),
  []
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('workspace folders: all checks passed');
