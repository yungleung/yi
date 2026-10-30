/**
 * The Rho Class PDF package receives Yi's semantic callout Div.
 *
 * The package filter maps the callout to Rho's native note environment.
 *
 * @covers src/ui/export/callout_rewrites.ts,
 *   examples/templates/rho-class/callout.lua
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const templates = await t.app('/src/api/templates.ts');
  const { exportSource } = await t.app('/src/ui/export/preprocess.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const checkout = window.__probePaths.checkout;
  const folderName = `yi-probe-callout-template-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const target = `${folder}/note.pdf`;
  const note =
    '> [!NOTE]\n' +
    '> Callout body through a package filter.\n';

  const before = await invoke('get_config');
  let templateId = null;
  try {
    await files.createEntry(home, folderName, false);
    const pkg = await templates.importTemplate({
      source: `${checkout}examples/templates/rho-class`,
      name: `Callout ${Date.now().toString(36)}`,
      kind: 'pdf',
      entry: 'template.tex',
      source_url: 'https://latextemplates.com/template/rho-class-article/',
      license: 'CC-BY-4.0 (Rho Class); CC-BY-SA-3.0 (IEEE CSL)',
      map_title: false,
      map_author: false
    });
    templateId = pkg.id;

    const prepared = await exportSource(note, {
      kind: 'pdf',
      titleOf: async () => null,
      bases: { document: folder, images: null },
      exists: async () => false,
      fetchRemote: async () => null,
      citations: null
    });
    await exportApi.runExport({
      kind: 'pdf',
      text: prepared,
      output_path: target,
      resource_paths: [],
      source_dir: folder,
      bibliography: null,
      csl: null,
      references: null,
      title: 'Callout filter',
      language: 'en',
      paper: null,
      landscape: null,
      suppress_references: false,
      template_id: pkg.id,
      self_contained: false,
      native_bibliography: null,
      note_assets: [],
      reference_header: ''
    });

    const read = await invoke('plugin:fs|read_file', { path: target });
    const bytes = read instanceof ArrayBuffer ? new Uint8Array(read) : Uint8Array.from(read);
    const text = (await t.pdfText(bytes)).replace(/\s+/g, ' ');
    const compact = text.replace(/\s+/g, '');
    check(
      'the package filter maps the semantic callout to Rho’s note environment',
      compact.startsWith('NoteCalloutbodythroughapackage'),
      text
    );
    check(
      'the callout body survives the filter',
      compact.includes('Calloutbodythroughapackage'),
      text
    );
  } finally {
    if (templateId !== null) {
      try {
        await templates.removeTemplate(templateId);
      } catch {
        // A package the run never finished importing.
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
