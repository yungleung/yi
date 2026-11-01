/**
 * Ten scripts and the page they are drawn on, with nothing added to the settings file at all.
 *
 * A page has no font fallback: XeTeX draws it with the font in force and reports every character that
 * font lacks as *missing character*, which is why a note in `你好，世界` once came out with the space
 * its words took and none of the words. The app's answer used to be a line for the reader to write —
 * the card named the widest font the machine had, and `export-pdf-font.js` is that line working. This
 * is the other answer: the build ships a face per script and a header of its own
 * (`src-tauri/src/export_fonts.rs` writes `assets/export/pdf-fonts.tex` into the export folder), and a
 * note in any of these comes out drawn with the shipped file exactly as it ships.
 *
 * Three things are pinned here, and the first is the one that makes the other two mean anything:
 *
 * 1. **the file names no font** — the copy under the app's data folder is put back to the shipped bytes
 *    before the export, so what draws the page is the build and not an earlier round's recipe;
 * 2. **every script is on the page**, read back through the fonts' own `ToUnicode` maps (`lib.js:
 *    pdfText`, one map per font, chosen by the `/Fn Tf` in force) — a page that drew the words with
 *    no map to name them by would be a page nobody could search or copy from;
 * 3. **the faces that drew it are this build's**, named in the PDF's own `/BaseFont` entries: a green
 *    page whose fonts were the platform's would pass (2) and prove nothing about what is shipped.
 *
 * It also fails when the app stops handing the reader's file to pandoc as it stands, which is the thing
 * that makes the file the reader's.
 *
 * It is a probe of its own because a real TeX run is ~4 s of the five the bridge gives a script, and
 * `export-pdf.js` already spends them on the Latin half (see its header).
 *
 * @covers src-tauri/assets/export/pdf-fonts.tex (the header),
 *   src-tauri/src/export_fonts.rs (the faces, the header written per export, what they cover),
 *   src-tauri/src/export.rs (the header reaches pandoc), src-tauri/assets/export/export.pdf.yaml
 *   (names no font, and still draws), test/probes/lib.js (pdfText)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
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
  // A line each of the scripts a face is shipped for, and one of Latin to show the page still says what
  // it always did around them.
  const scripts = [
    '简体中文',
    '日本語',
    '한국어',
    'Ελληνικά',
    'Русский',
    'עברית',
    'العربية',
    'हिन्दी',
    'ภาษาไทย',
    'Հայերեն',
    'ქართული'
  ];
  const latin = 'And latin after it.';
  // The last line asks for **bold** in two of those scripts, one of each kind the build can answer with:
  // Hebrew, whose face ships a real bold, and Hangul, whose face ships one weight and is emboldened
  // instead — that pair is what says a *note's* bold survives either way.
  const bold = `**${scripts[5]}**`;
  const emboldened = `**${scripts[2]}**`;
  const note = `# Going out\n\n${scripts.join(' ')} ${latin}\n\n${bold} ${emboldened}\n`;
  /** The faces the header names, as they appear in the PDF's own font names. */
  const faces = [
    'NotoSerifCJKsc',
    'NotoSerifHebrew',
    'Amiri',
    'NotoSerifDevanagari',
    'NotoSerifThai',
    'NotoSerifArmenian',
    'NotoSerifGeorgian'
  ];
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
  const config = (await invoke('export_config_path', { kind: 'pdf' })) ?? '';
  const wasThere = await bytesOf(config);
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

    // The shipped file, as a fresh install has it: the app's own copy is written there on the first
    // export of a kind, and what it holds is what the reader starts from.
    const shipped = await invoke('export_restore_config', { kind: 'pdf' });
    const settingsText = await bytesOf(config).then((bytes) =>
      bytes === null ? '' : new TextDecoder().decode(bytes)
    );
    check(
      'the settings file the export runs with names no font at all',
      !settingsText
        .split('\n')
        .some((line) => !line.trimStart().startsWith('#') && line.includes('ont:')),
      {
        path: shipped,
        named: settingsText.split('\n').filter((line) => /^\s+\w*[Ff]ont:/.test(line))
      }
    );

    await show(notePath, note);
    await invoke('plugin:event|emit', { event: 'export', payload: 'pdf' });
    await until(() => open(), 60);
    const hints = t.hintsNow();
    card().querySelector('[data-export-target]').value = target;
    card().querySelector('[data-export-run]').click();
    const written = await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
    const bytes = await bytesOf(target);
    check(
      'the export writes a PDF, so the file reached pandoc as it stands',
      written && bytes !== null && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-',
      { written, size: bytes?.length ?? 0 }
    );

    // The page, read back one font at a time. XeTeX positions words rather than drawing the spaces
    // between them, so each script is compared character by character rather than as a substring.
    const page = bytes === null ? '' : (await t.pdfText(bytes)).normalize('NFKC');
    const missing = scripts.filter((script) =>
      [...script].some((character) => !page.includes(character))
    );
    check(
      'and every script it ships a face for is on the page, no line added to the file',
      // The Arabic word too, letter for letter and the right way round for a page read out of the
      // file: RTL text is written in visual order, so what is pinned is its mirror — a face whose map
      // names the dotless bases (Noto Naskh Arabic does; see NOTICE.md) fails this and passed the
      // per-character check above.
      missing.length === 0 &&
        page.includes('简体中文') &&
        page.includes('日本語') &&
        page.includes([...'العربية'].reverse().join('')),
      { missing, page: page.slice(0, 120) }
    );
    check(
      'with the Latin beside them drawn as it always was',
      [...latin].every((character) => page.includes(character) || character === ' '),
      { page: page.slice(0, 120) }
    );

    // And the faces that drew it are this build's, read out of the file's own font names: a page drawn
    // with the platform's fonts would answer the two checks above and say nothing about what is shipped.
    const drawn = bytes === null ? [] : await t.pdfFonts(bytes);
    const absent = faces.filter((face) => !drawn.some((name) => name.includes(face)));
    check(
      'and it was drawn with the faces this build ships, not with the machine’s',
      absent.length === 0,
      { absent, drawn: drawn.slice(0, 14) }
    );

    // And the two bold runs above are *bold*, by the two answers this build has. The Hebrew one is a
    // real bold face, so the page carries it by name. The Hangul one has no bold face to carry — the Han
    // face's is 25.5 MB, measured, against 1.75 MB for every other face's styles together — so it is XeTeX's emboldening:
    // the glyphs stroked as well as filled (`2 Tr` and a line width), which is the only place a page
    // says anything about weight, since the text and the font's name both stay the same. Measured
    // without either: LaTeX substitutes the regular face with *"Font shape …/bx/n undefined"* and the
    // weight a heading asked for is gone.
    const commands = bytes === null ? '' : await t.pdfContent(bytes);
    check(
      'a bold run in a script this build has a bold face for is drawn with that face',
      drawn.some((name) => name.includes('NotoSerifHebrew-Bold')),
      { drawn: drawn.slice(0, 16) }
    );
    check(
      'and one in a script it has none for is emboldened instead, stroked and with no second face',
      commands.includes('2 Tr') &&
        /\d[\d.]*\s+w/.test(commands) &&
        !drawn.some((name) => name.includes('CJKsc-Bold')),
      {
        stroked: (commands.match(/2 Tr/g) ?? []).length,
        widths: (commands.match(/\d[\d.]*\s+w/g) ?? []).slice(0, 3),
        drawn: drawn.slice(0, 16)
      }
    );
  } finally {
    // The reader's own file is put back exactly as it was found — and taken away again when there was
    // none, so a run leaves the app as it found it.
    if (wasThere !== null) {
      await files.writeTextAtomically(config, new TextDecoder().decode(wasThere));
    } else {
      try {
        await files.deleteEntry(config);
      } catch {
        // Nothing to remove.
      }
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
