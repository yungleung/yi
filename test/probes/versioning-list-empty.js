/**
 * What the panel says instead of a list, in each of the four states it can be in.
 *
 * A reader who has agreed to versions but has nothing to see is owed the reason: their note has no
 * file yet, nothing has made a repository here, this note has no versions, or the read itself
 * failed. Each one is walked here — the last by pointing the app's git seam at a git that is not
 * there, which is the only way a probe can make a read fail.
 *
 * @covers src/ui/versioning/versions_panel.ts, src/services/versions.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { pointAtGit, initWorkspaceRepository, commitPaths } = await t.app('/src/api/versioning.ts');
  const { APP_IDENTITY } = await t.app('/src/services/versioning.ts');
  const { versionsOfDocument } = await t.app('/src/services/versions.ts');
  const { t: words } = await t.app('/src/services/i18n.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-version-list-empty`;
  const note = `${folder}/note.md`;
  const other = `${folder}/other.md`;
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
  const panelUp = () => {
    let node = document.querySelector('[data-version-list]');
    if (node === null) {
      return false;
    }
    while (node !== null) {
      if (node.classList?.contains('hidden')) {
        return false;
      }
      node = node.parentElement;
    }
    return true;
  };
  /** Opens the panel if it is closed, and reads the sentence it is showing. */
  const sentence = async () => {
    if (!panelUp()) {
      document.querySelector('[data-version-status]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
      for (let attempt = 0; attempt < 40 && !panelUp(); attempt += 1) {
        await t.sleep(40);
      }
    }
    await t.sleep(150);
    const said = document.querySelector('[data-version-empty]');
    return {
      state: said?.getAttribute('data-version-state') ?? null,
      words: said?.textContent ?? null
    };
  };
  const settle = async () => {
    await versionsOfDocument.reread();
    await t.sleep(120);
    return await sentence();
  };

  const before = await config();
  const sessionText = await invoke('load_session');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-version-list-empty', false);
    await files.createEntry(folder, 'note.md', true);
    await t.openWorkspace(folder);
    await configManager.update({ versioning: true, versioning_workspace: folder });

    // 1. A document with no file at all: nothing to read, and the sentence says why.
    await open(null, 'A note with no file.\n');
    const noFile = await settle();
    check(
      'a note with no file says so',
      noFile.state === 'no-file' && noFile.words === words('version.noFile'),
      noFile
    );

    // 2. The note on disk, in a folder nothing has made a repository in.
    await open(note, 'The note.\n');
    const noRepository = await settle();
    check(
      'a workspace nothing has made a repository in says so',
      noRepository.state === 'no-repository' &&
        noRepository.words === words('version.noRepository'),
      noRepository
    );

    // 3. A repository whose history does not hold *this* note.
    await initWorkspaceRepository(folder, false);
    await files.writeTextAtomically(other, 'Another note.\n');
    await commitPaths(folder, [other], 'Another note', APP_IDENTITY);
    const empty = await settle();
    check(
      'a note with no versions of its own says so',
      empty.state === 'ready' && empty.words === words('version.empty'),
      empty
    );

    // 4. A read that fails: the app is pointed at a git that is not there.
    await pointAtGit(`${folder}/git-that-is-not-there`);
    const unreadable = await settle();
    check(
      'and a read that fails says that instead of pretending there are none',
      unreadable.state === 'unreadable' && unreadable.words === words('version.unreadable'),
      unreadable
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
