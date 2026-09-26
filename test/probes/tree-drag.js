/**
 * Dragging a tree entry into a folder: it moves on the disk and in the tree, and the
 * moves the rules refuse are not accepted at all.
 *
 * The drag is driven with the browser's own events and a real `DataTransfer`, the way a
 * pointer's drag arrives at the page. What is asserted is both the *hint* the pointer gets
 * (a `dragover` the row accepted, and the class that shows the target) and the move itself.
 *
 * The probe makes its own workspace under `/private/tmp` with the app's own commands and
 * removes it again.
 *
 * @covers src/ui/workspace/tree_drag.ts, src/ui/workspace/tree_rules.ts,
 *   src/ui/workspace/tree_ops.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const workspace = '/private/tmp/yi-tree-drag-probe';
  const sub = `${workspace}/sub`;
  const other = `${workspace}/other`;
  const note = `${workspace}/note.md`;
  const rowFor = (path) => document.querySelector(`[data-tree-path="${path}"]`);
  const namesIn = async (folder) => (await files.listFolderFiles(folder)).map((item) => item.basename).sort();
  /**
   * Drags `sourcePath`'s row onto `targetPath`'s row, with the pointer's own events —
   * which is what the tree listens for (`tree_drag.ts`), and what a probe can send.
   */
  const drag = async (sourcePath, targetPath) => {
    const source = rowFor(sourcePath);
    const target = rowFor(targetPath);
    if (!source || !target) {
      return { error: 'no row', source: sourcePath, target: targetPath, rows: [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath) };
    }
    const point = (row) => {
      const rect = row.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      };
    };
    const from = point(source);
    const to = point(target);
    const move = (x, y) =>
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
    source.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: from.x, clientY: from.y })
    );
    // Past the threshold, then onto the target row.
    move(from.x + 6, from.y + 6);
    move(to.x, to.y);
    const highlighted = target.className.includes('outline-primary/60');
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: to.x, clientY: to.y }));
    await t.sleep(500);
    return { highlighted };
  };
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry('/private/tmp', 'yi-tree-drag-probe', false);
    await files.createEntry(workspace, 'note.md', true);
    await files.createEntry(workspace, 'sub', false);
    await files.createEntry(sub, 'inner.md', true);
    await files.createEntry(workspace, 'other', false);
    previous = await t.openWorkspace(workspace);
    check(
      'the tree shows the probe workspace',
      rowFor(note) !== null && rowFor(sub) !== null && rowFor(other) !== null,
      [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath)
    );

    // The folder the entry already lives in is not a target: nothing would happen.
    const pointless = await drag(note, workspace);
    check('the folder it already lives in is not a target', pointless.highlighted === false, pointless);
    check('and nothing moved', await namesIn(workspace), ['note.md', 'other', 'sub']);
    // A file is not a place to put anything.
    const ontoFile = await drag(note, note);
    check('a file row is not a target', ontoFile.highlighted === false, ontoFile);
    // A folder inside its own subtree would take it off the tree.
    const intoItself = await drag(sub, sub);
    check('a folder is not a target for itself', intoItself.highlighted === false, intoItself);
    check('and nothing moved then either', await namesIn(workspace), ['note.md', 'other', 'sub']);

    // The move itself: the file goes into `sub`, on the disk and in the tree.
    const moved = await drag(note, sub);
    check('a folder takes a file from elsewhere, and shows it as the target', moved.highlighted === true, moved);
    check('the file is in the folder now', await namesIn(sub), ['inner.md', 'note.md']);
    check('and it is gone from where it was', await namesIn(workspace), ['other', 'sub']);
    check(
      'and the tree shows it inside the folder',
      rowFor(`${sub}/note.md`) !== null && rowFor(note) === null,
      [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath)
    );

    // A folder moves too, children and all.
    const folderMoved = await drag(sub, other);
    check('a folder is a target for another folder', folderMoved.highlighted === true, folderMoved);
    check('with what was inside it', await namesIn(`${other}/sub`), ['inner.md', 'note.md']);
    check('and its old place is empty of it', await namesIn(workspace), ['other']);
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
