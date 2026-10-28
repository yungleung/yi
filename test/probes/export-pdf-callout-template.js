/**
 * A PDF settings Lua filter receives Yi's semantic callout Div.
 *
 * The generated title and body must survive the filter in a compiled PDF.
 *
 * @covers src/ui/export/callout_rewrites.ts,
 *   test/fixtures/templates/examples/rho-class/callout.lua
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const { exportSource } = await t.app('/src/ui/export/preprocess.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const readText = async (path) => {
    const read = await invoke('plugin:fs|read_file', { path });
    return new TextDecoder().decode(
      read instanceof ArrayBuffer ? new Uint8Array(read) : Uint8Array.from(read)
    );
  };
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const checkout = window.__probePaths.checkout;
  const folderName = `yi-probe-callout-template-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const target = `${folder}/note.pdf`;
  const filter = `${folder}/callout.lua`;
  const note =
    '> [!NOTE]\n' +
    '> Callout body through a package filter.\n';
  const settings = (await invoke('export_config_path', { kind: 'pdf' })) ?? '';
  const settingsBefore = await readText(settings);

  try {
    await files.createEntry(home, folderName, false);
    const filterSource = await readText(
      `${checkout}test/fixtures/templates/examples/rho-class/callout.lua`
    );
    await files.writeTextAtomically(filter, filterSource);
    await invoke('export_save_config_text', {
      kind: 'pdf',
      text: `${settingsBefore.trimEnd()}\nfilters:\n  - "${filter}"\n`
    });

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
      template_id: null,
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
      'the filter receives the callout title Div',
      compact.includes('FilteredNote'),
      text
    );
    check(
      'the callout body survives the filter',
      compact.includes('Calloutbodythroughapackagefilter.'),
      text
    );
  } finally {
    await invoke('export_save_config_text', { kind: 'pdf', text: settingsBefore });
    try {
      await files.deleteEntry(folder);
    } catch {
      // Nothing to tidy.
    }
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
