/**
 * The sixth kind: the menu item for a PDF, the card it opens (the kind, its own target, the settings
 * file it would be written with), and the page that comes out — a real PDF through the TeX engine the
 * file names, which is the part worth proving here and the slowest thing in the export family.
 *
 * It outruns the bridge's five seconds on its own — measured, a single `xelatex` run is ~4 s here and
 * the card's setup ~1 s — and there is nothing to split it into, because the overrun *is* one export.
 * The harness says so when it happens (`recovered after the bridge timed out`, reading the result out
 * of the page's stash), which is what that recovery is for.
 *
 * @covers src-tauri/src/export.rs (run_export, export_with_pandoc, the pdf asset),
 *   src/ui/export/export_dialog.ts (a card that is about one kind)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const bytesOf = async (path) => {
    try {
      const read = await invoke('plugin:fs|read_file', { path });
      return read instanceof ArrayBuffer ? new Uint8Array(read) : Uint8Array.from(read);
    } catch {
      return null;
    }
  };
  const exists = async (path) => {
    try {
      return await invoke('plugin:fs|exists', { path });
    } catch {
      return false;
    }
  };
  const until = async (ready, tries = 150) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-pdf-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.pdf`;
  const note = '# Going out\n\nA short paragraph, and a citation [@smith2020].\n';

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
  /** Opens the note and waits for it, bounded — see `export-docx.js` for why. */
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
    await Promise.race([pending, sleep(2000)]);
    await sleep(200);
  };
  const askForExport = async () => {
    await invoke('plugin:event|emit', { event: 'export', payload: 'pdf' });
    await until(() => open(), 60);
    return card();
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
    check(
      'the note the probe opened is the document on screen',
      (document.querySelector('.prose')?.textContent ?? '').startsWith('Going out'),
      { onScreen: (document.querySelector('.prose')?.textContent ?? '').slice(0, 24) }
    );

    // --- the kind, and what would write it -------------------------------------------------------

    const veil = await askForExport();
    await sleep(150);
    check(
      'the pdf card is about the pdf kind, and its target is the note’s own name with a .pdf',
      veil.dataset.exportKind === 'pdf' &&
        veil.querySelector('[data-export-target]').value === target,
      {
        kind: veil.dataset.exportKind ?? null,
        target: veil.querySelector('[data-export-target]')?.value ?? null
      }
    );
    check(
      'and the settings it would be written with are the kind’s own file, named on the card',
      veil.querySelector('[data-export-config]')?.closest('div')?.classList.contains('hidden') ===
        false &&
        (veil.querySelector('[data-export-config]')?.textContent ?? '').endsWith(
          '/export/export.pdf.yaml'
        ),
      {
        configRow: veil.querySelector('[data-export-config]')?.closest('div')?.className ?? null,
        config: veil.querySelector('[data-export-config]')?.textContent
      }
    );

    // --- the export itself -----------------------------------------------------------------------

    const hints = t.hintsNow();
    veil.querySelector('[data-export-run]').click();
    const wrote = await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
    const pdf = await bytesOf(target);
    check(
      'and a real PDF comes out, through the TeX engine the settings file names',
      wrote && pdf !== null && String.fromCharCode(...pdf.slice(0, 5)) === '%PDF-',
      { wrote, size: pdf?.length ?? 0, start: pdf === null ? null : String.fromCharCode(...pdf.slice(0, 5)) }
    );

  } finally {
    try {
      await files.deleteEntry(folder);
    } catch {
      // Nothing to tidy.
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
