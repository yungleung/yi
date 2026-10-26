/**
 * A PDF template controls the Yi list-object counter through its setup hook.
 *
 * The copied book template resets `yilist` at each chapter. Both the visible
 * caption and the automatic reference must follow that template counter.
 *
 * @covers src/ui/export/reference_header.ts, src/ui/export/list_rewrites.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const templates = await t.app('/src/api/templates.ts');
  const { referenceHeader } = await t.app('/src/ui/export/reference_header.ts');
  const { exportSource } = await t.app('/src/ui/export/preprocess.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const checkout = window.__probePaths.checkout;
  const folderName = `yi-probe-list-template-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const target = `${folder}/note.pdf`;
  const note = [
    '# First chapter',
    '',
    '- First item',
    '- Second item',
    '',
    ': First procedure {#list:first}',
    '',
    '# Second chapter',
    '',
    '- Third item',
    '- Fourth item',
    '',
    ': Second procedure {#list:second}',
    '',
    'See [#list:first] and [#list:second].',
    ''
  ].join('\n');

  const before = await invoke('get_config');
  let templateId = null;
  try {
    await files.createEntry(home, folderName, false);
    const pkg = await templates.importTemplate({
      source: `${checkout}test/fixtures/templates/list-counter-kit`,
      name: `List counter ${Date.now().toString(36)}`,
      kind: 'pdf',
      entry: 'template.tex',
      source_url: null,
      license: 'CC0-1.0',
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
      title: 'List counter',
      language: 'en',
      paper: null,
      landscape: null,
      suppress_references: false,
      template_id: pkg.id,
      self_contained: false,
      native_bibliography: null,
      note_assets: [],
      reference_header: referenceHeader(note)
    });

    const read = await invoke('plugin:fs|read_file', { path: target });
    const bytes = read instanceof ArrayBuffer ? new Uint8Array(read) : Uint8Array.from(read);
    const text = await t.pdfText(bytes);
    check(
      'the first chapter list uses the template’s chapter-local number',
      text.includes('List1.1.Firstprocedure') && text.includes('SeeList1.1'),
      {
        caption: /List[^.]*1\.1\.[^S]*/.exec(text)?.[0] ?? null,
        reference: /SeeList1\.1/.exec(text)?.[0] ?? null,
        text
      }
    );
    check(
      'the second chapter list resets through the template hook',
      text.includes('List2.1.Secondprocedure') && text.includes('List2.1'),
      {
        caption: /List2\.1\.[^.]*/.exec(text)?.[0] ?? null,
        reference: /List2\.1/.exec(text)?.[0] ?? null,
        text
      }
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
