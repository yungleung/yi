/**
 * The wikilink index follows the workspace's files: a note made, saved, renamed and deleted is
 * seen by the next question, without reopening the workspace.
 *
 * `documentManager` keeps a lazy catalogue, name index, id index and title cache. Each mutation
 * in the app has to invalidate them; this drives the app's own create, save, rename and delete
 * paths and asks the manager after each one.
 *
 * @covers src/services/documents/index.ts (invalidate, documents, resolve),
 *   src/ui/new_document/new_document_flow.ts, src/ui/workspace/tree/ops.ts,
 *   src/services/session/index.ts (writeDocument)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const flow = await t.app('/src/ui/new_document/new_document_flow.ts');
  const ops = await t.app('/src/ui/workspace/tree/ops.ts');
  const session = (await t.app('/src/services/session/index.ts')).documentSession;
  const { documentManager } = await t.app('/src/services/documents/index.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const workspace = `${home}/yi-probe-index-refresh`;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const entry = (path, basename, isFile) => ({ path, basename, isFile });
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const listing = async () =>
    (await files.listFolderFiles(workspace)).filter((item) => item.basename.endsWith('.md'));
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a cut-off run.
    }
    await files.createEntry(home, 'yi-probe-index-refresh', false);
    previous = await t.openWorkspace(workspace);
    check(
      'a new workspace starts with no documents',
      (await documentManager.documents()).length === 0,
      await documentManager.documents()
    );

    let done = false;
    void flow.newDocument(workspace, undefined, { choose: async () => null }).then(() => {
      done = true;
    });
    for (let attempt = 0; attempt < 60 && !done; attempt += 1) {
      const card = document.querySelector('[data-prompt]');
      if (card && !card.classList.contains('hidden')) {
        card.querySelector('[data-prompt-yes]')?.click();
      }
      await t.sleep(100);
    }
    await t.sleep(400);
    const made = (await listing())[0];
    const id = made?.basename.replace(/\.md$/, '') ?? null;
    const created = await documentManager.documents();
    check(
      'a note made through the app is in the index at once',
      created.length === 1 && created[0]?.target === id,
      { id, created }
    );

    const before = await read(made.path);
    await t.load(before.replace(/^title: .*$/m, 'title: The renamed note'));
    await t.sleep(250);
    session.noteMoved();
    await session.save();
    await t.sleep(400);
    const saved = await documentManager.documents();
    check(
      'and a saved title is the one the index gives',
      saved.length === 1 && saved[0]?.title === 'The renamed note',
      saved
    );

    await ops.renameEntryTo(entry(made.path, made.basename, true), 'renamed.md');
    await t.sleep(400);
    const renamed = await documentManager.documents();
    check(
      'a rename keeps its id and title in the index',
      renamed.length === 1 && renamed[0]?.target === id && renamed[0]?.title === 'The renamed note',
      renamed
    );
    check(
      'and the new file name resolves',
      (await documentManager.resolve('renamed')) === `${workspace}/renamed.md`,
      await documentManager.resolve('renamed')
    );
    check('and so does its id', (await documentManager.resolve(id)) === `${workspace}/renamed.md`, id);

    await ops.deleteNow(entry(`${workspace}/renamed.md`, 'renamed.md', true));
    await t.sleep(400);
    check(
      'a deleted note leaves the index',
      (await documentManager.documents()).length === 0,
      await documentManager.documents()
    );
    check(
      'and its name no longer resolves',
      (await documentManager.resolve('renamed')) === null,
      await documentManager.resolve('renamed')
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
