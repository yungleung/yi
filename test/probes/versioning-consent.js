/**
 * The answer that is no, and the switch that gives the same answer the other way round.
 *
 * Declining is an answer: it is remembered with the workspace it was given for, nothing is written
 * or made, and asking for a version afterwards says where that answer lives instead of doing
 * nothing. The settings window's General tab is the reader's other way to the same consent
 * (`ui/settings/general_settings.ts`), and turning it on there asks the same card.
 *
 * @covers src/ui/versioning/save_version.ts, src/ui/versioning/versioning_dialog.ts,
 *   src/ui/settings/general_settings.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const { GeneralSettings } = await t.app('/src/ui/settings/general_settings.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const versioning = await t.app('/src/api/versioning.ts');
  const { saveVersion } = await t.app('/src/ui/versioning/save_version.ts');
  const { t: words } = await t.app('/src/services/i18n.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const workspace = `${home}/yi-probe-versioning-consent`;
  const note = `${workspace}/note.md`;
  const config = () => invoke('get_config');
  const facts = () => versioning.versioningFacts(workspace);
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const card = () => {
    const shown = document.querySelector('[data-versioning]');
    return shown !== null && !shown.classList.contains('hidden') ? shown : null;
  };
  const messageTexts = () =>
    [...document.querySelectorAll('[data-message-text]')].map((each) => each.textContent ?? '');
  const closeMessages = () => {
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
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
    await t.sleep(120);
    return asked;
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
    await files.createEntry(home, 'yi-probe-versioning-consent', false);
    await files.createEntry(workspace, 'note.md', true);
    await t.openWorkspace(workspace);
    await configManager.update({ versioning: false, versioning_workspace: null });
    await open(note, 'A note the reader did not want versioned.\n');

    const asked = await version(false);
    const declined = await config();
    check(
      'declining is asked for once, and remembered with the workspace it was given for',
      asked && declined.versioning === false && declined.versioning_workspace === workspace,
      { asked, versioning: declined.versioning, versioning_workspace: declined.versioning_workspace }
    );
    const untouched = await facts();
    check(
      'and nothing at all is touched: no repository, and the note still the empty file it was',
      untouched.repository.here === false &&
        untouched.repository.above === false &&
        (await read(note)) === '',
      { repository: untouched.repository, file: await read(note) }
    );

    await saveVersion();
    await t.sleep(150);
    check(
      'asking again says where that answer lives rather than doing nothing',
      messageTexts().includes(words('version.declined')),
      messageTexts()
    );
    closeMessages();
    await t.sleep(80);

    // The settings window's own way to the same answer: the switch reads the remembered no, and
    // turning it on asks the card the action asks — and remembers what the reader says.
    const tab = new GeneralSettings();
    await t.sleep(250);
    const toggle = tab.element.querySelector('[data-versioning-switch]');
    check(
      'the general tab offers the switch, reading the remembered answer for this workspace',
      toggle !== null && toggle.checked === false,
      { found: toggle !== null, checked: toggle === null ? null : toggle.checked }
    );
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    for (let attempt = 0; attempt < 60 && card() === null; attempt += 1) {
      await t.sleep(40);
    }
    const switchAsked = card() !== null;
    card()?.querySelector('[data-versioning-yes]')?.click();
    await t.sleep(250);
    const turnedOn = await config();
    check(
      'turning it on asks the same question and remembers the yes',
      switchAsked && turnedOn.versioning === true && turnedOn.versioning_workspace === workspace,
      { switchAsked, versioning: turnedOn.versioning, versioning_workspace: turnedOn.versioning_workspace }
    );
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await t.sleep(250);
    const turnedOff = await config();
    check(
      'and turning it off is the no again, touching nothing that exists',
      turnedOff.versioning === false &&
        (await facts()).repository.here === false,
      { versioning: turnedOff.versioning, repository: (await facts()).repository }
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
