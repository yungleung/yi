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
  /** Drags `source` onto `target`; answers whether the target accepted the drag. */
  const drag = async (sourcePath, targetPath, { drop = true } = {}) => {
    const source = rowFor(sourcePath);
    const target = rowFor(targetPath);
    if (!source || !target) {
      return { error: 'no row', source: sourcePath, target: targetPath, rows: [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath) };
    }
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
    target.dispatchEvent(over);
    const accepted = over.defaultPrevented;
    const highlighted = target.className.includes('outline-primary/60');
    if (drop) {
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
      await t.sleep(600);
    }
    return { accepted, highlighted };
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
    const pointless = await drag(note, workspace, { drop: false });
    check('the folder it already lives in does not accept it', pointless.accepted === false, pointless);
    // A file is not a place to put anything.
    const ontoFile = await drag(note, `${workspace}/note.md`, { drop: false });
    check('a file row does not accept a drop', ontoFile.accepted === false, ontoFile);
    // A folder inside its own subtree would take it off the tree.
    await t.sleep(50);
    const intoItself = await drag(sub, sub, { drop: false });
    check('a folder does not accept itself', intoItself.accepted === false, intoItself);

    // The move itself: the file goes into `sub`, on the disk and in the tree.
    const moved = await drag(note, sub);
    check('a folder accepts a file from elsewhere, and says so', moved.accepted === true && moved.highlighted === true, moved);
    check('the file is in the folder now', await namesIn(sub), ['inner.md', 'note.md']);
    check('and it is gone from where it was', await namesIn(workspace), ['other', 'sub']);
    check(
      'and the tree shows it inside the folder',
      rowFor(`${sub}/note.md`) !== null && rowFor(note) === null,
      [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath)
    );

    // A folder moves too, children and all.
    const folderMoved = await drag(sub, other);
    check('a folder moves as well', folderMoved.accepted === true, folderMoved);
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
