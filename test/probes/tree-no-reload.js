/**
 * A tree change must not reload the page.
 *
 * The dev server watches the project for source changes, and the fixture workspace lives
 * *inside* the project — the folder the app is opened on in development. A rename, a move
 * or a new file in the tree is therefore a change under that watcher, and Vite answers a
 * change with a full page reload: the reader's own drag throws the page away. This probe
 * works in that workspace, makes two folders with the app's own actions, moves one into
 * the other, and checks that the page it is running in is still the page it started in.
 *
 * A reload kills the probe before it can report, so the failure this test is written
 * against is the harness's timeout, and the evidence is the run that produced it.
 *
 * @covers vite.config.ts (the dev server's watcher), src/ui/workspace/tree_ops.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const ops = await t.app('/src/ui/workspace/tree_ops.ts');
  const config = await window.__TAURI_INTERNALS__.invoke('get_config');
  const workspace = String(config?.workspace ?? '');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const entry = (path, basename, isFile) => ({ path, basename, isFile });
  const namesIn = async (folder) =>
    (await files.listFolderFiles(folder)).map((item) => item.basename).sort();
  const rowFor = (path) => document.querySelector(`[data-tree-path="${path}"]`);
  /** Leaves the rename a create opens, so the next action starts from a settled row. */
  const settle = async () => {
    document
      .querySelector('[data-tree-path] span[contenteditable="true"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await t.sleep(200);
  };
  /** Makes a folder with the app, and answers its path. */
  const makeFolder = async () => {
    const before = new Set(await namesIn(workspace));
    await ops.runTreeAction('new-folder', entry(workspace, 'workspace', false));
    await t.sleep(300);
    await settle();
    const created = (await namesIn(workspace)).find((name) => !before.has(name));
    return created ? `${workspace}/${created}` : null;
  };
  let first = null;
  let second = null;
  try {
    first = await makeFolder();
    second = await makeFolder();
    check(
      'the app made two folders of its own to work with',
      first !== null && second !== null && rowFor(first) !== null && rowFor(second) !== null,
      { first, second, rows: [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath).slice(-4) }
    );
    // The page's own identity: a reload of the page is a page without this mark.
    window.__treeNoReloadMark = `set at ${Date.now()}`;
    // And the way a tree row could reload the page is closed as well: a row is not a
    // native drag source, so the webview cannot take the press over or navigate to a path
    // a drop carried.
    const row = rowFor(second);
    const dragstart = new DragEvent('dragstart', { bubbles: true, cancelable: true });
    row?.dispatchEvent(dragstart);
    check(
      'a row refuses to be a native drag source',
      row !== null &&
        row.draggable === false &&
        dragstart.defaultPrevented &&
        getComputedStyle(row).getPropertyValue('-webkit-user-drag') === 'none',
      {
        draggable: row?.draggable ?? null,
        prevented: dragstart.defaultPrevented,
        userDrag: row ? getComputedStyle(row).getPropertyValue('-webkit-user-drag') : null
      }
    );
    // The move, through the operation the drag runs.
    await ops.dropEntry(entry(second, second.slice(second.lastIndexOf('/') + 1), false), first);
    // Long enough for a watcher to have answered the file change with a page reload.
    await t.sleep(1500);
    check(
      'the page it happened on is still the page it is running in',
      typeof window.__treeNoReloadMark === 'string',
      window.__treeNoReloadMark ?? null
    );
    check(
      'the folder moved on the disk, and the tree still shows it inside the other',
      (await namesIn(first)).length === 1 && rowFor(`${first}/${second.slice(second.lastIndexOf('/') + 1)}`) !== null,
      { first: await namesIn(first), rows: [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath).slice(-4) }
    );
  } finally {
    // One delete takes both: the second folder is inside the first by now.
    try {
      await files.deleteEntry(first ?? '');
    } catch {
      // Already gone, or it was never made.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
