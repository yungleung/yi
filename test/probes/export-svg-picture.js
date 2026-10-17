/**
 * A vector picture, and what each kind of export does with it: the answer depends on the *kind*.
 *
 * A page of HTML and a book hold an SVG as an SVG (SVG is one of the EPUB core media types), and the
 * app's own hand leaves the note's destinations as written — while a Word file, an OpenDocument file, a
 * page XeTeX lays out and its `.tex` cannot. Measured with pandoc 3.12: a docx gets a converted PNG
 * *beside* the raw `.svg` where the machine has a rasteriser and the raw vector alone where it has none,
 * so the app draws the PNG itself (`ui/export/raster_picture.ts`) and hands that over.
 *
 * This is that, through the app: the same note and the same local `figure.svg`, exported twice — the
 * docx's media folder has a PNG the app drew and no vector, the book's has the vector and no PNG — and
 * the PNG is twice the vector's own size (a diagram's hairlines and text are drawn for a vector). What a
 * run draws lives in a folder of the app's own and is gone when the run is over.
 *
 * @covers src/ui/export/raster_picture.ts, src/ui/export/export_flow.ts,
 *   src-tauri/src/export.rs (carries_vectors)
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
  const folderName = `yi-probe-svg-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const svgPath = `${folder}/figure.svg`;
  const docxTarget = `${folder}/note.docx`;
  const epubTarget = `${folder}/note.epub`;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60">' +
    '<rect width="120" height="60" fill="#3b82f6"/>' +
    '<circle cx="60" cy="30" r="20" fill="#f59e0b"/></svg>';
  const note = '# Going out\n\nA diagram: ![figure](figure.svg)\n';

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
    await t.openWorkspace(folder);
    await show(notePath, note);

    // --- the kinds that cannot hold a vector ------------------------------------------------------

    const wroteDocx = await exportTo('docx', docxTarget);
    const docx = wroteDocx ? await bytesOf(docxTarget) : null;
    const docxMedia = docx === null ? [] : t.zipNames(docx).filter((name) => name.startsWith('word/media/'));
    check(
      'a docx of a note with an SVG carries a PNG the app drew, and not the vector',
      docxMedia.some((name) => name.endsWith('.png')) && !docxMedia.some((name) => name.endsWith('.svg')),
      { media: docxMedia }
    );

    // What the app drew, before any converter touches it: the vector's own 120 x 60 at twice the size —
    // a diagram is drawn for a vector, and a PNG at its own size is the one that loses its hairlines.
    // (The docx's copy of the PNG is *pandoc's* re-encoding, at the page's own dpi, so a size read back
    // out of the document is pandoc's answer and not this app's.)
    const drawn = await rasterPictures(['figure.svg'], {
      bases: { document: folder, images: null },
      exists
    });
    const drawnPath = drawn.get('figure.svg') ?? null;
    const pngBytes = drawnPath === null ? null : await bytesOf(drawnPath);
    const size =
      pngBytes === null
        ? null
        : {
            width: (pngBytes[16] << 24) | (pngBytes[17] << 16) | (pngBytes[18] << 8) | pngBytes[19],
            height: (pngBytes[20] << 24) | (pngBytes[21] << 16) | (pngBytes[22] << 8) | pngBytes[23]
          };
    check('and it is drawn at twice the vector’s own size', size?.width === 240 && size?.height === 120, {
      size,
      drawn: drawnPath
    });
    await forgetRasters();

    // --- the kind that can ------------------------------------------------------------------------

    const wroteEpub = await exportTo('epub', epubTarget);
    const epub = wroteEpub ? await bytesOf(epubTarget) : null;
    const epubMedia = epub === null ? [] : t.zipNames(epub).filter((name) => name.startsWith('EPUB/media/'));
    check(
      'a book carries the SVG itself, because a book holds a vector',
      epubMedia.some((name) => name.endsWith('.svg')) && !epubMedia.some((name) => name.endsWith('.png')),
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
