/**
 * The General tab's switch for the stack, and what the session does with it.
 *
 * The switch asks whether opening a file should push the document on screen into the stack rather
 * than ask about it (`push_unstacked_on_open`, off until the reader turns it on). What it decides
 * is only ever about a document the reader could lose: one whose text its file holds is replaced
 * either way — no question, and no push, because putting a saved document in the stack is the
 * reader's own choice, made with the stack button.
 *
 * The note the probe opens is its own, written through the app's own commands into
 * `~/yi-probe-push-on-open`: the file plugin is scoped to the home directory (`new-markdown.js`
 * gives the same reason), and a note no other probe has opened cannot be one the session already
 * holds a copy of — which is what makes the document on screen in each case below the one the
 * probe put there.
 *
 * @covers src/ui/settings/general_settings.ts, src/services/session.ts
 * @covers src/services/session_rules.ts
 * @needs-workspace — the note its stack question is asked about is the fixtures' own
 *   `default-document.md`, read out of whatever folder the app has open (`--with-workspace`)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { GeneralSettings } = await t.app('/src/ui/settings/general_settings.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-push-on-open`;
  const notePath = `${folder}/note.md`;

  const page = () => t.prose().textContent ?? '';
  const stack = () => session.documentSession.stack().map((held) => held.id);
  const current = () => session.documentSession.current();
  const prompting = () =>
    document.querySelector('[data-prompt]')?.classList.contains('hidden') === false;
  /** Answers the session's question, when it asks one, with the answer that saves nothing. */
  const declineIfAsked = () => {
    const asked = prompting();
    if (asked) {
      document.querySelector('[data-prompt-no]')?.click();
    }
    return asked;
  };
  /** Opens a document through the session, reporting whether the reader would have been asked. */
  const open = async (incoming) => {
    const pending = session.documentSession.openFile(incoming);
    await t.sleep(150);
    const asked = declineIfAsked();
    await pending;
    await t.sleep(150);
    return asked;
  };
  const demoDocument = async () => {
    const workspace = String((await invoke('get_config')).workspace ?? '');
    const bytes = await invoke('plugin:fs|read_text_file', { path: `${workspace}/default-document.md` });
    return { path: `${workspace}/default-document.md`, content: decode(bytes) };
  };
  const decode = (bytes) =>
    new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));

  const before = await invoke('get_config');
  try {
    try {
      // A leftover from a probe that was cut off.
      await files.deleteEntry(folder);
    } catch {
      // Nothing there.
    }
    await files.createEntry(home, 'yi-probe-push-on-open', false);
    await files.createEntry(folder, 'note.md', true);

    // The tab the reader finds the switch in — reading the setting, and writing it when flipped.
    await configManager.update({ push_unstacked_on_open: false });
    const tab = new GeneralSettings();
    await t.sleep(200);
    const toggle = tab.element.querySelector('[data-push-unstacked]');
    check(
      'the general tab offers the switch, reading the setting',
      toggle !== null && toggle.checked === false,
      { found: toggle !== null, checked: toggle?.checked ?? null }
    );
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await t.sleep(250);
    check(
      'and flipping it saves the setting',
      (await invoke('get_config')).push_unstacked_on_open,
      true
    );

    // 1. A document whose file holds it has nothing to lose, so the switch has nothing to decide:
    // it goes without a question, and it is *not* pushed — the file is the copy.
    await open({ path: notePath, content: '' });
    const saved = current();
    check(
      'the probe opened its own note, and its text is what the file holds',
      saved?.path === notePath && saved.content === saved.saved,
      { path: saved?.path ?? null, saved: saved ? saved.content === saved.saved : null }
    );
    const askedOverSaved = await open({ path: null, content: 'A document being written.\n' });
    check(
      'with the switch on, a saved document is still replaced without a question and unpushed',
      !askedOverSaved && !stack().includes(saved?.id ?? '') && page().startsWith('A document being'),
      { asked: askedOverSaved, stack: stack(), page: page().slice(0, 24) }
    );

    // 2. The document that *is* being written is the one the switch is for: pushed into the stack
    // without the question the same open would raise with the switch off.
    const editing = current()?.id ?? '';
    const askedOverEditing = await open({ path: notePath, content: '' });
    check(
      'and an editing document is pushed without a question',
      !askedOverEditing && stack().includes(editing) && current()?.path === notePath,
      { asked: askedOverEditing, editing, stack: stack(), path: current()?.path ?? null }
    );

    // 3. The switch off is the app's own question, which the same open now raises.
    await configManager.update({ push_unstacked_on_open: false });
    await open({ path: null, content: 'Another document being written.\n' });
    const askedWithSwitchOff = await open({ path: notePath, content: '' });
    check('with the switch off, the same open asks the reader', askedWithSwitchOff, {
      asked: askedWithSwitchOff
    });
  } finally {
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
    await configManager.load();
    // Leave the session as tidy as the probe found it: nothing it pushed, and the demo document
    // on screen rather than a note it is about to delete.
    for (const held of session.documentSession.stack()) {
      const pending = session.documentSession.drop(held.id);
      await t.sleep(80);
      declineIfAsked();
      await pending;
    }
    try {
      await open(await demoDocument());
    } catch {
      // No fixture workspace open: the session keeps what it has.
    }
    try {
      await files.deleteEntry(folder);
    } catch {
      // Already gone.
    }
  }

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
