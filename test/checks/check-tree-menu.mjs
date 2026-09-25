/**
 * Checks the workspace tree's context menu model in Node: which items an entry offers, in
 * what order, and which are left out because they cannot mean anything for it.
 *
 * The menu a reader sees is a native one (`src/ui/workspace/tree_menu.ts`), built from
 * this model; nothing but a person can choose an item of it, so this is where the menu's
 * contents are held to an answer (the table's menu has the same pair, `check-table-menu.mjs`
 * and `test/probes/table-menu-open.js`).
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/workspace/tree_menu_model.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-tree-menu-'));
const file = join(directory, 'tree_menu_model.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { treeMenuActions, treeMenuNodes } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const workspace = '/home/me/notes';
const fileEntry = { path: `${workspace}/a.md`, basename: 'a.md', isFile: true };
const folderEntry = { path: `${workspace}/sub`, basename: 'sub', isFile: false };
const rootEntry = { path: workspace, basename: 'notes', isFile: false, isRoot: true };

check(
  'a file offers rename, delete, reveal and the three copies',
  treeMenuActions(fileEntry),
  ['rename', 'delete', 'reveal', 'copy-path', 'copy-name', 'copy-id']
);
check(
  'a folder adds making a file and a folder, and offers no id to copy',
  treeMenuActions(folderEntry),
  ['rename', 'delete', 'new-file', 'new-folder', 'reveal', 'copy-path', 'copy-name']
);
check(
  'the workspace itself is not renamed and not deleted',
  treeMenuActions(rootEntry),
  ['new-file', 'new-folder', 'reveal', 'copy-path', 'copy-name']
);
check(
  'the groups are separated, and the menu does not end in a separator',
  treeMenuNodes(fileEntry).map((node) => (node.kind === 'separator' ? '|' : node.id)),
  ['rename', 'delete', '|', 'reveal', '|', 'copy-path', 'copy-name', 'copy-id']
);
check(
  'a folder has one more group than a file',
  treeMenuNodes(folderEntry).filter((node) => node.kind === 'separator').length,
  3
);
check(
  'every item says what it does',
  treeMenuNodes(fileEntry)
    .filter((node) => node.kind === 'item')
    .every((node) => node.label.length > 0),
  true
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('tree menu: all checks passed');
