/**
 * The machine that has no git: the action says so and writes nothing.
 *
 * A probe cannot hide the git this machine has, so the app is *pointed* at one that is not there —
 * the app's own seam (`versioning_use_git`, the same seam `YI_GIT` is). A name that is not there is
 * no git at all, never a fallback to another one, and the plan that follows is the one the check
 * walks (`blocked: 'no-git'`).
 *
 * The seam is a global in the app's process, so it is put back in `finally` — and the harness puts
 * it back before every probe, for a run the bridge cuts off.
 *
 * @covers src/ui/versioning/index.ts, src-tauri/src/versioning.rs (find_git)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const versioning = await t.app('/src/api/versioning.ts');
  const { saveVersion } = await t.app('/src/ui/versioning/index.ts');
  const { t: words } = await t.app('/src/services/i18n.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const workspace = `${home}/yi-probe-versioning-no-git`;
  const note = `${workspace}/note.md`;
  const config = () => invoke('get_config');
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const messageTexts = () =>
    [...document.querySelectorAll('[data-message-text]')].map((each) => each.textContent ?? '');
  const closeMessages = () => {
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
  };
  const open = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    // The question a replaced document raises is waited for, not slept at: in a long suite the
    // session is heavy, and a fixed sleep can miss the card and leave this open hanging.
    const shown = () => {
      const card = document.querySelector('[data-prompt]');
      return card !== null && !card.classList.contains('hidden') ? card : null;
    };
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (shown() !== null) {
        shown()?.querySelector('[data-prompt-no]')?.click();
        break;
      }
      if (session.documentSession.current()?.path === path) {
        break;
      }
      await t.sleep(50);
    }
    await pending;
    await t.sleep(140);
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
    await files.createEntry(home, 'yi-probe-versioning-no-git', false);
    await files.createEntry(workspace, 'note.md', true);
    await t.openWorkspace(workspace);
    await configManager.update({ versioning: true, versioning_workspace: workspace });
    await open(note, 'A note that has no git to version it.\n');

    await versioning.pointAtGit(`${home}/yi-probe-versioning-no-git/git-that-is-not-there`);
    const blind = await versioning.versioningFacts(workspace);
    check(
      'a git named and not there is no git at all, never another one',
      blind.git === null && blind.git_source === 'env-missing',
      { git: blind.git, git_source: blind.git_source }
    );

    await saveVersion();
    await t.sleep(200);
    check(
      'the action says the machine has no git, in the app’s own words',
      messageTexts().includes(words('version.noGit')),
      messageTexts()
    );
    closeMessages();
    await t.sleep(80);
    const untouched = await versioning.versioningFacts(workspace);
    check(
      'and writes nothing: no repository, and the note still the empty file it was',
      untouched.repository.here === false && (await read(note)) === '',
      { repository: untouched.repository, file: await read(note) }
    );
  } finally {
    await versioning.pointAtGit(null);
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
