/**
 * Renaming a row where it sits: the name becomes editable, the tree does not move, and
 * the edit starts with the name — not the extension — selected.
 *
 * Those are the user's two requirements, as measurements. The tree's own geometry (the
 * container's scroll width and every row's rectangle) is compared before and during the
 * edit; and the selection is read off the browser, so "the name without the extension" is
 * asserted as the text that would be typed over.
 *
 * A synthetic key event cannot type into a contenteditable at all — an untrusted key does
 * not insert text (`docs/testing.md`) — so the probe types the way the browser does,
 * through `document.execCommand('insertText', …)`.
 *
 * The probe makes its own workspace under `/private/tmp` with the app's own commands and
 * removes it again: the repository's fixtures are not a test's to rename.
 *
 * @covers src/ui/workspace/tree_rename.ts, src/ui/workspace/tree_rules.ts,
 *   src/ui/workspace/tree.ts, src/ui/workspace/tree_ops.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const ops = await t.app('/src/ui/workspace/tree_ops.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const workspace = '/private/tmp/yi-tree-rename-probe';
  const rename = (path, basename) => ops.runTreeAction('rename', { path, basename, isFile: true });
  const rowFor = (path) => document.querySelector(`[data-tree-path="${path}"]`);
  const labelFor = (path) => rowFor(path)?.querySelector('span.truncate') ?? null;
  /** The tree's geometry: the requirement "it should not affect the tree's layout". */
  const geometry = () => ({
    scrollWidth: Math.round(document.querySelector('[data-workspace-tree]')?.scrollWidth ?? 0),
    rows: [...document.querySelectorAll('[data-tree-path]')].map((row) => {
      const rect = row.getBoundingClientRect();
      return [
        row.dataset.treePath,
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height)
      ];
    })
  });
  const pressKey = (label, key) =>
    label?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const names = async () => (await files.listFolderFiles(workspace)).map((entry) => entry.basename).sort();
  const expected = ['other.md', 'renamed.md', 'sub'];
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off; it is about to be replaced.
    }
    await files.createEntry('/private/tmp', 'yi-tree-rename-probe', false);
    await files.createEntry(workspace, 'note.md', true);
    await files.createEntry(workspace, 'other.md', true);
    await files.createEntry(workspace, 'sub', false);
    previous = await t.openWorkspace(workspace);
    check(
      'the tree shows the probe workspace',
      rowFor(`${workspace}/note.md`) !== null,
      [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath)
    );

    // The rename, started the way the menu's item starts it.
    const before = geometry();
    await rename(`${workspace}/note.md`, 'note.md');
    await t.sleep(300);
    const label = labelFor(`${workspace}/note.md`);
    check('the row`s name is editable where it sits', label?.isContentEditable === true, label?.outerHTML?.slice(0, 90) ?? null);
    check('and it has the keyboard focus', document.activeElement === label, document.activeElement?.tagName ?? null);
    const selected = window.getSelection() ? window.getSelection().toString() : '';
    check('the edit starts with the name selected, without the extension', selected === 'note', selected);
    const radius = label ? getComputedStyle(label).borderRadius : null;
    check('and the editable name keeps square corners', radius === '0px', radius);
    const during = geometry();
    check(
      'and the tree`s layout is exactly what it was',
      JSON.stringify(during) === JSON.stringify(before),
      { during, before }
    );

    // Typing over the selection leaves the extension alone.
    document.execCommand('insertText', false, 'renamed');
    await t.sleep(200);
    check('typing replaces the name and keeps the extension', label?.textContent === 'renamed.md', label?.textContent ?? null);
    const typed = geometry();
    check('and the tree still has not moved', JSON.stringify(typed) === JSON.stringify(before), { typed, before });

    // Enter commits: the disk and the tree both have the new name.
    pressKey(label, 'Enter');
    await t.sleep(700);
    check('the file is renamed on disk', await names(), expected);
    check(
      'and the tree shows the new name, not the old one',
      rowFor(`${workspace}/renamed.md`) !== null && rowFor(`${workspace}/note.md`) === null,
      [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath)
    );

    // Escape drops the edit: nothing is renamed.
    await rename(`${workspace}/renamed.md`, 'renamed.md');
    await t.sleep(300);
    const second = labelFor(`${workspace}/renamed.md`);
    document.execCommand('insertText', false, 'gone');
    pressKey(second, 'Escape');
    await t.sleep(400);
    check('Escape puts the old name back and renames nothing', await names(), expected);
    check('and the row shows the name the disk has', labelFor(`${workspace}/renamed.md`)?.textContent === 'renamed.md', labelFor(`${workspace}/renamed.md`)?.textContent ?? null);

    // A click inside the editable name is the author placing the caret, not opening the
    // file — judged by the app's own event, because reading the document (`t.raw`) is a
    // Select All and would take the selection (and the edit) away from the tree.
    const events = await t.app('/src/services/event_manager.ts');
    let opened = 0;
    const countOpen = () => {
      opened += 1;
    };
    await events.eventManager.on('document_opened', countOpen);
    await rename(`${workspace}/renamed.md`, 'renamed.md');
    await t.sleep(250);
    const third = labelFor(`${workspace}/renamed.md`);
    const editable = third?.isContentEditable === true;
    third?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await t.sleep(400);
    events.eventManager.off('document_opened', countOpen);
    check(
      'a click inside the name does not open the file',
      editable && opened === 0,
      { editable, opened }
    );
    pressKey(labelFor(`${workspace}/renamed.md`), 'Escape');
    await t.sleep(250);
  } finally {
    await t.restoreWorkspace(previous);
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
