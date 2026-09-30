/**
 * Making a workspace, and adopting one that is already there.
 *
 * The reader's half of the first start is `first-run.js`; this is the other answer — *create a new
 * workspace* — driven with the documents folder pointed at one the probe made itself, because a
 * test must never write into the reader's own Documents. The folder it makes is named the app's own
 * way (`Yi`), it becomes the workspace, the app remembers it asked, and a second run adopts the
 * folder instead of making a `Yi 2`.
 *
 * @covers src/ui/workspace_setup/workspace_setup_flow.ts, src/services/workspace_setup.ts
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
  const documents = `${home}/yi-probe-first-run-documents`;
  const created = { choose: async () => ({ create: true }) };
  const names = async () => (await files.listFolderFiles(documents)).map((entry) => entry.basename);

  const previous = await invoke('get_config');
  try {
    try {
      await files.deleteEntry(documents);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-first-run-documents', false);

    await flow.runWorkspaceSetup(created, documents);
    await t.sleep(300);
    same('a new workspace is made, named the app’s own way', await names(), ['Yi']);
    same('and it becomes the workspace', configManager.get()?.workspace, `${documents}/Yi`);
    same('and the app remembers that it asked', configManager.get()?.workspace_asked, true);

    // The same answer again: the folder that is already there is the workspace, not a second one.
    await configManager.update({ workspace: null, workspace_asked: false });
    await flow.runWorkspaceSetup(created, documents);
    await t.sleep(300);
    same('a second run adopts the folder that is already there', await names(), ['Yi']);
    same('and opens it again', configManager.get()?.workspace, `${documents}/Yi`);
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
      await files.deleteEntry(documents);
    } catch {
      // Already gone.
    }
  }

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
