/**
 * What the app asks git to do, watched by a git that only records.
 *
 * The app may run git for exactly three things — `init`, `add -- <path>` and
 * `commit -m <message> -- <path>` — and for nothing else (the spec's never-dos: no `fetch`, `pull`,
 * `gc`, `clean`, `reset`, `checkout`, `switch`, `amend`, no force). Proving that from the app's own
 * hand means watching the arguments, and watching the arguments means a git that records instead
 * of doing: `test/probes/fake-git.sh`, committed, since a probe can make files and folders through
 * the app but cannot set an executable bit on one.
 *
 * The app is pointed at it through its own seam (`versioning_use_git`), which the harness clears
 * before every probe and this one clears on its way out — so a run the bridge cuts off costs the
 * next probe nothing. The watcher is also why no `-C` or `-c` can hide: the recorder is handed the
 * whole argv, and the log is read back whole.
 *
 * The second half drives the flow a reader drives — *Save a Version* with a comment — and reads the
 * calls *that* makes, which is the only place the comment's own commit is observed: a probe cannot
 * read a repository (a dot-named path is refused), and the recorder is not a repository at all.
 *
 * @covers src-tauri/src/versioning.rs (run_git, init_repository_at, commit_at), src/api/versioning.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const { pointAtGit, initWorkspaceRepository, commitPaths, versioningHistory, versioningVersionText } =
    await t.app('/src/api/versioning.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { saveVersion } = await t.app('/src/ui/versioning/save_version.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-fake-git`;
  const note = `${folder}/note.md`;
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
  const before = await invoke('get_config');
  const sessionText = await invoke('load_session');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A log a run the bridge cut off left behind.
    }
    await files.createEntry(home, 'yi-probe-fake-git', false);
    await files.createEntry(folder, 'note.md', true);

    await pointAtGit(`${window.__probePaths.checkout}test/probes/fake-git.sh`);
    const gitDir = await initWorkspaceRepository(folder, false);
    await commitPaths(folder, [note], 'a version', { name: 'Yi', email: 'yi@localhost' });

    const lines = (await read(`${folder}/argv.log`)).trim().split('\n');
    check(
      'the app runs git for the three things it may run it for, with the path it means',
      lines.length === 3 &&
        lines[0].endsWith(' init') &&
        lines[1].includes(` add -- ${note}`) &&
        lines[2].includes(` commit -m a version -- ${note}`),
      lines
    );
    const never = ['fetch', 'pull', 'gc', 'clean', 'reset', 'checkout', 'switch', 'amend', 'force', 'hard'];
    check(
      'and no argument of any call is one of the never-dos',
      !lines.some((line) =>
        line
          .split(' ')
          .some((argument) => never.includes(argument.replace(/^-+/, '')))
      ),
      lines
    );
    check(
      'a repository asked for as a plain one is in the workspace itself',
      gitDir === `${folder}/.git`,
      gitDir
    );

    // The read — the vocabulary's fourth call, and the only one that takes nothing away. With the
    // recorder answering nothing at all, it is an empty list rather than an error.
    const rows = await versioningHistory(folder, note, 50);
    const withRead = (await read(`${folder}/argv.log`)).trim().split('\n');
    check(
      'and the app reads one file’s history through the same helper',
      rows.length === 0 &&
        withRead[3] ===
          `git -C ${folder} log --follow --name-only --max-count=50 --format=%x1e%H%x00%at%x00%s%x00%b -- ${note}`,
      { rows, line: withRead[3] ?? null }
    );
    // One version's own text, by the name it had at that commit.
    const text = await versioningVersionText(folder, 'abc123', 'note.md');
    const withText = (await read(`${folder}/argv.log`)).trim().split('\n');
    check(
      'and a version’s text is read from that revision and name',
      text === '' && withText[4] === `git -C ${folder} show abc123:note.md`,
      { text, line: withText[4] ?? null }
    );

    // The flow a reader drives: *Save a Version*, with the comment they typed. Its calls are the
    // two reads of the repository's own identity, the init (nothing has made one, under the
    // recorder), the add and the commit — and the commit carries both messages.
    await t.openWorkspace(folder);
    await configManager.update({ versioning: true, versioning_workspace: folder });
    await open(note, 'A note to version.\n');
    const pending = saveVersion();
    // The card's field is in the page from the moment the module loads, so only the veil's own
    // class says a question is being asked.
    const commentCard = () => {
      const shown = document.querySelector('[data-version-comment]');
      return shown !== null && !shown.classList.contains('hidden') ? shown : null;
    };
    for (let attempt = 0; attempt < 60 && commentCard() === null; attempt += 1) {
      await t.sleep(40);
    }
    const field = document.querySelector('[data-version-comment-field]');
    if (commentCard() !== null && field !== null) {
      field.value = 'why this version';
      document.querySelector('[data-version-comment-save]')?.click();
    }
    await pending;
    await t.sleep(150);
    const saved = (await read(`${folder}/argv.log`)).trim().split('\n').slice(withText.length);
    check(
      'and a version saved with a comment is committed with the comment as its body',
      // The save's own five calls are the last five: the status bar's own list may have read the
      // facts for the document before them, which is its business and not this probe's.
      saved.length >= 5 &&
        saved[saved.length - 5].includes(' config --get user.name') &&
        saved[saved.length - 4].includes(' config --get user.email') &&
        saved[saved.length - 3].endsWith(' init') &&
        saved[saved.length - 2].includes(` add -- ${note}`) &&
        // The subject is the document's own title — the file's name, for a note with no frontmatter
        // — and the stamp, exactly as it always was; the comment is the second message.
        saved[saved.length - 1].includes(` commit -m note · `) &&
        saved[saved.length - 1].includes(' -m why this version -- '),
      saved
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
