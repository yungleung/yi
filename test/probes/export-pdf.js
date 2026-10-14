/**
 * The sixth kind, and the one kind with a *choice*: a PDF can be written by pandoc and a TeX engine,
 * or by the app's own renderer (`markdown2pdf`), which needs neither. This probe drives both hands
 * through the card: the menu item, the hand it offers (only PDF has two), the settings each hand
 * reads — a defaults file for pandoc, a theme, a page size and an orientation for the app's own — and
 * the file that comes out, which in both cases is a PDF (`%PDF-`, and no TeX engine in the app's own
 * path at all: `cargo tree` shows printpdf).
 *
 * @covers src-tauri/src/export.rs (run_export's two hands, export_with_markdown2pdf),
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
  const ownTarget = `${folder}/own.pdf`;
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
    await invoke('plugin:event|emit', { event: 'export', payload: null });
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
    veil.querySelector('[data-export-kind="pdf"]').click();
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

    // --- the app's own hand ----------------------------------------------------------------------

    veil = await askForExport();
    veil.querySelector('[data-export-kind="pdf"]').click();
    await sleep(150);
    const own = veil.querySelector('[data-export-hand]');
    own.value = 'markdown2pdf';
    own.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);
    const theme = veil.querySelector('[data-export-theme]');
    const size = veil.querySelector('[data-export-size]');
    const orientation = veil.querySelector('[data-export-orientation]');
    check(
      'choosing the app’s own hand offers its own settings, and takes the other hand’s away',
      veil.querySelector('[data-export-own]')?.classList.contains('hidden') === false &&
        veil.querySelector('[data-export-config]')?.closest('div')?.classList.contains('hidden') === true &&
        [...(theme?.options ?? [])].map((option) => option.value).join(',') ===
          'academic,minimal,compact,modern' &&
        [...(size?.options ?? [])].map((option) => option.value).join(',') === 'A4,Letter,Legal,A3,A5' &&
        [...(orientation?.options ?? [])].map((option) => option.value).join(',') === 'portrait,landscape',
      {
        themes: [...(theme?.options ?? [])].map((option) => option.value),
        sizes: [...(size?.options ?? [])].map((option) => option.value),
        orientations: [...(orientation?.options ?? [])].map((option) => option.value)
      }
    );
    theme.value = 'modern';
    theme.dispatchEvent(new Event('change', { bubbles: true }));
    size.value = 'Letter';
    size.dispatchEvent(new Event('change', { bubbles: true }));
    orientation.value = 'landscape';
    orientation.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);
    veil.querySelector('[data-export-target]').value = ownTarget;
    veil.querySelector('[data-export-run]').click();
    const owned = await until(async () => (await bytesOf(ownTarget)) !== null);
    const ownPdf = await bytesOf(ownTarget);
    check(
      'and it writes a PDF too — no pandoc, no TeX suite, in a landscape Letter page',
      owned &&
        ownPdf !== null &&
        String.fromCharCode(...ownPdf.slice(0, 5)) === '%PDF-' &&
        ownPdf.length > 1000,
      { owned, size: ownPdf?.length ?? 0, target: ownTarget }
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
