/**
 * A template package's own `defaults.yaml` reaches Pandoc.
 *
 * The fixture template prints a metadata variable that only the package's defaults name. Seeing it
 * in the page proves the app hands that file over after its own defaults; seeing the body proves the
 * ordinary template and output still win. The package and output are made and removed here.
 *
 * @covers src-tauri/src/export/templates/defaults.rs, src-tauri/src/export/run.rs
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
  const folderName = `yi-probe-template-defaults-${stamp}`;
  const folder = `${home}/${folderName}`;
  const target = `${folder}/note`;
  let templateId = null;
  const readText = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  try {
    await files.createEntry(home, folderName, false);
    const pkg = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/defaults-kit`,
      name: `Probe defaults ${stamp}`,
      kind: 'html',
      entry: 'template/page.html',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    templateId = pkg.id;
    await exportApi.runExport({
      kind: 'html',
      text: '# Defaults\n\nThe note body.\n',
      output_path: target,
      resource_paths: [],
      source_dir: null,
      bibliography: null,
      csl: null,
      references: null,
      title: 'Defaults',
      language: 'en',
      paper: null,
      landscape: null,
      suppress_references: false,
      template_id: pkg.id,
      self_contained: false
    });
    const page = await readText(`${target}/note.html`);
    check(
      'the package defaults set metadata Pandoc used in the page',
      page.includes('YI-PACKAGE-DEFAULTS'),
      page.match(/<p id="package-marker">[^<]*<\/p>/)?.[0] ?? null
    );
    check(
      'and exactly one defaults marker establishes that the app defaults did not erase it',
      page.split('YI-PACKAGE-DEFAULTS').length - 1 === 1,
      page.split('YI-PACKAGE-DEFAULTS').length - 1
    );
    check(
      'the package template still receives the note body',
      page.includes('The note body.'),
      page.includes('The note body.')
    );
  } finally {
    if (templateId !== null) {
      try {
        await api.removeTemplate(templateId);
      } catch {
        // The package a failed import never made.
      }
    }
    try {
      await files.deleteEntry(folder);
    } catch {
      // The folder this run never made.
    }
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
