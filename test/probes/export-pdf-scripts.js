/**
 * The line the card tells a reader to add, added — and the page it makes.
 *
 * The shipped `export.pdf.yaml` names `CJKmainfont: "Songti SC"`, which is measured to set Han and
 * kana and nothing else, so a note in Hangul, Greek, Cyrillic, Hebrew, Arabic, Devanagari, Thai,
 * Armenian or Georgian comes out with the space its words took and none of the words until a font is
 * named for it. The app's answer is to *say* which lines to add (`export-font-hint.js` holds the hint,
 * and names the widest font this machine is known to have — in **both** variables, because xeCJK sets
 * Hangul with `CJKmainfont` and `mainfont` cannot answer for it, measured). This is that advice
 * followed, and the proof it is good: the font comes *from the app* —
 * `namedFonts(kind).suggested_font`, the very name the card showed — it is written into the reader's
 * own settings file for the length of one export, and the page is read back through its fonts'
 * `ToUnicode` maps (`lib.js: pdfText`), every script on it.
 *
 * It also fails when the app stops handing the reader's file to pandoc as it stands, which is the thing
 * that makes the file the reader's: a line written into it that pandoc never sees proves nothing.
 *
 * A machine the app has no font for (see `WIDEST_FONT` in `src-tauri/src/export.rs`, measured only on
 * macOS so far) has nothing to follow, and this says so rather than passing quietly; the settings
 * file's own header carries the per-OS recipe for that machine.
 *
 * @covers src-tauri/src/export.rs (suggested_font — the name the card gives),
 *   src-tauri/assets/export/export.pdf.yaml (the line the reader adds), test/probes/lib.js (pdfText)
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
  const until = async (ready, tries = 200) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-scripts-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.pdf`;
  // A line each of the scripts the default has none of, and one of Latin to show the page still says
  // what it always did around them.
  const scripts = ['한국어', 'Ελληνικά', 'العربية', 'हिन्दी', 'ภาษาไทย'];
  const latin = 'And latin after it.';
  const note = `# Going out\n\n${scripts.join(' ')} ${latin}\n`;

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

  const before = await invoke('get_config');
  const settings = (await api.exportKinds()).kinds.find((kind) => kind.kind === 'pdf').config_path;
  const shipped = await bytesOf(settings).then((bytes) =>
    bytes === null ? null : new TextDecoder().decode(bytes)
  );
  const suggested = (await api.namedFonts('pdf')).suggested_font;
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
    check(
      'this machine has a font the app can name — the line the card gives a reader',
      suggested !== null && shipped !== null,
      { suggested }
    );
    if (suggested === null || shipped === null) {
      return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
    }

    // The reader's own file, with the two lines the card names added where a reader would add them.
    // Anchored to the *lines* the file really holds — the header's comments mention both of these, and
    // replacing the first textual occurrence of one edits a comment instead (measured: that is how this
    // probe corrupted the app's own copy).
    const withFont = shipped
      .replace('\nvariables:\n', `\nvariables:\n  mainfont: "${suggested}"\n`)
      .replace('\n  CJKmainfont: "Songti SC"', `\n  CJKmainfont: "${suggested}"`);
    check(
      'and both lines the card gives go into the copy of the settings file the reader owns',
      withFont !== shipped &&
        withFont.includes(`mainfont: "${suggested}"`) &&
        withFont.includes(`CJKmainfont: "${suggested}"`),
      { lines: withFont.split('\n').filter((line) => line.includes(suggested)) }
    );
    await files.writeTextAtomically(settings, withFont);

    await show(notePath, note);
    await invoke('plugin:event|emit', { event: 'export', payload: 'pdf' });
    await until(() => open(), 60);
    card().querySelector('[data-export-target]').value = target;
    card().querySelector('[data-export-run]').click();
    const written = await until(async () => (await bytesOf(target)) !== null);
    const bytes = await bytesOf(target);
    check(
      'the export still writes a PDF, so the line reached pandoc',
      written && bytes !== null && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-',
      { written, size: bytes?.length ?? 0 }
    );

    const page = bytes === null ? '' : await t.pdfText(bytes);
    const normalized = page.normalize('NFKC');
    const missing = scripts.filter((script) =>
      [...script].some((character) => !normalized.includes(character))
    );
    check(
      'and every script the note is written in is on the page, one line of the card’s advice later',
      missing.length === 0,
      { missing, page: page.slice(0, 140) }
    );
    check(
      'with the Latin beside them drawn as it always was',
      [...latin].every(
        (character) => normalized.includes(character) || character === ' '
      ),
      { page: page.slice(0, 140) }
    );
  } finally {
    // The settings file is the app's own and nothing else puts it back.
    if (shipped !== null) {
      await files.writeTextAtomically(settings, shipped);
    }
    try {
      await files.deleteEntry(folder);
    } catch {
      // Nothing to tidy.
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
