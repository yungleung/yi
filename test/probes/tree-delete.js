/**
 * Deleting from the tree: the entry goes from the disk and from the tree, and a folder
 * goes with everything in it.
 *
 * The menu is native and nothing but a person can choose an item of it
 * (`docs/testing.md`), so the action is driven here through `workspace/tree/ops.ts`, the module the
 * menu's Delete runs. The *question* the delete asks first is a native dialog, and nothing
 * but a person can answer one — the same limit as the menu — so this probe drives
 * `deleteNow`, the half a yes leaves, and the question itself is a person's check.
 *
 * The probe makes its own workspace under the user's home folder with the app's own commands and
 * removes it again.
 *
 * @covers src/ui/workspace/tree/ops.ts, src/api/files.ts, src/ui/workspace/index.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const ops = await t.app('/src/ui/workspace/tree/ops.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const parent = await t.homeDir();
  const folderName = `yi-tree-delete-probe-${Date.now().toString(36)}`;
  const workspace = await t.joinPath(parent, folderName);
  const folder = `${workspace}/doomed`;
  const namesIn = async () => (await files.listFolderFiles(workspace)).map((item) => item.basename).sort();
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(parent, folderName, false);
    await files.createEntry(workspace, 'note.md', true);
    await files.createEntry(workspace, 'doomed', false);
    await files.createEntry(folder, 'deep.md', true);
    previous = await t.openWorkspace(workspace);

    await ops.deleteNow({ path: folder, basename: 'doomed', isFile: false });
    await t.sleep(200);
    check('a yes takes the folder with everything in it', await namesIn(), ['note.md']);
    check(
      'and its row is gone from the tree',
      document.querySelector(`[data-tree-path="${folder}"]`) === null,
      [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath)
    );
  } finally {
    await t.restoreWorkspace(previous);
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
