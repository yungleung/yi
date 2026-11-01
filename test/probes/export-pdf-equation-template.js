/**
 * A LaTeX package owns the equation counter without owning Yi's reference text.
 *
 * The copied Rho package changes `\theequation`. The compiled page must show
 * the automatic reference and the displayed equation through that package
 * counter rather than a precomputed Yi number.
 *
 * @covers src/ui/export/reference/header.ts, src/ui/export/pipeline/equation_rewrites.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const templates = await t.app('/src/api/templates.ts');
  const { referenceHeader } = await t.app('/src/ui/export/reference/index.ts');
  const { exportSource } = await t.app('/src/ui/export/pipeline/index.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const checkout = window.__probePaths.checkout;
  const folderName = `yi-probe-equation-template-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const target = `${folder}/note.pdf`;
  const note = [
    'See [#eq:system].',
    '',
    '[$$',
    '\\begin{align}',
    'x&=1\\\\',
    'y&=2',
    '\\end{align}',
    '$$]{#eq:system}',
    ''
  ].join('\n');

  const before = await invoke('get_config');
  let templateId = null;
  try {
    await files.createEntry(home, folderName, false);
    const pkg = await templates.importTemplate({
      source: `${checkout}examples/templates/rho-class`,
      name: `Equation counter ${Date.now().toString(36)}`,
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
        '\\renewcommand{\\theequation}{R-\\arabic{equation}}\n\n\\begin{document}'
      )
    );
    const defaults = await templates.readTemplateFile(pkg.id, 'defaults.yaml');
    await templates.writeTemplateFile(
      pkg.id,
      'defaults.yaml',
      defaults.replace('pdf-engine: pdflatex', 'pdf-engine: xelatex')
    );

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
      title: 'Equation counter',
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
      'the automatic equation reference follows the package counter',
      text.includes('SeeEquation(R-1).'),
      { reference: /SeeEquation\([^)]+\)\./.exec(text)?.[0] ?? null, text }
    );
    check(
      'the displayed equation uses the same package counter',
      text.includes('(R-1)'),
      { number: /\([^)]+\)/.exec(text)?.[0] ?? null, text }
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
