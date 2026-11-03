/**
 * The versions button at the left of the status bar: there only where the reader agreed, saying
 * what is newest, and reading nothing at all where they did not.
 *
 * The second half is what the recorder is for (`test/probes/fake-git.sh`): with the app pointed at
 * it, a workspace whose answer is *no* must leave its log empty — that is the reader's rule, not a
 * detail — while a workspace whose answer is *yes* reads for real.
 *
 * @covers src/ui/status_bar/version.ts, src/services/versioning/versions.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { pointAtGit, initWorkspaceRepository, commitPaths, versioningHistory } = await t.app(
    '/src/api/versioning.ts'
  );
  const { APP_IDENTITY, versionStamp } = await t.app('/src/services/versioning/index.ts');
  const { versionsOfDocument } = await t.app('/src/services/versioning/index.ts');
  const { t: words } = await t.app('/src/services/i18n.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-version-status`;
  const note = `${folder}/note.md`;
  const log = `${home}/yi-probe-fake-git/argv.log`;
  const button = () => document.querySelector('[data-version-status]');
  const hidden = () => button()?.classList.contains('hidden') ?? true;
  const label = () => button()?.querySelector('[data-version-status-label]')?.textContent ?? null;
  const config = () => invoke('get_config');
  /** Opens a note through the session, declining the question a replaced document may raise. */
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
    try {
      // The recorder's own folder, so its log starts empty for this probe.
      await files.deleteEntry(`${home}/yi-probe-fake-git`);
    } catch {
      // Nothing there.
    }
    await files.createEntry(home, 'yi-probe-version-status', false);
    await files.createEntry(folder, 'note.md', true);
    await t.openWorkspace(folder);
    // The list is read for the document *on screen*, so the probe's own note has to be there first.
    await open(note, 'A note with one version.\n');

    // 1. Saying no (or never having answered) hides the button, and nothing reads git.
    await pointAtGit(`${window.__probePaths.checkout}test/probes/fake-git.sh`);
    await configManager.update({ versioning: false, versioning_workspace: folder });
    await versionsOfDocument.reread();
    await t.sleep(200);
    const wroteNothing = await read(log).then(
      (text) => text.trim() === '',
      () => true
    );
    check(
      'a workspace the reader said no to shows no button, and runs no git',
      hidden() && wroteNothing,
      { hidden: hidden(), wroteNothing }
    );
    await pointAtGit(null);

    // 2. Agreeing shows it, and with nothing to read it says so.
    await configManager.update({ versioning: true, versioning_workspace: folder });
    await versionsOfDocument.reread();
    await t.sleep(200);
    check(
      'and one they agreed to shows it, saying there are no versions yet',
      !hidden() && label() === words('version.none'),
      { hidden: hidden(), label: label() }
    );
    // The stamp sits in the status bar's own row of words, so it is their size and their weight —
    // a `btn`'s 16px/semibold shouted over everything else in the bar (measured, on the reader's
    // report).
    const stampStyle = getComputedStyle(document.querySelector('[data-version-status-label]'));
    const neighbourStyle = getComputedStyle(document.querySelector('[data-document-saved]'));
    check(
      'and its stamp is drawn the size and weight of the status bar’s other words',
      stampStyle.fontSize === neighbourStyle.fontSize &&
        stampStyle.fontWeight === neighbourStyle.fontWeight,
      {
        stamp: { size: stampStyle.fontSize, weight: stampStyle.fontWeight },
        neighbour: { size: neighbourStyle.fontSize, weight: neighbourStyle.fontWeight }
      }
    );

    // 3. A version made through the app's own commands is what the button says.
    await initWorkspaceRepository(folder, false);
    await files.writeTextAtomically(note, 'A note with one version.\n');
    await commitPaths(folder, [note], 'note · 2026-10-01 20:15', APP_IDENTITY);
    const [row] = await versioningHistory(folder, note, 1);
    await versionsOfDocument.reread();
    await t.sleep(200);
    check(
      'and the newest version’s stamp is what it reads',
      row !== undefined && label() === versionStamp(row.at),
      { label: label(), stamp: row === undefined ? null : versionStamp(row.at) }
    );
    // A keystroke makes the text on screen differ from every version, and the button says so instead
    // of showing a stamp that no longer describes what is there.
    t.key('X');
    await t.sleep(250);
    check(
      'and a text that is not in a version says so, rather than showing the stamp',
      label() === words('version.unversioned'),
      { label: label(), content: session.documentSession.current()?.content.slice(0, 8) ?? null }
    );
  } finally {
    await pointAtGit(null);
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
