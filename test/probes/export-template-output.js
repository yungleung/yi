/**
 * A chosen package changes what pandoc writes: an HTML marker and a LaTeX marker survive into the
 * output, the LaTeX class and bibliography style land beside the `.tex`, and a reference document
 * is a usable Word export.
 *
 * The packages are made here and removed again; the probe writes only in its own folder under the
 * home directory, and restores the app config.
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
  const folderName = `yi-probe-template-output-${stamp}`;
  const folder = `${home}/${folderName}`;
  const made = [];
  const before = await invoke('get_config');
  const readText = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const exists = async (path) => {
    try {
      return await invoke('plugin:fs|exists', { path });
    } catch {
      return false;
    }
  };
  const run = async (kind, templateId, output, text) =>
    await exportApi.runExport({
      kind,
      text,
      output_path: output,
      resource_paths: [],
      source_dir: null,
      bibliography: null,
      csl: null,
      references: null,
      title: 'Probe note',
      language: 'en',
      paper: null,
      landscape: null,
      suppress_references: false,
      template_id: templateId
    });

  try {
    await files.createEntry(home, folderName, false);
    const html = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/html-marker`,
      name: `Probe output html ${stamp}`,
      kind: 'html',
      entry: 'kit.html',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    made.push(html.id);
    const htmlTarget = `${folder}/probe.html`;
    await run('html', html.id, htmlTarget, '# A note for the template\n\nHTML body text.\n');
    const htmlText = await readText(htmlTarget);
    check(
      'an HTML export goes through the package template, marker and body together',
      htmlText.includes('YI-HTML-TEMPLATE-MARKER') &&
        htmlText.includes('HTML body text.') &&
        htmlText.includes('<title>Probe note</title>'),
      htmlText.slice(0, 200)
    );

    const latex = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/latex-kit`,
      name: `Probe output latex ${stamp}`,
      kind: 'latex',
      entry: 'main.tex',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    made.push(latex.id);
    const latexTarget = `${folder}/probe.tex`;
    await run('latex', latex.id, latexTarget, '# A note for the template\n\nLaTeX body text.\n');
    const latexText = await readText(latexTarget);
    check(
      'a LaTeX export goes through the package template and leaves every package asset beside it',
      latexText.includes('YI-LATEX-TEMPLATE-MARKER') &&
        latexText.includes('LaTeX body text.') &&
        (await exists(`${folder}/journal.cls`)) &&
        (await exists(`${folder}/journal.bst`)) &&
        (await exists(`${folder}/notes.txt`)),
      {
        marker: latexText.includes('YI-LATEX-TEMPLATE-MARKER'),
        body: latexText.includes('LaTeX body text.'),
        cls: await exists(`${folder}/journal.cls`),
        bst: await exists(`${folder}/journal.bst`),
        notes: await exists(`${folder}/notes.txt`)
      }
    );

    const reference = await api.createDefaultTemplate(
      'docx',
      `Probe output docx ${stamp}`,
      null,
      null
    );
    made.push(reference.id);
    const docxTarget = `${folder}/probe.docx`;
    const outcome = await run(
      'docx',
      reference.id,
      docxTarget,
      '# A note for the template\n\nWord body text.\n'
    );
    check(
      'a Word export through a reference document is written and pandoc raises nothing',
      (await exists(docxTarget)) && outcome.warnings.length === 0,
      { exists: await exists(docxTarget), warnings: outcome.warnings }
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
      // The folder this run never made.
    }
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
    const { configManager } = await t.app('/src/services/config_manager.ts');
    await configManager.load();
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
