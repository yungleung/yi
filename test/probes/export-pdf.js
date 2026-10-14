/**
 * The sixth kind, and the one kind with a *choice*: a PDF can be written by pandoc and a TeX engine,
 * or by the app's own renderer (`markdown2pdf`), which needs neither. This is the pandoc hand's half:
 * the menu item, the hands the card offers (only PDF has two, and pandoc is the one it opens on), the
 * settings each hand reads — a defaults file for pandoc, a theme, a page size and an orientation for
 * the app's own — and the page the TeX engine writes.
 *
 * The other hand is `export-pdf-own.js`, and it is a probe of its own because the bridge gives one
 * script five seconds: two real renderers in one script outrun that, and a probe still running when
 * the bridge gives up keeps driving the page the *next* probe is measuring.
 *
 * This half outruns those five seconds on its own — measured, a single `xelatex` run is ~4 s here and
 * the card's setup ~1 s — and there is nothing left to split it into, because the overrun *is* one
 * export. The harness says so when it happens (`recovered after the bridge timed out`, reading the
 * result out of the page's stash), which is what that recovery is for.
 *
 * @covers src-tauri/src/export.rs (run_export's two hands, export_with_pandoc),
 *   src/ui/export/export_dialog.ts (the menu, the hand, the kind's own options)
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

    // --- the kind, and the hand it offers --------------------------------------------------------

    let veil = await askForExport();
    await sleep(150);
    const hand = veil.querySelector('[data-export-hand]');
    check(
      'a PDF is offered a hand, and the hand it starts on is pandoc',
      hand !== null &&
        [...hand.options].map((option) => option.value).join(',') === 'pandoc,markdown2pdf' &&
        hand.value === 'pandoc' &&
        veil.querySelector('[data-export-target]').value === target,
      { hands: hand === null ? null : [...hand.options].map((option) => option.value), hand: hand?.value }
    );
    check(
      'with the settings that hand reads — the conversion settings file — and not the other hand’s',
      veil.querySelector('[data-export-config]')?.closest('div')?.classList.contains('hidden') === false &&
        veil.querySelector('[data-export-own]')?.classList.contains('hidden') === true,
      {
        hand: hand?.value ?? null,
        configRow: veil.querySelector('[data-export-config]')?.closest('div')?.className ?? null,
        config: veil.querySelector('[data-export-config]')?.textContent,
        ownRow: veil.querySelector('[data-export-own]')?.className ?? null
      }
    );

    // --- the pandoc hand -------------------------------------------------------------------------

    veil.querySelector('[data-export-run]').click();
    const wrote = await until(async () => (await bytesOf(target)) !== null);
    const pdf = await bytesOf(target);
    check(
      'the pandoc hand writes a PDF, through the TeX engine its file names',
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
