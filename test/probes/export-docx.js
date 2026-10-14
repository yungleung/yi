/**
 * The export a reader asks for, from the File menu to a Word file on the disk.
 *
 * This is the wire end to end: the native menu's `export` event runs the command, the command opens
 * the card, the card's tab and field say what would be written, pressing *Export* runs the real
 * pandoc against the app's own defaults file, and what appears where the reader asked for it is a
 * docx (`PK`, the zip every Word file is). Escape, the other way out, writes nothing at all — not
 * even the configuration file, which is why the first half asks for it before it is made.
 *
 * What pandoc is *asked* is the subject of the probe beside this one
 * (`export-pandoc-arguments.js`), which uses a pandoc that only records.
 *
 * @covers src-tauri/src/export.rs (find_pandoc, export_kinds, run_export, open_export_config),
 *   src/api/export.ts, src/ui/export/export_flow.ts, src/ui/export/export_dialog.ts
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
  const textOf = async (path) => {
    const bytes = await bytesOf(path);
    return bytes === null ? null : new TextDecoder().decode(bytes);
  };
  const exists = async (path) => {
    try {
      return await invoke('plugin:fs|exists', { path });
    } catch {
      return false;
    }
  };
  const until = async (ready, tries = 80) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-export-docx`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.docx`;
  const elsewhere = `${folder}/never.docx`;
  const checkout = window.__probePaths.checkout;
  const note = [
    '# Going out',
    '',
    `A note with an alias: [[other|an alias]], a citation [@smith2020], and a picture: ![icon](${checkout}src-tauri/icons/icon.png).`,
    ''
  ].join('\n');

  /** The app's card, as the page has it, and whether it is the one on show. */
  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
  const field = () => document.querySelector('[data-export-target]');
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom)
    };
  };

  /** Asks the app to export, the way the File menu does: the event the native item emits. */
  const askForExport = async () => {
    await invoke('plugin:event|emit', { event: 'export', payload: null });
    return await until(() => open(), 60);
  };
  /** Opens a note through the session, declining the question a replaced document may raise. */
  const show = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    await sleep(150);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
    await pending;
    await sleep(200);
  };

  const before = await invoke('get_config');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A folder a run the bridge cut off left behind.
    }
    await files.createEntry(home, 'yi-probe-export-docx', false);
    await files.createEntry(folder, 'note.md', true);
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await show(notePath, note);

    // --- the card, as the menu opens it --------------------------------------------------------

    check('the File menu’s export opens the card', await askForExport(), {
      open: open()
    });
    const veil = card();
    const tabs = [...(veil?.querySelectorAll('[data-export-tab]') ?? [])];
    check(
      'one tab per kind the app ships, and the docx is the one on show',
      tabs.map((tab) => tab.dataset.exportTab).join(',') === 'docx,odt' &&
        tabs[0].classList.contains('tab-active') &&
        !tabs[1].classList.contains('tab-active'),
      tabs.map((tab) => tab.dataset.exportTab)
    );
    check(
      'the target starts in the note’s own folder, named after the note',
      field()?.value === target,
      field()?.value
    );
    const config = veil?.querySelector('[data-export-config]')?.textContent ?? '';
    check(
      'the card names the conversion settings file it would hand to pandoc',
      config.endsWith('/export/export.docx.yaml'),
      config
    );
    const status = veil?.querySelector('[data-export-status]')?.textContent ?? '';
    check('and says which pandoc would write the file', status.includes('pandoc:'), status);
    // The card as the reader sees it: a box inside the window, its rows stacked in the order they
    // are read, and none of them hanging outside it. What a screenshot would be looked at for.
    const cardBox = box(veil.querySelector('[data-export-card]'));
    const rows = [
      '[data-export-tabs]',
      '[data-export-target]',
      '[data-export-config]',
      '[data-export-status]',
      '[data-export-run]'
    ].map((selector) => box(veil.querySelector(selector)));
    check(
      'the card sits inside the window, its rows in order and none of them hanging out',
      cardBox.left >= 0 &&
        cardBox.top >= 0 &&
        cardBox.right <= window.innerWidth &&
        cardBox.bottom <= window.innerHeight &&
        rows.every(
          (row) =>
            row.left >= cardBox.left &&
            row.right <= cardBox.right &&
            row.top >= cardBox.top &&
            row.bottom <= cardBox.bottom
        ) &&
        rows.every((row, index) => index === 0 || row.top >= rows[index - 1].bottom),
      { card: cardBox, rows, window: [window.innerWidth, window.innerHeight] }
    );

    // The button that hands the reader their own copy of the parameters. What it does is the
    // window's ask — the harness holds the opener's system hand away and keeps what was asked for,
    // so no editor comes up during a run — and the file it names is on the disk to be edited.
    veil.querySelector('[data-export-open-config]').click();
    await until(() => (window.__probeOpenedUrls ?? []).length > 0);
    const asked = (window.__probeOpenedUrls ?? []).filter(
      (entry) => entry.url.includes('reveal_item_in_dir') && entry.body.includes(config)
    );
    check(
      'the settings button has the file written and asks the system to reveal it in its folder',
      asked.length === 1 && (await exists(config)),
      { asked: asked.length, written: await exists(config) }
    );

    // --- the export itself ---------------------------------------------------------------------

    veil.querySelector('[data-export-run]').click();
    const written = await until(async () => (await exists(target)) && (await bytesOf(target)).length > 2000);
    const bytes = await bytesOf(target);
    // A docx is a zip, and a zip keeps its entry *names* uncompressed: the media folder of a
    // document with a picture in it is a name this can look for without unzipping anything.
    const latin = bytes === null ? '' : new TextDecoder('latin1').decode(bytes);
    check(
      'pressing Export writes a Word file where the reader asked, through the real pandoc',
      written && bytes !== null && bytes[0] === 0x50 && bytes[1] === 0x4b,
      { written, first: bytes === null ? null : [...bytes.slice(0, 2)] }
    );
    check(
      'and the picture the note shows is inside it, not left as its own description',
      latin.includes('word/media/'),
      { media: latin.includes('word/media/') }
    );
    const hint = document.querySelector('[data-hint] [data-hint-text]');
    check(
      'and the reader is told, quietly, what was written',
      (hint?.textContent ?? '').includes('note.docx'),
      hint?.textContent ?? null
    );
    const settings = await textOf(config);
    check(
      'the settings file is on the disk, with the writer this kind needs',
      settings !== null && settings.includes('writer: docx'),
      settings === null ? 'not written' : settings.split('\n').slice(0, 1)
    );

    // --- the way out that writes nothing -------------------------------------------------------

    check('the card is closed once the export is done', !open(), { open: open() });
    await askForExport();
    field().value = elsewhere;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);
    check(
      'Escape takes the card away and writes nothing at all',
      !open() && !(await exists(elsewhere)),
      { open: open(), written: await exists(elsewhere) }
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
