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
 * The local HTTP fixture answers the two URLs with the matching content types. Nothing leaves the
 * machine.
 *
 * @needs-http-fixture
 * @covers src-tauri/src/export/pictures.rs (image_extension, download_image, export_fetch_image),
 *   src/ui/export/workflow/index.ts (the web pictures fetched before the pre-process),
 *   src/ui/export/pipeline/preprocess.ts (the remote rule), src/ui/export/assets/raster_picture.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
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
  const notePath = `${folder}/note.md`;
  const docxTarget = `${folder}/note.docx`;
  const epubTarget = `${folder}/note.epub`;
  const markdownTarget = `${folder}/note.processed.md`;
  const svgUrl = `${window.__probeHttpBase}/image.svg`;
  const webpUrl = `${window.__probeHttpBase}/image.webp`;
  const note =
    '# Pictures from the web\n\n' +
    `A diagram: ![diagram](${svgUrl}), a photo: ![photo](${webpUrl})\n`;
  const appData = await invoke('plugin:path|resolve_directory', { directory: 14 });
  const remote = await invoke('plugin:path|join', {
    paths: [appData, 'export', 'tmp', 'remote']
  });

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
    for (const stale of [folder]) {
      try {
        await files.deleteEntry(stale);
      } catch {
        // A folder a run the bridge cut off left behind.
      }
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'note.md', true);
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await show(notePath, note);

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

    check(
      'and the copies fetched for the run are gone when it is over',
      !(await exists(remote)),
      { remote, stillThere: await exists(remote) }
    );
  } finally {
    for (const stale of [folder]) {
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
