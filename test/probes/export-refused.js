/**
 * The export that does not happen, and what the reader is told about it.
 *
 * Two ways an export stops, and neither writes a file:
 *
 * - **the machine has no pandoc.** The card still opens — the kinds are the app's, and the reader
 *   may want to look at the conversion settings — but it says what is missing, and the button that
 *   would run it cannot be pressed. The app is pointed at a name that is not there through its own
 *   seam (`export_use_pandoc`), which is the *only* way to ask a machine without one.
 * - **pandoc refuses.** The fake pandoc beside this probe fails when the output path says
 *   `refuse`, with a sentence on its stderr, and that sentence is what the reader gets: a message in
 *   the corner, which waits for them (`docs/ai-context.md` — a failure needs attention, and the
 *   backend's own words are the useful ones). The scratch note the app wrote for pandoc is deleted
 *   however the call ended, so a refused export leaves nothing of the reader's text behind.
 *
 * @covers src-tauri/src/export.rs (find_pandoc, run_export), src/ui/export/export_flow.ts (the
 *   failure), src/ui/export/export_dialog.ts (a kind that cannot run)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const api = await t.app('/src/api/export.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const readText = async (path) => {
    const read = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read));
  };
  const exists = async (path) => {
    try {
      return await invoke('plugin:fs|exists', { path });
    } catch {
      return false;
    }
  };
  const until = async (ready, tries = 60) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-export-refused`;
  const recorder = `${home}/yi-probe-fake-pandoc`;
  const notePath = `${folder}/note.md`;
  const refusedTarget = `${folder}/refuse.docx`;
  const note = '# A note that will not go out\n\nA [[other]] too.\n';

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
  const askForExport = async () => {
    await invoke('plugin:event|emit', { event: 'export', payload: null });
    return await until(() => open(), 60);
  };
  const show = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    await sleep(150);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
    await pending;
    await sleep(200);
  };

  const before = await invoke('get_config');
  try {
    for (const stale of [folder, recorder]) {
      try {
        await files.deleteEntry(stale);
      } catch {
        // A folder a run the bridge cut off left behind.
      }
    }
    await files.createEntry(home, 'yi-probe-export-refused', false);
    await files.createEntry(folder, 'note.md', true);
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await show(notePath, note);

    // --- a machine with no pandoc ---------------------------------------------------------------

    await api.pointAtPandoc('/definitely/not/pandoc');
    check('a machine with no pandoc is answered by the app as such', (await api.exportKinds()).pandoc === null, {
      pandoc: (await api.exportKinds()).pandoc
    });
    check('and the card still opens', await askForExport(), { open: open() });
    const status = card()?.querySelector('[data-export-status]')?.textContent ?? '';
    const run = card()?.querySelector('[data-export-run]');
    check(
      'which says what is missing rather than offering a button that would fail',
      status.includes('pandoc') && run?.disabled === true,
      { status, disabled: run?.disabled ?? null }
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);
    check('and nothing was written', !(await exists(refusedTarget)), { open: open() });

    // --- a pandoc that refuses ------------------------------------------------------------------

    await api.pointAtPandoc(`${window.__probePaths.checkout}test/probes/fake-pandoc.sh`);
    await askForExport();
    document.querySelector('[data-export-target]').value = refusedTarget;
    document.querySelector('[data-export-run]').click();
    const complained = await until(() => document.querySelector('[data-message]') !== null);
    const message = document.querySelector('[data-message] [data-message-text]')?.textContent ?? '';
    check(
      'when pandoc refuses, the reader gets pandoc’s own sentence as a message',
      complained && message.includes('the fake pandoc refuses'),
      message
    );
    check(
      'and the file the reader asked for is not there',
      !(await exists(refusedTarget)),
      { written: await exists(refusedTarget) }
    );
    const argv = await readText(`${recorder}/argv.log`);
    const scratch = argv.trim().split('\n').at(-1) ?? '';
    check(
      'and the note the app wrote for it is deleted all the same',
      scratch.endsWith('.md') && !(await exists(scratch)),
      { scratch, stillThere: await exists(scratch) }
    );
  } finally {
    await api.pointAtPandoc(null);
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
    for (const stale of [folder, recorder]) {
      try {
        await files.deleteEntry(stale);
      } catch {
        // Nothing to tidy.
      }
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
