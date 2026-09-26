/**
 * The tree's "New file" and "New folder": both are written inside the clicked folder, and
 * a new file is left ready to be named.
 *
 * The menu is native and nothing but a person can choose an item of it
 * (`docs/testing.md`), so the *contents* are held by `check-tree-menu.mjs` and the action
 * is driven here through `tree_ops.ts`, the module the menu's items run.
 *
 * The probe makes its own workspace under `/private/tmp` with the app's own commands and
 * removes it again.
 *
 * @covers src/ui/workspace/tree_ops.ts, src/api/files.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const ops = await t.app('/src/ui/workspace/tree_ops.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const workspace = '/private/tmp/yi-tree-create-probe';
  const sub = `${workspace}/sub`;
  const entry = (path, basename, isFile) => ({ path, basename, isFile });
  const namesIn = async (folder) => (await files.listFolderFiles(folder)).map((item) => item.basename).sort();
  /** The row a path has, and the label inside it. */
  const labelFor = (path) => document.querySelector(`[data-tree-path="${path}"] span.truncate`) ?? null;
  const cancelEdit = async (path) => {
    labelFor(path)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await t.sleep(200);
  };
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry('/private/tmp', 'yi-tree-create-probe', false);
    await files.createEntry(workspace, 'sub', false);
    await files.createEntry(sub, 'inner.md', true);
    previous = await t.openWorkspace(workspace);

    await ops.runTreeAction('new-file', entry(sub, 'sub', false));
    await t.sleep(150);
    check('a new file is written inside the clicked folder', await namesIn(sub), ['Untitled.md', 'inner.md']);
    check(
      'and the tree leaves it ready to be named',
      labelFor(`${sub}/Untitled.md`)?.isContentEditable === true,
      labelFor(`${sub}/Untitled.md`)?.outerHTML?.slice(0, 90) ?? null
    );
    await cancelEdit(`${sub}/Untitled.md`);

    await ops.runTreeAction('new-file', entry(sub, 'sub', false));
    await t.sleep(150);
    check(
      'a second new file takes the next free name',
      await namesIn(sub),
      ['Untitled 2.md', 'Untitled.md', 'inner.md']
    );
    await cancelEdit(`${sub}/Untitled 2.md`);

    await ops.runTreeAction('new-folder', entry(sub, 'sub', false));
    await t.sleep(150);
    check(
      'a new folder is made inside it too',
      await namesIn(sub),
      ['New folder', 'Untitled 2.md', 'Untitled.md', 'inner.md']
    );
    check(
      'and a new folder is left ready to be named as well',
      labelFor(`${sub}/New folder`)?.isContentEditable === true,
      labelFor(`${sub}/New folder`)?.outerHTML?.slice(0, 90) ?? null
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
