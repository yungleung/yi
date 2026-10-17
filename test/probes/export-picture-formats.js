/**
 * A picture whose format is not one of the five a Word file promises — an SVG and a webp — and what each
 * kind of export does with it: the answer depends on the *kind*.
 *
 * A page of HTML and a book hold both as they are (SVG and webp are core media types of EPUB 3.4, and a
 * book of a webp validates clean), and the app's own hand leaves the note's destinations as written —
 * while a Word file, an OpenDocument file, a page XeTeX lays out and its `.tex` cannot. Measured with
 * pandoc 3.12: a docx gets a converted PNG *beside* the raw `.svg` where the machine has a rasteriser
 * and the raw vector alone where it has none, and it carries a webp as a file no reader is promised; so
 * the app draws the PNG itself (`ui/export/raster_picture.ts`) and hands that over.
 *
 * This is that, through the app: one note naming a local `figure.svg` and a local `shot.webp`, exported
 * twice. The docx's media folder has PNGs the app drew and neither format; the book's has both. A vector
 * is drawn at twice its own size, a webp at its own — and what a run draws lives in a folder of the
 * app's own and is gone when the run is over.
 *
 * @covers src/ui/export/raster_picture.ts, src/ui/export/export_flow.ts,
 *   src-tauri/src/export.rs (carries_pictures)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { forgetRasters, rasterFolder, rasterPictures } = await t.app(
    '/src/ui/export/raster_picture.ts'
  );
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
  const folderName = `yi-probe-pictures-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const svgPath = `${folder}/figure.svg`;
  const webpPath = `${folder}/shot.webp`;
  const docxTarget = `${folder}/note.docx`;
  const epubTarget = `${folder}/note.epub`;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60">' +
    '<rect width="120" height="60" fill="#3b82f6"/>' +
    '<circle cx="60" cy="30" r="20" fill="#f59e0b"/></svg>';
  const note = '# Going out\n\nA diagram: ![figure](figure.svg), a photo: ![shot](shot.webp)\n';

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
    await invoke('plugin:event|emit', { event: 'export', payload: kind });
    await until(() => open(), 60);
    await sleep(150);
    card().querySelector('[data-export-target]').value = target;
    card().querySelector('[data-export-run]').click();
    return await until(async () => (await bytesOf(target)) !== null);
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
    await files.writeTextAtomically(svgPath, svg);
    // A webp, as bytes, because the webview *decodes* a webp and does not encode one (a canvas `toBlob`
    // for the type answers null here, measured) — the drawing half is the app's, not the probe's. Its
    // own size is what its PNG must keep, and the page is asked for it rather than assumed.
    const webp = Uint8Array.from(
      atob('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoCAQIAAUAmJQBOgCHwAP7+4AAAAA=='),
      (character) => character.charCodeAt(0)
    );
    const webpSource = await (async () => {
      const url = URL.createObjectURL(new Blob([webp], { type: 'image/webp' }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
    // The plugin's byte write takes its path in a *header*, so the call is made without the probe's
    // two-argument helper.
    await window.__TAURI_INTERNALS__.invoke('plugin:fs|write_file', webp, {
      headers: { path: encodeURIComponent(webpPath) }
    });
    await t.openWorkspace(folder);
    await show(notePath, note);

    // --- the kinds that cannot hold a picture as it is --------------------------------------------

    const wroteDocx = await exportTo('docx', docxTarget);
    const docx = wroteDocx ? await bytesOf(docxTarget) : null;
    const docxMedia = docx === null ? [] : t.zipNames(docx).filter((name) => name.startsWith('word/media/'));
    check(
      'a docx of a note with an SVG and a webp carries PNGs the app drew, and neither format',
      docxMedia.filter((name) => name.endsWith('.png')).length === 2 &&
        !docxMedia.some((name) => name.endsWith('.svg') || name.endsWith('.webp')),
      { media: docxMedia }
    );

    // What the app drew, before any converter touches it: the vector's own 120 x 60 at twice the size —
    // a diagram is drawn for a vector, and a PNG at its own size is the one that loses its hairlines.
    // (The docx's copy of the PNG is *pandoc's* re-encoding, at the page's own dpi, so a size read back
    // out of the document is pandoc's answer and not this app's.)
    const drawn = await rasterPictures(['figure.svg', 'shot.webp'], {
      bases: { document: folder, images: null },
      exists
    });
    const sizeOf = async (destination) => {
      const path = drawn.get(destination) ?? null;
      const bytes = path === null ? null : await bytesOf(path);
      return bytes === null
        ? null
        : {
            width: (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19],
            height: (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
          };
    };
    const vectorSize = await sizeOf('figure.svg');
    const webpSize = await sizeOf('shot.webp');
    check(
      'and a vector is drawn at twice its own size while a webp keeps its pixels',
      vectorSize?.width === 240 &&
        vectorSize?.height === 120 &&
        webpSize?.width === webpSource.width &&
        webpSize?.height === webpSource.height,
      { vectorSize, webpSize, webpSource }
    );
    await forgetRasters();

    // --- the kind that can ------------------------------------------------------------------------

    const wroteEpub = await exportTo('epub', epubTarget);
    const epub = wroteEpub ? await bytesOf(epubTarget) : null;
    const epubMedia = epub === null ? [] : t.zipNames(epub).filter((name) => name.startsWith('EPUB/media/'));
    check(
      'a book carries both as they are: an SVG and a webp, and no PNG',
      epubMedia.some((name) => name.endsWith('.svg')) &&
        epubMedia.some((name) => name.endsWith('.webp')) &&
        !epubMedia.some((name) => name.endsWith('.png')),
      { media: epubMedia }
    );

    // --- and the app's own scratch ----------------------------------------------------------------

    check(
      'the pictures a run drew are gone when it is over',
      (await exists(await rasterFolder())) === false,
      { folder: await rasterFolder() }
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
