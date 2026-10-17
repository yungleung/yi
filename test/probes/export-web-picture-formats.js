/**
 * An SVG and a webp the note names on the web: fetched by the app, then carried or drawn by the kind.
 *
 * A local SVG or webp already follows the kind (`export-picture-formats.js`): a page, a book and the
 * app's own markdown carry it as itself; a Word file gets a PNG the webview draws. A web picture was
 * the other half — the app's fetch answered only the five types a Word file holds, so a remote SVG or
 * webp was reported as a picture it could not fetch. This proves the fetch keeps the format and the
 * pre-process then treats it exactly as a local one: the docx has PNGs the app drew and neither
 * original, while the EPUB carries both originals and no PNG.
 *
 * The fake curl (`fake-curl.sh`) answers a URL with `svg` or `webp` in it from the picture this probe
 * put in the recorder's folder, and says the matching content type. Nothing goes to the network.
 *
 * @covers src-tauri/src/export.rs (image_extension, download_image, export_fetch_image),
 *   src/ui/export/export_flow.ts (the web pictures fetched before the pre-process),
 *   src/ui/export/preprocess.ts (the remote rule), src/ui/export/raster_picture.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const api = await t.app('/src/api/export.ts');
  const session = await t.app('/src/services/session.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const readText = async (path) => {
    const read = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read));
  };
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
  const until = async (ready, tries = 120) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-web-pictures-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const recorder = `${home}/yi-probe-fake-curl`;
  const notePath = `${folder}/note.md`;
  const docxTarget = `${folder}/note.docx`;
  const epubTarget = `${folder}/note.epub`;
  const markdownTarget = `${folder}/note.processed.md`;
  const svgUrl = 'https://example.com/diagram.svg';
  const webpUrl = 'https://example.com/photo.webp';
  const note =
    '# Pictures from the web\n\n' +
    `A diagram: ![diagram](${svgUrl}), a photo: ![photo](${webpUrl})\n`;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60">' +
    '<rect width="120" height="60" fill="#3b82f6"/>' +
    '<circle cx="60" cy="30" r="20" fill="#f59e0b"/></svg>';
  // The webp `export-picture-formats.js` uses: 258 x 2, and what makes the fetched file a webp the
  // webview can decode rather than a name the server happened to give.
  const webp = Uint8Array.from(
    atob('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoCAQIAAUAmJQBOgCHwAP7+4AAAAA=='),
    (character) => character.charCodeAt(0)
  );

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
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
  const exportTo = async (kind, target) => {
    const hints = t.hintsNow();
    await invoke('plugin:event|emit', { event: 'export', payload: kind });
    await until(() => open(), 60);
    await sleep(150);
    card().querySelector('[data-export-target]').value = target;
    card().querySelector('[data-export-run]').click();
    return await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
  };

  const before = await invoke('get_config');
  try {
    for (const stale of [folder, recorder]) {
      try {
        await files.deleteEntry(stale);
      } catch {
        // A folder a run the bridge cut off left behind.
      }
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'note.md', true);
    await files.writeTextAtomically(notePath, note);
    // The fake curl copies these out for a URL that names them, so the bytes the app fetches are a
    // real SVG and a real webp.
    await files.createEntry(home, 'yi-probe-fake-curl', false);
    await files.writeTextAtomically(`${recorder}/picture.svg`, svg);
    await window.__TAURI_INTERNALS__.invoke('plugin:fs|write_file', webp, {
      headers: { path: encodeURIComponent(`${recorder}/picture.webp`) }
    });
    await t.openWorkspace(folder);
    await show(notePath, note);
    await api.pointAtCurl(`${window.__probePaths.checkout}test/probes/fake-curl.sh`);

    // --- the kinds that cannot hold either format -----------------------------------------------

    const wroteDocx = await exportTo('docx', docxTarget);
    const docx = wroteDocx ? await bytesOf(docxTarget) : null;
    const docxMedia = docx === null ? [] : t.zipNames(docx).filter((name) => name.startsWith('word/media/'));
    check(
      'a docx of two pictures on the web carries PNGs the app drew, and neither format',
      docxMedia.filter((name) => name.endsWith('.png')).length === 2 &&
        !docxMedia.some((name) => name.endsWith('.svg') || name.endsWith('.webp')),
      { media: docxMedia }
    );

    // --- the kind that can ------------------------------------------------------------------------

    const wroteEpub = await exportTo('epub', epubTarget);
    const epub = wroteEpub ? await bytesOf(epubTarget) : null;
    const epubMedia =
      epub === null ? [] : t.zipNames(epub).filter((name) => name.startsWith('EPUB/media/'));
    check(
      'a book carries both as they are: an SVG and a webp, and no PNG',
      epubMedia.some((name) => name.endsWith('.svg')) &&
        epubMedia.some((name) => name.endsWith('.webp')) &&
        !epubMedia.some((name) => name.endsWith('.png')),
      { media: epubMedia }
    );

    // --- the app's own markdown keeps the address -------------------------------------------------

    const wroteMarkdown = await exportTo('markdown', markdownTarget);
    const processed = wroteMarkdown ? await readText(markdownTarget) : '';
    check(
      'the app’s own markdown keeps both URLs, so the reader’s file survives the run',
      wroteMarkdown &&
        processed.includes(svgUrl) &&
        processed.includes(webpUrl) &&
        !processed.includes('/export/tmp/remote/'),
      { wrote: wroteMarkdown, processed }
    );

    // --- and the copies are the run's own ---------------------------------------------------------

    const log = await readText(`${recorder}/argv.log`);
    const downloads = [...log.matchAll(/\n(\/[^\n]*\/export\/tmp\/remote\/[^\n]*)\n/g)].map(
      (match) => match[1]
    );
    const left = [];
    for (const path of downloads) {
      if (await exists(path)) {
        left.push(path);
      }
    }
    check(
      'and the copies fetched for the run are gone when it is over',
      // Two exports of two pictures each: a run fetches its own copy rather than remembering one,
      // because the page it came from may have changed.
      downloads.length === 4 && left.length === 0,
      { downloads, left }
    );
  } finally {
    await api.pointAtCurl(null);
    for (const stale of [folder, recorder]) {
      try {
        await files.deleteEntry(stale);
      } catch {
        // Nothing to tidy.
      }
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
