/**
 * The export a reader asks for, from the File menu to a Word file on the disk.
 *
 * This is the wire end to end: the File menu's *Export* item for the docx (the event it emits carries
 * the kind, `export-kinds.js` walks them all) runs the command, the command opens the card for
 * that kind, the card's field says what would be written, pressing *Export* runs the real pandoc
 * against the app's own defaults file, and what appears where the reader asked for it is a docx
 * (`PK`, the zip every Word file is). Escape, the other way out, writes nothing at all — not even the
 * configuration file, which is why the first half asks for it before it is made.
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
  const api = await t.app('/src/api/export.ts');
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
  // A folder of this run's own: a probe's *live* session is not reset between runs — the harness
  // puts the session *file* back, which the next start reads — so a note opened twice under one
  // name is a note the session already holds, and opening it again hands the editor nothing. One
  // name per run is what makes this probe a function of its own state and nothing else's.
  const folderName = `yi-probe-export-docx-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.docx`;
  /** The note's own path without an extension: what every kind's target is built out of. */
  const baseTarget = `${folder}/note`;
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

  /** Asks the app to export, the way the File menu does: the event the item for the docx emits. */
  const askForExport = async () => {
    await invoke('plugin:event|emit', { event: 'export', payload: 'docx' });
    return await until(() => open(), 60);
  };
  /**
   * Opens a note through the session, declining the question a replaced document may raise, and
   * waits for it — *bounded*, because a probe whose open never settles reports no verdict at all
   * (the bridge gives a script five seconds, and a probe that is still awaiting has nothing to
   * stash). The question is polled for rather than clicked at after a fixed sleep: how long the
   * session takes to ask is the app's business, and a click that lands before the card is up leaves
   * the open pending for ever. Where the document did *not* arrive, the probe's own first check
   * says so.
   */
  const show = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    let opened = false;
    void pending.then(() => {
      opened = true;
    });
    // The question is polled for *while the open is still pending*: answering it is what lets the
    // open finish, and an open that finished on its own needed no answer — so the common path costs
    // nothing, and the card that is up for a while is still answered.
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

    // --- the card, as the menu opens it --------------------------------------------------------

    check('the File menu’s export opens the card', await askForExport(), {
      open: open()
    });
    const veil = card();
    check(
      'the card is about the kind the menu item named, and the docx is the one the menu knows',
      veil?.dataset.exportKind === 'docx',
      { kind: veil?.dataset.exportKind ?? null }
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

    // The button that hands the reader their own copy of the parameters. It is the package
    // editor's YAML panel, not a system reveal: the file is written, named, and editable in place.
    veil.querySelector('[data-export-open-config]').click();
    const opened = await until(
      () => document.querySelector('[data-template-editor] .cm-editor') !== null
    );
    check(
      'the settings button has the file written and opens it in the defaults editor',
      opened &&
        (await exists(config)) &&
        document.querySelector('[data-template-file="export.docx.yaml"]') !== null,
      {
        opened,
        written: await exists(config),
        file: document.querySelector('[data-template-file="export.docx.yaml"]') !== null
      }
    );
    document.querySelector('[data-template-editor-close]')?.click();
    await sleep(100);

    // --- the export itself ---------------------------------------------------------------------

    const hints = t.hintsNow();
    veil.querySelector('[data-export-run]').click();
    const written = await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
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
