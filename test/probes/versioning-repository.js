/**
 * A repository the reader already has: used as it stands, and never nested into.
 *
 * Two shapes, one decision (`services/versioning.ts: versioningPlan` says `use: 'theirs'` for
 * both): a workspace that *is* a repository, and a folder inside one. Either way the app must not
 * make a repository of its own — not in the folder, and not in the place a synced folder would
 * earn — and the note must go into the repository that was already there.
 *
 * The repository here is one the app made, because a probe cannot run `git init` itself, and a
 * repository of ours carries no identity: the commit into it uses the machine's own, which is what
 * `versioning_facts` reports (`identity`). A machine whose git has no name configured fails that
 * commit, which is the behaviour the spec asks for — so the check says which of the two it saw.
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
  const outer = `${home}/yi-probe-versioning-repo`;
  const inside = `${outer}/inside`;
  const outerNote = `${outer}/note.md`;
  const insideNote = `${inside}/note.md`;
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
  /** Whether git has nothing left to commit at `path` — which is what being committed means. */
  const alreadyCommitted = (repository, path) =>
    versioning
      .commitPaths(repository, [path], 'a second time', APP_IDENTITY)
      .then(() => false, () => true);
  /**
   * The reader's session is theirs: the file goes back exactly as it was, and the live session
   * reads it again (`docs/ai-context.md`: the fixture is a test's, never the reader's).
   */
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

  const before = await config();
  const sessionText = await invoke('load_session');
  try {
    try {
      await files.deleteEntry(outer);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-versioning-repo', false);
    await files.createEntry(outer, 'inside', false);
    await files.createEntry(outer, 'note.md', true);
    await files.createEntry(inside, 'note.md', true);
    // The reader's own repository, made by the app the only way a probe can make one.
    await versioning.initWorkspaceRepository(outer, false);
    const identity = (await versioning.versioningFacts(outer)).identity;
    const named = identity.name !== null && identity.email !== null;

    // 1. The workspace *is* a repository: it is the one used, and no other is made.
    await t.openWorkspace(outer);
    await configManager.update({ versioning: true, versioning_workspace: outer });
    await open(outerNote, 'A note in the reader’s own repository.\n');
    await saveVersion();
    await t.sleep(150);
    const own = await versioning.versioningFacts(outer);
    check(
      'a workspace that is already a repository is used as it stands',
      own.repository.here === true &&
        own.repository.toplevel === outer &&
        !(await exists(own.separate_git_dir)) &&
        (named ? await alreadyCommitted(outer, outerNote) : true),
      { repository: own.repository, separate: own.separate_git_dir, identity, named }
    );

    // 2. A folder *inside* a repository: still theirs, and never nested into.
    await t.openWorkspace(inside);
    await configManager.update({ versioning: true, versioning_workspace: inside });
    await open(insideNote, 'A note in a folder inside a repository.\n');
    await saveVersion();
    await t.sleep(150);
    const nested = await versioning.versioningFacts(inside);
    check(
      'and a folder inside a repository is never nested into',
      nested.repository.here === false &&
        nested.repository.above === true &&
        nested.repository.toplevel === outer &&
        !(await exists(nested.separate_git_dir)) &&
        (named ? await alreadyCommitted(outer, insideNote) : true),
      { repository: nested.repository, separate: nested.separate_git_dir, named }
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
