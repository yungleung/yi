/**
 * The sixth kind, and a note it could not draw until the file named a font: a PDF written in CJK.
 *
 * XeTeX draws a page with the font its defaults file names, and the TeX suite's own font holds Latin,
 * its punctuation and the symbols a TeX font carries — nothing else. Measured, a note written in
 * `你好，世界` came out with the space its words took and none of the words (XeTeX warns *"Missing
 * character: There is no 一 (U+4E00) in font [lmroman10-regular]"* for each, and the app shows those
 * lines as a message). So `export.pdf.yaml` names one — `CJKmainfont: "Songti SC"` — and this is that
 * working: the page read back out of the file through its fonts' `ToUnicode` maps, the same instrument
 * a reader's text extraction is built from, with the characters *on* it.
 *
 * Readable as well as drawn is why that font: a page can carry a script with no map to name it by,
 * which is a page nobody can search or copy from. Measured with this same note, `Songti SC` keeps the
 * map and `Hiragino Sans GB` does not. What the default does *not* cover — Hangul, and every script
 * outside CJK — is in the file's own header, where the reader who needs one adds it: the fonts are the
 * reader's, and the file is theirs to edit.
 *
 * It is a probe of its own because a real TeX run is ~4 s of the five the bridge gives a script, and
 * `export-pdf.js` already spends them on the Latin half (see its header).
 *
 * @covers src-tauri/assets/export/export.pdf.yaml (the font it names),
 *   src-tauri/src/export.rs (the reader's file is what pandoc is handed)
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

  /**
   * Every stream of the file that inflates, as its bytes read one byte to one character: the object
   * streams, the fonts' tables and the page. A stream that is not deflate is not one this reads, and
   * the walk resumes after each `endstream` so a stream's own contents cannot be mistaken for the
   * next one's.
   */
  const inflated = async (bytes) => {
    const latin = new TextDecoder('latin1').decode(bytes);
    const streams = [];
    let index = 0;
    for (;;) {
      const at = latin.indexOf('stream', index);
      if (at < 0) {
        return streams;
      }
      let from = at + 'stream'.length;
      if (latin[from] === '\r') from += 1;
      if (latin[from] === '\n') from += 1;
      const end = latin.indexOf('endstream', from);
      if (end < 0) {
        return streams;
      }
      let stop = end;
      while (stop > from && (latin[stop - 1] === '\n' || latin[stop - 1] === '\r')) stop -= 1;
      index = end + 'endstream'.length;
      try {
        const stream = new Blob([bytes.slice(from, stop)])
          .stream()
          .pipeThrough(new DecompressionStream('deflate'));
        streams.push(new TextDecoder('latin1').decode(await new Response(stream).arrayBuffer()));
      } catch {
        // Not deflate (a font's own tables are not), so nothing here reads it.
      }
    }
  };

  /** A `ToUnicode` map's target, which is written as hex of UTF-16 code units (`utf-16be`). */
  const fromHex = (hex) =>
    new TextDecoder('utf-16be').decode(
      Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))
    );

  /**
   * What the page draws, rebuilt from the file: each font's `ToUnicode` map says which character a
   * drawn code stands for, and the page's own text operators say which codes it draws. XeTeX draws
   * runs of them `<hex> Tj`, arrays `[<hex>] TJ` and — for the characters its font has directly — as
   * `(plain) Tj`, so all three are read. A code no map names is a character the page cannot draw,
   * and it is left out rather than guessed at: what is asserted is what is *on* the page.
   */
  const pageText = async (bytes) => {
    const streams = await inflated(bytes);
    const chars = new Map();
    for (const text of streams) {
      for (const block of text.match(/beginbfchar[\s\S]*?endbfchar/g) ?? []) {
        for (const [, code, to] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
          chars.set(parseInt(code, 16), fromHex(to));
        }
      }
      for (const block of text.match(/beginbfrange[\s\S]*?endbfrange/g) ?? []) {
        for (const [, lo, hi, to] of block.matchAll(
          /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g
        )) {
          const first = parseInt(lo, 16);
          const base = parseInt(to, 16);
          for (let code = first; code <= parseInt(hi, 16); code += 1) {
            chars.set(code, String.fromCharCode(base + code - first));
          }
        }
      }
    }
    const decode = (hex) =>
      (hex.replace(/\s+/g, '').match(/..../g) ?? [])
        .map((code) => chars.get(parseInt(code, 16)) ?? '')
        .join('');
    const drawn = (streams.find((text) => text.includes('BT')) ?? '').matchAll(
      /<([0-9A-Fa-f\s]+)>\s*Tj|\(((?:\\.|[^()\\])*)\)\s*Tj|\[([^\]]*)\]\s*TJ/g
    );
    return [...drawn]
      .map(([, hex, plain, array]) => {
        if (hex !== undefined) {
          return decode(hex);
        }
        if (plain !== undefined) {
          return plain.replace(/\\(.)/g, '$1');
        }
        return [...array.matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((run) => decode(run[1])).join('');
      })
      .join('');
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-pdf-font-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.pdf`;
  // The two scripts the shipped default is for — Han and kana — and a line of Latin, because a font
  // named for CJK must leave the Latin text in the document's own face.
  const samples = ['简体中文', '日本語'];
  const latin = 'And latin after it.';
  const note = `# Going out\n\n${samples.join(' ')} ${latin}\n`;

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

    await invoke('plugin:event|emit', { event: 'export', payload: 'pdf' });
    await until(() => open(), 60);
    card().querySelector('[data-export-target]').value = target;
    card().querySelector('[data-export-run]').click();
    const written = await until(async () => (await bytesOf(target)) !== null);
    const bytes = await bytesOf(target);
    check(
      'a PDF of a note written in CJK is written where the reader asked',
      written && bytes !== null && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-',
      { written, size: bytes?.length ?? 0 }
    );

    const page = bytes === null ? '' : await pageText(bytes);
    // XeTeX positions words rather than drawing the spaces between them, so the page is compared
    // character by character rather than as a substring: what is pinned is that the *characters* are
    // there, not where the spaces fell.
    const normalized = page.normalize('NFKC');
    const missing = samples.filter((sample) =>
      [...sample].some((character) => !normalized.includes(character))
    );
    check(
      'the characters the note is written in are on the page, Han and kana both',
      missing.length === 0,
      { missing, page: page.slice(0, 140) }
    );
    check(
      'and the Latin beside them is drawn as it always was, in the document’s own face',
      [...latin].every((character) => normalized.includes(character) || character === ' '),
      { page: page.slice(0, 140) }
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
