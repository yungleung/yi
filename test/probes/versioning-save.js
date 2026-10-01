/**
 * A version of the note on screen: the question it asks first, and what the commit holds.
 *
 * A version exists only when the reader asks for one, so the action is asked for here the way the
 * File menu's item asks for it (`version:save` → `saveVersion()`), and the card it raises is
 * answered with a real press.
 *
 * Git is the app's own: a probe cannot run a command, and it cannot read inside a dot-named
 * directory either (measured: `plugin:fs|read_text_file` on `.git/HEAD` answers "forbidden path"),
 * so the repository is observed the way the app observes it (`versioning_facts`) and by asking git
 * to do something whose *outcome* is the fact under test — committing a file that is already
 * committed has nothing to do, which is how "the note is in the repository" is read here.
 *
 * What the commit *holds* — the note, and not the reader's staged work — is `versioning-staged.js`:
 * both halves fit the bridge's five seconds on their own, which one probe no longer did (measured:
 * 4.9 s, and the cut-off is the one thing a probe must never gamble on).
 *
 * @covers src/ui/versioning/save_version.ts, src/api/versioning.ts, src-tauri/src/versioning.rs
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
  const workspace = `${home}/yi-probe-versioning-save`;
  const note = `${workspace}/note.md`;
  const config = () => invoke('get_config');
  const facts = () => versioning.versioningFacts(workspace);
  const card = () => {
    const shown = document.querySelector('[data-versioning]');
    return shown !== null && !shown.classList.contains('hidden') ? shown : null;
  };
  const messages = () => [...document.querySelectorAll('[data-message-text]')];
  const clear = async () => {
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
    await t.sleep(120);
  };
  /** The action, driven the way the menu drives it: fire, answer the card it raises, wait. */
  const version = async (yes) => {
    const pending = saveVersion();
    for (let attempt = 0; attempt < 60 && card() === null; attempt += 1) {
      await t.sleep(40);
    }
    const asked = card() !== null;
    card()?.querySelector(yes ? '[data-versioning-yes]' : '[data-versioning-no]')?.click();
    await pending;
    await t.sleep(150);
    return asked;
  };
  /** Opens a note through the session, declining the question a replaced document may raise. */
  const open = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    await t.sleep(150);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
    await pending;
    await t.sleep(150);
  };
  /** Whether git has nothing left to commit at `path` — which is what being committed means. */
  const alreadyCommitted = (path, label) =>
    versioning
      .commitPaths(workspace, [path], label, APP_IDENTITY)
      .then(() => false, () => true);
  /**
   * The reader's session is theirs: the file goes back exactly as it was, and the live session
   * reads it again, so the documents that were open are the documents that are open
   * (`docs/ai-context.md`: the fixture is a test's, never the reader's).
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
    await files.createEntry(home, 'yi-probe-versioning-save', false);
    await files.createEntry(workspace, 'note.md', true);
    await t.openWorkspace(workspace);
    // An answer given for another folder is no answer: this workspace starts unasked.
    await configManager.update({ versioning: false, versioning_workspace: null });

    await open(note, 'A note about to get a version.\n');
    const asked = await version(true);
    const answered = await config();
    check('asking for a version of a workspace nobody has answered for asks first', asked, {
      versioning: answered.versioning,
      versioning_workspace: answered.versioning_workspace
    });
    check(
      'and the answer is remembered with the workspace it was given for',
      answered.versioning === true && answered.versioning_workspace === workspace,
      { versioning: answered.versioning, versioning_workspace: answered.versioning_workspace }
    );
    check(
      'the note on screen is in the repository: committing it again has nothing to do',
      await alreadyCommitted(note, 'a second time'),
      await facts()
    );

    const listed = (await files.listFolderFiles(workspace)).map((entry) => entry.basename);
    check('and the tree never names the repository in the workspace', !listed.includes('.git'), listed);
  } finally {
    await clear();
    await t.restoreWorkspace(before);
    await putSessionBack(sessionText);
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Already gone.
    }
    check('the probe left no message waiting', messages().length === 0, messages().map((m) => m.textContent));
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
