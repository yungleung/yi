/**
 * A repository the reader already has: used as it stands, and never nested into.
 *
 * One shape of the two the decision covers (`services/versioning.ts: versioningPlan` says
 * `use: 'theirs'` for both): a workspace that *is* a repository. The folder *inside* one is
 * `versioning-outer.js` — held together they measured 5.0 s against the bridge's 5 s budget, and a
 * probe that only sometimes finishes is a probe that sometimes lies.
 *
 * Either way the app must not make a repository of its own — not in the folder, and not in the
 * place a synced folder would earn — and the note must go into the repository that was already
 * there.
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
  const session = await t.app('/src/services/session/index.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const versioning = await t.app('/src/api/versioning.ts');
  const { saveVersion } = await t.app('/src/ui/versioning/save_version.ts');
  const { APP_IDENTITY } = await t.app('/src/services/versioning.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const workspace = `${home}/yi-probe-versioning-repo`;
  const note = `${workspace}/note.md`;
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
  /** Saves a version, answering the comment card the save raises with `comment`. */
  const saveWith = async (comment = '') => {
    const pending = saveVersion();
    // The card's field is in the page from the moment the module loads, so only the veil's own
    // class says a question is being asked.
    const up = () => {
      const shown = document.querySelector('[data-version-comment]');
      return shown !== null && !shown.classList.contains('hidden') ? shown : null;
    };
    for (let attempt = 0; attempt < 60 && up() === null; attempt += 1) {
      await t.sleep(40);
    }
    const field = document.querySelector('[data-version-comment-field]');
    if (up() !== null && field !== null) {
      field.value = comment;
      document.querySelector('[data-version-comment-save]')?.click();
    }
    await pending;
    await t.sleep(150);
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
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-versioning-repo', false);
    await files.createEntry(workspace, 'note.md', true);
    // The reader's own repository, made by the app the only way a probe can make one.
    await versioning.initWorkspaceRepository(workspace, false);
    const identity = (await versioning.versioningFacts(workspace)).identity;
    const named = identity.name !== null && identity.email !== null;

    // The workspace *is* a repository: it is the one used, and no other is made.
    await t.openWorkspace(workspace);
    await configManager.update({ versioning: true, versioning_workspace: workspace });
    await open(note, 'A note in the reader’s own repository.\n');
    await saveWith();
    const own = await versioning.versioningFacts(workspace);
    check(
      'a workspace that is already a repository is used as it stands',
      own.repository.here === true &&
        own.repository.toplevel === workspace &&
        !(await exists(own.separate_git_dir)) &&
        (named ? await alreadyCommitted(workspace, note) : true),
      { repository: own.repository, separate: own.separate_git_dir, identity, named }
    );
  } finally {
    closeMessages();
    await t.restoreWorkspace(before);
    await putSessionBack(sessionText);
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
