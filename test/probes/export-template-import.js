/**
 * A template kit becomes one package: inspection, a zip with a single root, a wrapper, duplicate
 * and remove — and none of it enters the session.
 *
 * The fixtures are small files in this checkout (`test/fixtures/templates/`); the zip is built by
 * this probe in the page, so the archive rules are exercised without a committed binary. Every
 * package made here is removed again, and the app config is put back.
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const writeBytes = async (path, bytes) =>
    await window.__TAURI_INTERNALS__.invoke('plugin:fs|write_file', bytes, {
      headers: { path: encodeURIComponent(path) }
    });
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const checkout = window.__probePaths.checkout;
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const stamp = Date.now().toString(36);
  const zipPath = `${home}/yi-probe-template-${stamp}.zip`;
  const made = [];
  const before = await invoke('get_config');
  const stackBefore = session.documentSession.stack().length;

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  /** A store-only zip: enough for the inspector, and no compressor to depend on. */
  const zip = (entries) => {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const [name, text] of entries) {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(text);
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      chunks.push(local, data);
      const dir = new Uint8Array(46 + nameBytes.length);
      const dirView = new DataView(dir.buffer);
      dirView.setUint32(0, 0x02014b50, true);
      dirView.setUint16(4, 20, true);
      dirView.setUint16(6, 20, true);
      dirView.setUint16(8, 0, true);
      dirView.setUint16(10, 0, true);
      dirView.setUint32(16, crc, true);
      dirView.setUint32(20, data.length, true);
      dirView.setUint32(24, data.length, true);
      dirView.setUint16(28, nameBytes.length, true);
      dirView.setUint32(42, offset, true);
      dir.set(nameBytes, 46);
      central.push(dir);
      offset += local.length + data.length;
    }
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end]);
  };

  try {
    const latex = await api.inspectTemplate(`${checkout}test/fixtures/templates/latex-kit`);
    check(
      'a LaTeX kit is a text template whose class and bibliography style travel with it',
      latex.kind === 'template' &&
        latex.entry === 'main.tex' &&
        latex.mode === 'template' &&
        latex.assets.includes('journal.cls') &&
        latex.assets.includes('journal.bst') &&
        latex.deliver.includes('journal.cls') &&
        latex.deliver.includes('journal.bst') &&
        latex.suggested_kind === 'latex',
      latex
    );

    const wrapper = await api.inspectTemplate(`${checkout}test/fixtures/templates/wrapper-kit`);
    const preview = wrapper.wrapper?.preview ?? '';
    check(
      'a complete document is proposed as a wrapper, with $body$ before its closing environment',
      wrapper.mode === 'wrapper' &&
        wrapper.wrapper?.source_entry === 'main.tex' &&
        preview.indexOf('$body$') >= 0 &&
        preview.indexOf('$body$') < preview.indexOf('\\end{document}') &&
        wrapper.wrapper.maps_title &&
        wrapper.wrapper.maps_author,
      { mode: wrapper.mode, wrapper: wrapper.wrapper }
    );

    const html = await api.inspectTemplate(`${checkout}test/fixtures/templates/html-marker`);
    check(
      'an HTML template is proposed for the HTML kind',
      html.entry === 'kit.html' && html.suggested_kind === 'html' && html.mode === 'template',
      { entry: html.entry, kind: html.suggested_kind, mode: html.mode }
    );

    const reference = await api.inspectTemplate(
      `${checkout}test/fixtures/templates/reference.docx`
    );
    check(
      'a single Word reference document is a reference package, not a text template',
      reference.kind === 'reference-doc' &&
        reference.entry === 'reference.docx' &&
        reference.mode === 'reference-doc' &&
        reference.suggested_kind === 'docx',
      reference
    );

    await writeBytes(
      zipPath,
      new Uint8Array(
        await zip([
          ['journal-kit/main.tex', '$body$ % zipped body\n'],
          ['journal-kit/journal.cls', '% zipped class\n'],
          ['journal-kit/journal.bst', '% zipped bst\n']
        ]).arrayBuffer()
      )
    );
    const zipped = await api.inspectTemplate(zipPath);
    check(
      'a zip with one top-level folder is read without that folder',
      zipped.entry === 'main.tex' &&
        zipped.assets.includes('journal.cls') &&
        !zipped.files.some((file) => file.name.startsWith('journal-kit/')),
      { entry: zipped.entry, files: zipped.files.map((file) => file.name) }
    );

    const imported = await api.importTemplate({
      source: zipPath,
      name: `Probe zip ${stamp}`,
      kind: 'latex',
      entry: 'main.tex',
      source_url: 'https://journal.example/kit',
      license: 'CC BY 4.0',
      map_title: false,
      map_author: false
    });
    made.push(imported.id);
    const entryText = await api.readTemplateFile(imported.id, 'main.tex');
    check(
      'importing writes the app manifest, keeps the files and records provenance',
      imported.manifest?.id === imported.id &&
        imported.manifest.origin.type === 'zip' &&
        imported.manifest.origin.license === 'CC BY 4.0' &&
        imported.manifest.deliver.includes('journal.cls') &&
        entryText.includes('zipped body'),
      { manifest: imported.manifest, entryText }
    );

    const wrapped = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/wrapper-kit`,
      name: `Probe wrapper ${stamp}`,
      kind: 'latex',
      entry: 'main.tex',
      source_url: null,
      license: null,
      map_title: true,
      map_author: false
    });
    made.push(wrapped.id);
    const wrappedEntry = await api.readTemplateFile(wrapped.id, 'template.tex');
    const wrappedSource = await api.readTemplateFile(wrapped.id, 'source.tex');
    check(
      'the wrapper keeps the original and replaces only the title it was told to map',
      wrapped.manifest?.mode === 'wrapper' &&
        wrapped.manifest.template === 'template.tex' &&
        wrapped.manifest.assets.includes('source.tex') &&
        wrappedEntry.includes('\\title{$title$}') &&
        wrappedEntry.includes('\\author{A sample author}') &&
        wrappedEntry.includes('$body$') &&
        wrappedSource.includes('\\title{A sample paper}'),
      { manifest: wrapped.manifest, wrappedEntry: wrappedEntry.split('\n').slice(0, 6) }
    );

    const copy = await api.duplicateTemplate(imported.id);
    made.push(copy.id);
    check(
      'a duplicate gets its own id and name and keeps the licence',
      copy.id !== imported.id &&
        copy.manifest?.name.endsWith('copy') &&
        copy.manifest.origin.license === 'CC BY 4.0',
      { id: copy.id, name: copy.manifest?.name }
    );
    await api.removeTemplate(copy.id);
    made.pop();
    check(
      'and removing one takes it out of the library',
      !(await api.exportTemplates()).some((summary) => summary.id === copy.id)
    );

    check(
      'a package never enters the session stack or becomes the open document',
      session.documentSession.stack().length === stackBefore &&
        !session.documentSession
          .stack()
          .some((document) => document.path?.includes('/export/templates/')),
      { stack: session.documentSession.stack().length }
    );
  } finally {
    for (const id of made.reverse()) {
      try {
        await api.removeTemplate(id);
      } catch {
        // A package a failed import never made.
      }
    }
    try {
      await files.deleteEntry(zipPath);
    } catch {
      // The zip this run did not get as far as writing.
    }
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
    const { configManager } = await t.app('/src/services/config_manager.ts');
    await configManager.load();
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
