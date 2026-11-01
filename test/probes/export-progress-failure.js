/**
 * A failed export clears the status-bar indicator.
 *
 * The delayed refusal is the same fake pandoc hand as the success probe. What this one watches is
 * the other exit from the export flow: the failure message may wait for the reader, but the busy
 * indicator must not.
 *
 * @covers src/ui/export/workflow/index.ts, src/ui/export/workflow/index.ts, src/ui/status_bar.ts,
 *   src/main.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const api = await t.app('/src/api/export.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;
  const until = async (ready, tries = 50) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(50);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-progress-failure-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/slow-refuse.docx`;
  const note = '# Export failure\n\nA note whose export refuses to finish.\n';
  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
  const askForExport = async () => {
    await invoke('plugin:event|emit', { event: 'export', payload: 'docx' });
    return await until(() => open(), 50);
  };
  const show = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    let opened = false;
    void pending.then(() => {
      opened = true;
    });
    for (let attempt = 0; attempt < 40 && !opened; attempt += 1) {
      const prompt = document.querySelector('[data-prompt]');
      if (prompt !== null && !prompt.classList.contains('hidden')) {
        prompt.querySelector('[data-prompt-no]')?.click();
        break;
      }
      await sleep(50);
    }
    await Promise.race([pending, sleep(1500)]);
    await sleep(150);
  };

  const before = await invoke('get_config');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A folder a run the bridge cut off left behind.
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'note.md', true);
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await show(notePath, note);
    await api.pointAtPandoc(`${window.__probePaths.checkout}test/probes/fake-pandoc.sh`);

    check('the export card opens', await askForExport(), { open: open() });
    document.querySelector('[data-export-target]').value = target;
    document.querySelector('[data-export-run]').click();
    const progress = () => document.querySelector('[data-export-progress]');
    const shown = await until(() => {
      const status = progress();
      return status !== null && !status.classList.contains('hidden');
    });
    const cleared = await until(() => progress()?.classList.contains('hidden') === true, 60);
    check(
      'a failing export shows the indicator while it runs and clears it afterwards',
      shown && cleared && progress()?.getAttribute('aria-busy') === 'false',
      {
        shown,
        cleared,
        busy: progress()?.getAttribute('aria-busy') ?? null
      }
    );
  } finally {
    await api.pointAtPandoc(null);
    try {
      await files.deleteEntry(folder);
    } catch {
      // Nothing to tidy.
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
