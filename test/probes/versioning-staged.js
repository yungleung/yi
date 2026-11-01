/**
 * What a version holds: the note that was saved, and never the reader's staged work.
 *
 * The pathspec is the whole point of the app's commit (`git add -- <path>` then
 * `git commit -m <message> -- <path>`, `src-tauri/src/versioning.rs`), and this probe asks git for
 * the outcome: a file left in the index stays in the index across a version of another note.
 *
 * A probe cannot run a command, so the staging is done with the app's own vocabulary, the way a
 * reader's staging ends up in the index: `git add` runs, and the commit that follows is refused for
 * having no message — which leaves `other.md` staged and nothing else changed. The repository is
 * made the same way, by the app's own `init`, and the version that follows has something to commit
 * (the note has never been in it), so the commit really happens: a commit that swept up everything
 * staged would leave `other.md` in it and nothing for the reader's own commit to carry.
 *
 * The repo is observed only through what git *does* next, because a probe cannot read inside a
 * dot-named directory (measured: "forbidden path" for `.git/HEAD`). The staged file is committed
 * at the end with the reader's own name on it: that commit succeeding is the file still being
 * there, and a version that had swept it up would leave nothing to commit.
 *
 * @covers src/ui/versioning/save_version.ts, src-tauri/src/versioning.rs (commit_paths)
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
  const workspace = `${home}/yi-probe-versioning-staged`;
  const note = `${workspace}/note.md`;
  const other = `${workspace}/other.md`;
  const config = () => invoke('get_config');
  const clear = async () => {
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
    await t.sleep(80);
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
    await files.createEntry(home, 'yi-probe-versioning-staged', false);
    await files.createEntry(workspace, 'note.md', true);
    await files.createEntry(workspace, 'other.md', true);
    await t.openWorkspace(workspace);
    // Consent already given for this workspace: the question is `versioning-save.js`'s subject,
    // and this probe is about what the commit holds.
    await configManager.update({ versioning: true, versioning_workspace: workspace });
    // The repository a version would make, made here so the reader's staged work can come first.
    await versioning.initWorkspaceRepository(workspace, false);

    const staged = await versioning
      .commitPaths(workspace, [other], '', APP_IDENTITY)
      .then(() => 'committed', () => 'staged');
    check('the probe stages its own file, the way a reader stages one', staged === 'staged', staged);

    await open(note, 'A note to version.\n');
    await saveWith();
    const theirs = await versioning
      .commitPaths(workspace, [other], 'the reader commits their own work', APP_IDENTITY)
      .then(() => 'committed', (error) => String(error));
    check('and a version of the note leaves it staged: it is still there to commit', theirs === 'committed', theirs);
  } finally {
    await clear();
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
