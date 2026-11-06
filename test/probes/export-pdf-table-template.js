/**
 * A LaTeX package owns the table counter without owning the reference number.
 *
 * The copied Rho package changes `\thetable`, and its Lua filter rewrites the
 * table. The export can only show `Table R-1` if the filter preserves the
 * caption and label and `\yiTableRef` reads the package counter.
 *
 * @covers src/ui/export/reference/header.ts, src/ui/export/pipeline/preprocess.ts,
 *   examples/templates/rho-class/table.lua
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const templates = await t.app('/src/api/templates.ts');
  const { referenceHeader } = await t.app('/src/ui/export/reference/index.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const checkout = window.__probePaths.checkout;
  const folderName = `yi-probe-table-template-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.pdf`;
  const note = [
    '# Going out',
    '',
    'See \\yiTableRef{tbl:results} for the table.',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    '| alpha | 1 |',
    '',
    ': Results {#tbl:results}',
    ''
  ].join('\n');

  const before = await invoke('get_config');
  let templateId = null;
  try {
    await files.createEntry(home, folderName, false);
    await files.writeTextAtomically(notePath, note);
    const pkg = await templates.importTemplate({
      source: `${checkout}examples/templates/rho-class`,
      name: `Table counter ${Date.now().toString(36)}`,
      kind: 'pdf',
      entry: 'template.tex',
      source_url: 'https://latextemplates.com/template/rho-class-article/',
      license: 'CC-BY-4.0 (Rho Class); CC-BY-SA-3.0 (IEEE CSL)',
      map_title: false,
      map_author: false
    });
    templateId = pkg.id;
    const template = await templates.readTemplateFile(pkg.id, 'template.tex');
    await templates.writeTemplateFile(
      pkg.id,
      'template.tex',
      template.replace(
        '\\begin{document}',
        '\\renewcommand{\\thetable}{R-\\arabic{table}}\n\n\\begin{document}'
      )
    );
    const defaults = await templates.readTemplateFile(pkg.id, 'defaults.yaml');
    await templates.writeTemplateFile(
      pkg.id,
      'defaults.yaml',
      defaults.replace('pdf-engine: pdflatex', 'pdf-engine: xelatex')
    );

    await exportApi.runExport({
      kind: 'pdf',
      text: note,
      output_path: target,
      resource_paths: [],
      source_dir: folder,
      bibliography: null,
      csl: null,
      references: null,
      title: 'Going out',
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

    let bytes = new Uint8Array();
    let text = '';
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const read = await invoke('plugin:fs|read_file', { path: target });
      bytes = read instanceof ArrayBuffer ? new Uint8Array(read) : Uint8Array.from(read);
      text = await t.pdfText(bytes);
      if (text.includes('SeeTableR-1forthetable.')) break;
      await t.sleep(200);
    }
    check(
      'the package writes a readable PDF',
      bytes.length > 0 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-',
      { size: bytes.length, start: String.fromCharCode(...bytes.slice(0, 5)) }
    );
    check(
      'the table filter preserves the label through its rewrite',
      text.includes('TableR-1.Results'),
      { caption: /Table[^.]+\.Results/.exec(text)?.[0] ?? null, text }
    );
    check(
      'the automatic table reference follows the package counter',
      text.includes('SeeTableR-1forthetable.'),
      { reference: /SeeTable[^f]+forthetable\./.exec(text)?.[0] ?? null, text }
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
