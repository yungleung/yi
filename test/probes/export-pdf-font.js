/**
 * The fonts the reader names, and the page they draw — Han and kana with `CJKmainfont`, Hebrew with
 * `yi-hebrew-font`, and Hangul with the face this build ships.
 *
 * `export-pdf-scripts.js` is the other half of this: a note in ten scripts, drawn with nothing named in
 * the settings file at all. What that leaves out is the reader who *does* name one — the header the app
 * writes gives a script the name the file gives it (`export_fonts::write_header`, one line per script:
 * `yi-hebrew-font`, `yi-thai-font`, … and `CJKmainfont` for Han and kana) — and this is that handover
 * working on a real page: two of the file's lines are added to the reader's own copy, the export runs,
 * and the PDF's own `/BaseFont` entries say which face drew what. The sharp half is what is *absent*:
 * the shipped Hebrew face must be gone from that page, or naming one of your own would be a promise the
 * app does not keep.
 *
 * Measured here, and the reason Hangul is shipped at all: the macOS `Songti SC` draws Han and kana and
 * **has no Hangul** — a Korean note that named it lost every syllable — so a file that names a face for
 * Han alone still gets Hangul from this build's face.
 *
 * It also fails when the app stops handing the reader's file to pandoc as it stands, which is the thing
 * that makes the file the reader's.
 *
 * @covers src-tauri/assets/export/pdf-fonts.tex (the two ways Han is set),
 *   src-tauri/src/export_fonts.rs (the name handed over), src-tauri/src/export.rs (the file read for it)
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
  const folderName = `yi-probe-export-pdf-font-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.pdf`;
  // Han, kana and Hangul, with a line of Latin: a CJK font named for the first two must leave both the
  // document's own face and the shipped Hangul face alone.
  const cjk = ['简体中文', '日本語'];
  const hangul = '한국어';
  const hebrew = 'עברית';
  const greek = 'Ελληνικά';
  const latin = 'And latin after it.';
  const note = `# Going out\n\n${cjk.join(' ')} ${hangul} ${hebrew} ${greek} ${latin}\n`;
  /** The font the reader names, and how its own name appears in the PDF once it has drawn anything. */
  const named = 'Songti SC';
  const namedFace = 'STSongti';
  const namedHebrew = 'Arial Unicode MS';
  const namedHebrewFace = 'ArialUnicodeMS';

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

    // The reader's own file, with the one line a reader would add — anchored to the `variables:` line
    // the file really holds, since the header above it mentions both variables by name.
    const shipped = await invoke('export_restore_config', { kind: 'pdf' });
    const settings = await bytesOf(config).then((bytes) =>
      bytes === null ? '' : new TextDecoder().decode(bytes)
    );
    const withFont = settings.replace(
      '\nvariables:\n',
      `\nvariables:\n  CJKmainfont: "${named}"\n  yi-hebrew-font: "${namedHebrew}"\n`
    );
    check(
      'the lines the reader writes go into their own settings file, where pandoc reads them',
      withFont !== settings &&
        withFont.includes(`CJKmainfont: "${named}"`) &&
        withFont.includes(`yi-hebrew-font: "${namedHebrew}"`),
      {
        path: shipped,
        lines: withFont.split('\n').filter((line) => line.includes(named) || line.includes(namedHebrew))
      }
    );
    await files.writeTextAtomically(config, withFont);

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
      'the export still writes a PDF, so the line reached pandoc',
      written && bytes !== null && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-',
      { written, size: bytes?.length ?? 0 }
    );

    const page = bytes === null ? '' : (await t.pdfText(bytes)).normalize('NFKC');
    // Each script's *characters*, one by one: the page is written right to left where the script is, so
    // a Hebrew word reads back reversed, and what is pinned is that every character is on it.
    const missing = [...cjk.join(''), ...[hangul, hebrew, greek].join('')].filter(
      (character) => !page.includes(character) && character !== ' '
    );
    check(
      'and the characters of Han, kana, Hangul, Hebrew and Greek are all on the page',
      missing.length === 0,
      { missing, page: page.slice(0, 120) }
    );
    check(
      'with the Latin beside them drawn in the document’s own face',
      [...latin].every((character) => page.includes(character) || character === ' '),
      { page: page.slice(0, 120) }
    );

    // Which face drew what, out of the file's own font names: Han and kana with the reader's font, and
    // Hangul with the one the build ships.
    const drawn = bytes === null ? [] : await t.pdfFonts(bytes);
    check(
      'Han and kana are drawn with the font the file names for CJK, and not with a face of the build’s',
      drawn.some((name) => name.includes(namedFace)),
      { drawn: drawn.slice(0, 12) }
    );
    check(
      'and Hangul with the face this build ships, which is why a Korean note survives that line',
      drawn.some((name) => name.includes('NotoSerifCJKsc')),
      { drawn: drawn.slice(0, 12) }
    );
    check(
      'Hebrew is drawn with the face the file names for *that* script, with this build’s Hebrew face absent',
      drawn.some((name) => name.includes(namedHebrewFace)) &&
        !drawn.some((name) => name.includes('NotoSerifHebrew')),
      { drawn: drawn.slice(0, 12) }
    );
    check(
      'and a script the file names nothing for still gets this build’s own face',
      drawn.some((name) => name.includes('NotoSerif-Regular')),
      { drawn: drawn.slice(0, 12) }
    );
  } finally {
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
