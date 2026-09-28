/**
 * The tree's "New file" and "New folder": a new note is written inside the clicked folder,
 * named after the id the app generated and carrying the frontmatter it opens with, while a
 * new folder is made and left ready to be named where it sits.
 *
 * The menu is native and nothing but a person can choose an item of it (`docs/testing.md`), so
 * the *contents* are held by `check-tree-menu.mjs` and the action is driven here through
 * `tree_ops.ts`, the module the menu's items run — which is also the module that hands a new
 * note to the app's own command (`file:newMarkdown`).
 *
 * The workspace is the probe's own, at `~/yi-probe-tree-create`: the app writes a new note
 * through the file plugin, which is scoped to the home directory (see `new-markdown.js`), and
 * the home directory is not watched by the dev server. It is removed again either way.
 *
 * @covers src/ui/workspace/tree_ops.ts, src/api/files.ts, src/ui/new_document/new_document_flow.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const ops = await t.app('/src/ui/workspace/tree_ops.ts');
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const workspace = `${home}/yi-probe-tree-create`;
  const sub = `${workspace}/sub`;
  const stamp = /^\d{14}\.md$/;
  const entry = (path, basename, isFile) => ({ path, basename, isFile });
  const namesIn = async (folder) =>
    (await files.listFolderFiles(folder)).map((item) => item.basename).sort();
  /** The row a path has, and the label inside it. */
  const labelFor = (path) => document.querySelector(`[data-tree-path="${path}"] span.truncate`) ?? null;
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  /** The session asks before it replaces a document that is not in the stack; this answers. */
  const answerPrompt = async () => {
    const card = document.querySelector('[data-prompt]');
    if (card && !card.classList.contains('hidden')) {
      card.querySelector('[data-prompt-yes]')?.click();
      await t.sleep(250);
    }
  };
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-tree-create', false);
    await files.createEntry(workspace, 'sub', false);
    await files.createEntry(sub, 'inner.md', true);
    previous = await t.openWorkspace(workspace);
    // The folder the notes go in is unfolded, so the rows they make can be looked at.
    document.querySelector(`[data-tree-path="${sub}"]`)?.click();
    await t.sleep(300);

    await ops.runTreeAction('new-file', entry(sub, 'sub', false));
    await t.sleep(350);
    await answerPrompt();
    await t.sleep(250);
    const first = (await namesIn(sub)).filter((name) => stamp.test(name));
    check('a new file is written inside the clicked folder, named after the generated id', first.length, 1);
    const firstText = first.length > 0 ? await read(`${sub}/${first[0]}`) : '';
    check(
      'holding the frontmatter of a new note',
      /^---\ntitle: Untitle\ndate: \d{4}-\d{2}-\d{2}\nid: \d{14}\nkeywords: untagged\n---\n\n$/.test(firstText),
      firstText
    );
    check(
      'the tree does not open its name for editing: the file is named, the title is what is typed',
      labelFor(`${sub}/${first[0]}`)?.isContentEditable !== true,
      labelFor(`${sub}/${first[0]}`)?.outerHTML ?? null
    );
    check(
      'and the note opens with its title selected, ready to be typed over',
      caret.getSelectionRange()?.toString() ?? null,
      'Untitle'
    );

    await ops.runTreeAction('new-file', entry(sub, 'sub', false));
    await t.sleep(350);
    await answerPrompt();
    await t.sleep(250);
    const second = (await namesIn(sub)).filter((name) => stamp.test(name) && name !== first[0]);
    check('a second new file gets an id of its own', second.length, 1);
    check('and the first note is still there', (await namesIn(sub)).includes(first[0]), await namesIn(sub));

    await ops.runTreeAction('new-folder', entry(sub, 'sub', false));
    await t.sleep(250);
    check('a new folder is made inside it too', (await namesIn(sub)).includes('New folder'), await namesIn(sub));
    check(
      'and a new folder is left ready to be named as well',
      labelFor(`${sub}/New folder`)?.isContentEditable === true,
      labelFor(`${sub}/New folder`)?.outerHTML?.slice(0, 90) ?? null
    );
    // The rename is cancelled rather than committed: this probe is about what a create does,
    // and a name left half-typed would be a change of its own.
    labelFor(`${sub}/New folder`)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await t.sleep(200);
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
