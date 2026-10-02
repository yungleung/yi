/**
 * Going back to a version: the file holds it, the document on screen is it, and the text that was
 * there is in the stack because the reader said so.
 *
 * The text on screen is *edited* first (a keystroke through the editor's own key path), so the
 * session's own question is the one that has to be answered — and answering it "push and open" is
 * what puts the old text in the stack. What the restore does to the repository is
 * `versioning-fake-git.js`'s business: it runs `show` and nothing else.
 *
 * @covers src/services/session.ts (openVersion), src/ui/versioning/version_diff_view.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { initWorkspaceRepository, commitPaths } = await t.app('/src/api/versioning.ts');
  const { APP_IDENTITY } = await t.app('/src/services/versioning.ts');
  const { versionsOfDocument } = await t.app('/src/services/versions.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-version-restore`;
  const note = `${folder}/note.md`;
  const config = () => invoke('get_config');
  const open = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    await t.sleep(140);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
    await pending;
    await t.sleep(140);
  };
  const before = await config();
  const sessionText = await invoke('load_session');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-version-restore', false);
    await files.createEntry(folder, 'note.md', true);
    await t.openWorkspace(folder);
    await configManager.update({ versioning: true, versioning_workspace: folder });
    await initWorkspaceRepository(folder, false);
    await files.writeTextAtomically(note, 'one\ntwo\nthree\n');
    await commitPaths(folder, [note], 'The note · 2026-10-02 10:00', APP_IDENTITY);
    await files.writeTextAtomically(note, 'one\nTWO\nthree\n');
    await open(note, 'one\nTWO\nthree\n');
    // An edit through the editor's own key path, so the text on screen is not what its file holds
    // and the session's question is owed.
    t.key('X');
    await t.sleep(250);
    await versionsOfDocument.reread();
    await t.sleep(200);
    check(
      'the probe edited the text on screen, and its file does not hold it',
      session.documentSession.current()?.content.startsWith('X') === true &&
        (await read(note)) === 'one\nTWO\nthree\n',
      { content: session.documentSession.current()?.content ?? null, file: await read(note) }
    );

    document.querySelector('[data-version-status]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await t.sleep(300);
    const row = document.querySelector('[data-version-row]');
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await t.sleep(400);
    document.querySelector('[data-version-diff-restore]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await t.sleep(300);
    // The session's own question, answered the way a reader answers it when they want it kept.
    const prompt = document.querySelector('[data-prompt]');
    const asked = prompt !== null && !prompt.classList.contains('hidden');
    prompt?.querySelector('[data-prompt-yes]')?.click();
    await t.sleep(400);

    const current = session.documentSession.current();
    check('restoring asks the session’s own question first', asked, { asked });
    check(
      'and the file holds the version’s text again',
      (await read(note)) === 'one\ntwo\nthree\n',
      await read(note)
    );
    check(
      'and the document on screen is that text, with its file believed to hold it',
      current?.content === 'one\ntwo\nthree\n' && current?.saved === 'one\ntwo\nthree\n',
      { content: current?.content ?? null, saved: current?.saved ?? null }
    );
    check(
      'and what was on screen is in the stack, because the reader said to keep it',
      session.documentSession.stack().some((held) => held.content.startsWith('X')),
      session.documentSession.stack().map((held) => held.content.slice(0, 12))
    );
    check(
      'and the app says the document is saved',
      document.querySelector('[data-document-saved]')?.getAttribute('data-saved') === 'true',
      document.querySelector('[data-document-saved]')?.getAttribute('data-saved') ?? null
    );
  } finally {
    await t.restoreWorkspace(before);
    if (sessionText !== null) {
      await invoke('save_session', { session: sessionText });
    }
    await session.documentSession.load();
    await t.sleep(120);
    try {
      await files.deleteEntry(folder);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
