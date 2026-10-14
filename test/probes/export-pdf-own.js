/**
 * The sixth kind's other hand: the app's own renderer, the `markdown2pdf` crate — a PDF with no
 * pandoc and no TeX suite on the machine at all.
 *
 * What the card *offers* this hand is `export-pdf.js`; what this probe is about is the page it
 * writes, read back out of the file. Two things are worth reading there and neither is visible from
 * outside otherwise:
 *
 * - **the note went through the pre-process first.** Every kind shares it (`ui/export/preprocess.ts`)
 *   and this hand has no citeproc behind it, so the text it is handed carries the words a citation
 *   reads as and the works it names listed under them — not the `[@key]` the author wrote. Measured
 *   below on the page itself: a citation left as written would draw `[`, `@` and `]`, and this page
 *   draws none of them.
 * - **the page is the size and the way up the card was asked for** — a landscape Letter sheet —
 *   which the file's own `/MediaBox` answers.
 *
 * Reading the page means the fonts' `ToUnicode` maps, which is what a reader's own text extraction
 * is built from: each `<glyphs> Tj` run draws font codes, and the maps say which characters they
 * are. The app's renderer draws its text that way and writes the maps, so the page can be
 * reconstructed here rather than taken on trust.
 *
 * @covers src-tauri/src/export.rs (export_with_markdown2pdf), src/ui/export/preprocess.ts (a
 *   citation as the words it reads as, and the works it names listed under them),
 *   src/ui/export/export_flow.ts (which hands are handed the citations to render)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
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

  /**
   * Every stream of the file that inflates, as its own bytes read one byte to one character: the
   * object streams, the fonts' tables and the page. A stream that is not deflate is not one this
   * reads, and the walk resumes after each `endstream` so a stream's own contents cannot be mistaken
   * for the next one's.
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
   * The page: what it draws, and the box it is drawn in. Null when the file is not there or holds
   * nothing that draws — a page of nothing is a check that fails rather than one that throws.
   */
  const pageOf = async (path) => {
    const bytes = await bytesOf(path);
    if (bytes === null) {
      return null;
    }
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
    const drawn = (streams.find((text) => text.includes('BT')) ?? '').matchAll(
      /<([0-9A-Fa-f\s]+)>\s*Tj/g
    );
    const text = [...drawn]
      .map((run) =>
        (run[1].replace(/\s+/g, '').match(/..../g) ?? [])
          .map((code) => chars.get(parseInt(code, 16)) ?? '')
          .join('')
      )
      .join('');
    const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(
      streams.join('\n')
    );
    return {
      text,
      width: box === null ? null : Number(box[3]) - Number(box[1]),
      height: box === null ? null : Number(box[4]) - Number(box[2])
    };
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-pdf-own-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/own.pdf`;
  const checkout = window.__probePaths.checkout;
  // A citation the fixtures' library holds, and a wikilink whose words are its own: the two things
  // the pre-process answers that this hand cannot answer for itself.
  const note = '# Going out\n\nA citation [@smith2020] and a link [[other|an alias]].\n';

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
    await files.writeTextAtomically(`${folder}/other.md`, '---\ntitle: The Other Note\n---\n\n# other\n');
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    // The library the app renders the citations from is the one its settings name, so this probe
    // names one it can rely on — the fixtures' own.
    await configManager.update({ bibliography_file: `${checkout}test/fixtures/workspace/zotero.bib` });
    await show(notePath, note);
    check(
      'the note the probe opened is the document on screen',
      (document.querySelector('.prose')?.textContent ?? '').startsWith('Going out'),
      { onScreen: (document.querySelector('.prose')?.textContent ?? '').slice(0, 24) }
    );

    await invoke('plugin:event|emit', { event: 'export', payload: 'pdf' });
    await until(() => open(), 60);
    const veil = card();
    const hand = veil.querySelector('[data-export-hand]');
    hand.value = 'markdown2pdf';
    hand.dispatchEvent(new Event('change', { bubbles: true }));
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
    // A page the card could not have got wrong by accident: not the default size, and lying down.
    theme.value = 'modern';
    theme.dispatchEvent(new Event('change', { bubbles: true }));
    size.value = 'Letter';
    size.dispatchEvent(new Event('change', { bubbles: true }));
    orientation.value = 'landscape';
    orientation.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);
    veil.querySelector('[data-export-target]').value = target;
    veil.querySelector('[data-export-run]').click();
    const owned = await until(async () => (await bytesOf(target)) !== null);
    const bytes = await bytesOf(target);
    const page = await pageOf(target);
    // A Letter sheet is 792 × 612 points lying down (and 612 × 792 standing up).
    const letterLandscape =
      page !== null &&
      page.width !== null &&
      page.height !== null &&
      Math.abs(page.width - 792) < 1 &&
      Math.abs(page.height - 612) < 1;
    check(
      'and it writes a PDF itself — no pandoc, no TeX suite — on a landscape Letter page',
      owned &&
        bytes !== null &&
        String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-' &&
        bytes.length > 1000 &&
        letterLandscape,
      { size: bytes?.length ?? 0, box: page === null ? null : [page.width, page.height] }
    );
    check(
      'the page carries the note the app prepared: the citation as the words it reads as, and the works it names under them',
      page !== null &&
        page.text.includes('(Smith, 2020)') &&
        page.text.includes('References') &&
        page.text.includes('Smith, J. (2020)'),
      { page: page?.text ?? null }
    );
    check(
      'and the wikilink as the words it renders as, with no key left unresolved anywhere on the page',
      page !== null && page.text.includes('an alias'),
      { page: page?.text ?? null }
    );
    check(
      'and none of the marks a citation left as written would draw: this page has no `[@…]` on it',
      page !== null && !page.text.includes('[@') && !page.text.includes('@smith2020'),
      { page: page?.text ?? null }
    );
  } finally {
    await configManager.save(before);
    try {
      await files.deleteEntry(folder);
    } catch {
      // Nothing to tidy.
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
