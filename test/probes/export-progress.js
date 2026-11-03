/**
 * An export that takes time says so in the status bar.
 *
 * The reader confirms the card, the export prepares and runs, and the only news until it finishes
 * is this indicator. A delayed fake pandoc (`test/probes/fake-pandoc.sh`) holds the run open long
 * enough to inspect the visible state without relying on this machine's speed; the success hint
 * then proves the same run finished and the indicator was hidden again.
 *
 * @covers src/ui/export/workflow/index.ts, src/services/export_activity.ts,
 *   src/ui/status_bar/export_progress.ts, src/main.ts
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
  const folderName = `yi-probe-export-progress-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/slow.docx`;
  const note = '# Export progress\n\nA note that takes a moment to export.\n';
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
    const hints = t.hintsNow();
    document.querySelector('[data-export-run]').click();

    const progress = () => document.querySelector('[data-export-progress]');
    const shown = await until(() => {
      const element = progress();
      return element !== null && !element.classList.contains('hidden');
    });
    const element = progress();
    const statusBar = element?.closest('[data-status-bar]');
    check(
      'a running export shows an eye-catching, accessible status in the status bar',
      shown &&
        statusBar !== null &&
        statusBar !== undefined &&
        element.getAttribute('role') === 'status' &&
        element.getAttribute('aria-busy') === 'true' &&
        element.querySelector('.loading-spinner') !== null &&
        element.textContent?.trim() === 'Exporting…',
      {
        shown,
        statusBar: statusBar !== null && statusBar !== undefined,
        role: element?.getAttribute('role') ?? null,
        busy: element?.getAttribute('aria-busy') ?? null,
        spinner:
          element !== null && element.querySelector('.loading-spinner') !== null,
        text: element?.textContent?.trim() ?? null
      }
    );

    const completed = await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
    check(
      'the indicator hides when the export finishes',
      completed && progress()?.classList.contains('hidden') === true,
      {
        completed,
        hidden: progress()?.classList.contains('hidden') ?? null,
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
