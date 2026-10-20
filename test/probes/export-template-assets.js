/**
 * A template package's own CSS, JavaScript and image travel with the export.
 *
 * HTML is self-contained by default, so the files are embedded in the one page. A LaTeX export
 * copies its whole asset tree beside the `.tex`. An EPUB is a container, so the packer rewrites
 * local links and declares the files in its manifest; the real check for that rewrite is the Rust
 * unit test, and this probe holds the end-to-end export.
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const files = await t.app('/src/api/files.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const checkout = window.__probePaths.checkout;
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const stamp = Date.now().toString(36);
  const folderName = `yi-probe-template-assets-${stamp}`;
  const folder = `${home}/${folderName}`;
  const made = [];
  const before = await invoke('get_config');
  const readBytes = async (path) => {
    const bytes = await invoke('plugin:fs|read_file', { path });
    return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
  };
  const exists = async (path) => {
    try {
      return await invoke('plugin:fs|exists', { path });
    } catch {
      return false;
    }
  };
  const run = async (kind, templateId, output) =>
    await exportApi.runExport({
      kind,
      text: '# Assets\n\nA paragraph with a [link](https://example.com).\n',
      output_path: output,
      resource_paths: [],
      source_dir: null,
      bibliography: null,
      csl: null,
      references: null,
      title: 'Assets',
      language: 'en',
      paper: null,
      landscape: null,
      suppress_references: false,
      template_id: templateId,
      self_contained: true
    });
  try {
    await files.createEntry(home, folderName, false);
    const source = `${checkout}test/fixtures/templates/asset-kit/template`;
    const html = await api.importTemplate({
      source,
      name: `Probe assets html ${stamp}`,
      kind: 'html',
      entry: 'page.html',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    made.push(html.id);
    const htmlTarget = `${folder}/assets`;
    await run('html', html.id, htmlTarget);
    const htmlText = new TextDecoder().decode(await readBytes(`${htmlTarget}/assets.html`));
    check(
      'a self-contained HTML page embeds the package’s CSS, JavaScript and image',
      htmlText.includes('YI-CSS-ASSET-MARKER') &&
        htmlText.includes('YI-JS-ASSET-MARKER') &&
        htmlText.includes('data:image/svg+xml') &&
        !htmlText.includes('href="template/css/site.css"') &&
        !htmlText.includes('src="template/js/site.js"'),
      {
        css: htmlText.includes('YI-CSS-ASSET-MARKER'),
        js: htmlText.includes('YI-JS-ASSET-MARKER'),
        image: htmlText.includes('data:image/svg+xml'),
        brokenCss: htmlText.includes('href="template/css/site.css"')
      }
    );

    const latex = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/latex-kit`,
      name: `Probe assets latex ${stamp}`,
      kind: 'latex',
      entry: 'main.tex',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    made.push(latex.id);
    const latexTarget = `${folder}/assets.tex`;
    await run('latex', latex.id, latexTarget);
    const notes = await exists(`${folder}/notes.txt`)
      ? new TextDecoder().decode(await readBytes(`${folder}/notes.txt`))
      : '';
    check(
      'a LaTeX export copies every package asset beside the .tex',
      notes.includes('YI-LATEX-ASSET-MARKER'),
      { notes, exists: await exists(`${folder}/notes.txt`) }
    );

    const epub = await api.importTemplate({
      source,
      name: `Probe assets epub ${stamp}`,
      kind: 'epub',
      entry: 'page.html',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    made.push(epub.id);
    const epubTarget = `${folder}/assets.epub`;
    await run('epub', epub.id, epubTarget);
    const book = await readBytes(epubTarget);
    check(
      'an EPUB with package assets is still a written book',
      book.length > 1000 && String.fromCharCode(...book.slice(0, 2)) === 'PK',
      { size: book.length }
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
      await files.deleteEntry(folder);
    } catch {
      // The folder a run never made.
    }
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
    const { configManager } = await t.app('/src/services/config_manager.ts');
    await configManager.load();
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
