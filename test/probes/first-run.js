/**
 * The first start's question, and both of its answers.
 *
 * The card is the app's own (`ui/workspace_setup/workspace_setup_dialog.ts`), asked by the flow the
 * start-up path calls — so this probe drives that flow directly rather than reloading the page (a
 * probe that reloads kills itself). What it proves is what the reader gets: a card that says where
 * a new workspace would be made, a folder they already have becoming the workspace exactly as the
 * File menu's *Open Folder…* makes one, the app remembering that it asked, and "not now" writing
 * nothing so the next start asks again.
 *
 * The folder it chooses is its own, under the home directory, and the config it found is put back
 * in a `finally` — including the workspace the app was showing, so the probes after it are
 * unaffected.
 *
 * @covers src/ui/workspace_setup/workspace_setup_flow.ts, src/ui/workspace_setup/workspace_setup_dialog.ts
 * @covers src/services/workspace/setup.ts
 */
(async () => {
  const t = window.__t;
  const flow = await t.app('/src/ui/workspace_setup/workspace_setup_flow.ts');
  const files = await t.app('/src/api/files.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const same = (name, actual, expected) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-first-run`;
  const press = (marker) => document.querySelector(`[data-${marker}]`)?.click();
  const card = () => document.querySelector('[data-workspace-setup]');
  /** Whether the card is on screen: it stays in the page, hidden, once it has been answered. */
  const askingNow = () => card()?.classList.contains('hidden') === false;

  const previous = await invoke('get_config');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-first-run', false);

    // 1. The question, with the answer to "where" on it.
    const asking = flow.runWorkspaceSetup();
    await t.sleep(250);
    const where = document.querySelector('[data-workspace-setup-where]')?.textContent ?? '';
    check(
      'the first start asks, and says where a new workspace would be made',
      card() !== null && where.includes('Documents') && where.includes('Yi'),
      { where, open: card() !== null }
    );

    // 2. A folder the reader already has becomes the workspace, by the menu's own path.
    press('workspace-setup-choose');
    await t.sleep(150);
    const field = document.querySelector('[data-workspace-setup-path]');
    check('and it offers a folder to name', field !== null, { field: field !== null });
    field.value = folder;
    press('workspace-setup-use');
    await asking;
    await t.sleep(300);
    same('the folder becomes the workspace', configManager.get()?.workspace, folder);
    check(
      'the tree shows it',
      document.querySelector(`[data-tree-path="${folder}"]`) !== null,
      { rows: [...document.querySelectorAll('[data-tree-path]')].map((row) => row.dataset.treePath) }
    );
    same('and the app remembers that it asked', configManager.get()?.workspace_asked, true);
    check('with the question put away', askingNow() === false, { open: askingNow() });

    // 3. "Not now" writes nothing at all, so the next start asks again.
    await configManager.update({ workspace: previous.workspace, workspace_asked: false });
    const later = flow.runWorkspaceSetup();
    await t.sleep(250);
    press('workspace-setup-later');
    await later;
    await t.sleep(200);
    same('answering "not now" leaves the workspace alone', configManager.get()?.workspace, previous.workspace);
    same('and leaves the question unasked', configManager.get()?.workspace_asked, false);
  } finally {
    await invoke('set_config', {
      cfg: { ...previous, config_version: await invoke('get_current_config_version') }
    });
    await configManager.load();
    await invoke('plugin:event|emit', {
      event: 'workspace_changed',
      payload: previous.workspace ?? ''
    });
    try {
      await files.deleteEntry(folder);
    } catch {
      // Already gone.
    }
  }

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
