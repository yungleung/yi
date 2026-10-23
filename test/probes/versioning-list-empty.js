/**
 * The four states in which the history button has nothing to open.
 *
 * A reader who has agreed to versions but has nothing to see gets no modal: their note has no file
 * yet, nothing has made a repository here, this note has no versions, or the read itself failed.
 * Each one is walked here — the last by pointing the app's git seam at a git that is not there,
 * which is the only way a probe can make a read fail.
 *
 * @covers src/ui/versioning/version_history_modal.ts, src/services/versions.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { pointAtGit, initWorkspaceRepository, commitPaths } = await t.app('/src/api/versioning.ts');
  const { APP_IDENTITY } = await t.app('/src/services/versioning.ts');
  const { versionsOfDocument } = await t.app('/src/services/versions.ts');
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
  const surfaceUp = (node) => {
    while (node !== null) {
      if (node.classList?.contains('hidden')) {
        return false;
      }
      node = node.parentElement;
    }
    return true;
  };
  const historySurfaceUp = () => {
    return [...document.querySelectorAll(
      '[data-version-history], [data-version-list], [data-version-empty]'
    )].some(surfaceUp);
  };
  /** Presses the button and answers whether the modal stayed away. */
  const staysClosed = async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await t.sleep(80);
    document.querySelector('[data-version-status]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await t.sleep(250);
    return !historySurfaceUp();
  };
  const settle = async () => {
    await versionsOfDocument.reread();
    await t.sleep(120);
    return {
      state: versionsOfDocument.current().kind,
      closed: await staysClosed()
    };
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
      'a note with no file opens no history modal',
      noFile.state === 'no-file' && noFile.closed,
      noFile
    );

    // 2. The note on disk, in a folder nothing has made a repository in.
    await open(note, 'The note.\n');
    const noRepository = await settle();
    check(
      'a workspace nothing has made a repository in opens no history modal',
      noRepository.state === 'no-repository' && noRepository.closed,
      noRepository
    );

    // 3. A repository whose history does not hold *this* note.
    await initWorkspaceRepository(folder, false);
    await files.writeTextAtomically(other, 'Another note.\n');
    await commitPaths(folder, [other], 'Another note', APP_IDENTITY);
    const empty = await settle();
    check(
      'a note with no versions of its own opens no history modal',
      empty.state === 'ready' && empty.closed,
      empty
    );

    // 4. A read that fails: the app is pointed at a git that is not there.
    await pointAtGit(`${folder}/git-that-is-not-there`);
    const unreadable = await settle();
    check(
      'and a read that fails opens no history modal',
      unreadable.state === 'unreadable' && unreadable.closed,
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
