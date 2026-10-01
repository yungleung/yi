/**
 * A folder *inside* a repository the reader already has: still theirs, and never nested into.
 *
 * The other shape of the same decision (`services/versioning.ts: versioningPlan` says
 * `use: 'theirs'` for both) — a workspace that is itself a repository is `versioning-repository.js`,
 * and the two were split because held together they measured 5.0 s against the bridge's 5 s budget.
 *
 * What must not happen is a repository of the app's own: not a `.git` in the folder (that is
 * nesting), and not one in the place a synced folder would earn either. What must happen is the
 * note going into the repository that was already there — and the commit carries *their* identity,
 * which a repository the app made does not have, so the check says which of the two it saw.
 *
 * @covers src/ui/versioning/save_version.ts, src-tauri/src/versioning.rs (init, commit)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const versioning = await t.app('/src/api/versioning.ts');
  const { saveVersion } = await t.app('/src/ui/versioning/save_version.ts');
  const { APP_IDENTITY } = await t.app('/src/services/versioning.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const outer = `${home}/yi-probe-versioning-outer`;
  const inside = `${outer}/inside`;
  const note = `${inside}/note.md`;
  const config = () => invoke('get_config');
  const exists = (path) =>
    invoke('plugin:fs|exists', { path }).then((there) => there === true, () => false);
  const closeMessages = () => {
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
  };
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
  const putSessionBack = async (text) => {
    if (text !== null) {
      await invoke('save_session', { session: text });
    }
    await session.documentSession.load();
    await t.sleep(120);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
  };
  /** Whether git has nothing left to commit at `path` — which is what being committed means. */
  const alreadyCommitted = (repository, path) =>
    versioning
      .commitPaths(repository, [path], 'a second time', APP_IDENTITY)
      .then(() => false, () => true);

  const before = await config();
  const sessionText = await invoke('load_session');
  try {
    try {
      await files.deleteEntry(outer);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-versioning-outer', false);
    await files.createEntry(outer, 'inside', false);
    await files.createEntry(inside, 'note.md', true);
    // The reader's own repository, made by the app the only way a probe can make one.
    await versioning.initWorkspaceRepository(outer, false);
    const identity = (await versioning.versioningFacts(outer)).identity;
    const named = identity.name !== null && identity.email !== null;

    await t.openWorkspace(inside);
    await configManager.update({ versioning: true, versioning_workspace: inside });
    await open(note, 'A note in a folder inside a repository.\n');
    await saveVersion();
    await t.sleep(150);
    const nested = await versioning.versioningFacts(inside);
    check(
      'a folder inside a repository is never nested into',
      nested.repository.here === false &&
        nested.repository.above === true &&
        nested.repository.toplevel === outer &&
        !(await exists(nested.separate_git_dir)) &&
        (named ? await alreadyCommitted(outer, note) : true),
      { repository: nested.repository, separate: nested.separate_git_dir, identity, named }
    );
  } finally {
    closeMessages();
    await t.restoreWorkspace(before);
    await putSessionBack(sessionText);
    try {
      await files.deleteEntry(outer);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
