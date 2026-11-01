/**
 * The drags the tree refuses: a file is not a place to put anything, a folder is not a
 * target for itself, and the folder an entry already lives in is not a move.
 *
 * A refusal is the pointer's business as much as the disk's: the row must not show itself
 * as a target, and nothing may move either. The drag is driven with the pointer's own
 * events, which is what the tree listens for (`tree_drag.ts`).
 *
 * The probe makes its own workspace under `/private/tmp` with the app's own commands and
 * removes it again.
 *
 * @covers src/ui/workspace/tree/drag.ts, src/ui/workspace/tree/rules.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const workspace = '/private/tmp/yi-tree-drag-refusal-probe';
  const sub = `${workspace}/sub`;
  const note = `${workspace}/note.md`;
  const rowFor = (path) => document.querySelector(`[data-tree-path="${path}"]`);
  const namesIn = async (folder) => (await files.listFolderFiles(folder)).map((item) => item.basename).sort();
  /** Drags `sourcePath`'s row onto `targetPath`'s row and answers whether it glowed. */
  const drag = async (sourcePath, targetPath) => {
    const source = rowFor(sourcePath);
    const target = rowFor(targetPath);
    if (!source || !target) {
      return {
        error: 'no row',
        sourcePath,
        targetPath,
        rows: [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath)
      };
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
    move(from.x + 6, from.y + 6);
    move(to.x, to.y);
    const highlighted = target.className.includes('outline-primary/60');
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: to.x, clientY: to.y }));
    await t.sleep(200);
    return { highlighted };
  };
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry('/private/tmp', 'yi-tree-drag-refusal-probe', false);
    await files.createEntry(workspace, 'note.md', true);
    await files.createEntry(workspace, 'sub', false);
    await files.createEntry(sub, 'inner.md', true);
    previous = await t.openWorkspace(workspace);

    const pointless = await drag(note, workspace);
    check('the folder it already lives in is not a target', pointless.highlighted === false, pointless);
    const ontoFile = await drag(note, note);
    check('a file row is not a target', ontoFile.highlighted === false, ontoFile);
    const intoItself = await drag(sub, sub);
    check('a folder is not a target for itself', intoItself.highlighted === false, intoItself);
    check('and nothing moved in any of them', await namesIn(workspace), ['note.md', 'sub']);
    check('nor inside the folder', await namesIn(sub), ['inner.md']);
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
