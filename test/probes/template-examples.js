/**
 * The six authoring examples as Yi imports and validates them.
 *
 * The Node check reads the packages; this probe takes them through the real Template library
 * commands, so a manifest that only looks valid still has to become a package Pandoc accepts.
 *
 * @covers src-tauri/src/export/templates/scan.rs, src-tauri/src/export/templates/package.rs,
 *   src-tauri/src/export/templates/validate.rs
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const files = await t.app('/src/api/files.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checkout = window.__probePaths.checkout;
  const stamp = Date.now().toString(36);
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-template-examples-${stamp}`;
  const folder = `${home}/${folderName}`;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const examples = [
    ['html', 'template.html', 'template', 'Example HTML note'],
    ['latex', 'template.tex', 'template', 'Example LaTeX note'],
    ['pdf', 'template.tex', 'template', 'Example PDF note'],
    ['epub', 'template.xhtml', 'template', 'Example EPUB book'],
    ['docx', 'reference.docx', 'reference-doc', 'Example Word document'],
    ['odt', 'reference.odt', 'reference-doc', 'Example OpenDocument text']
  ];
  const made = [];
  try {
    await files.createEntry(home, folderName, false);
    for (const [kind, entry, mode, title] of examples) {
      let pkg = null;
      try {
        pkg = await api.importTemplate({
          source: `${checkout}test/fixtures/templates/examples/${kind}`,
          name: `Example ${kind} ${stamp}`,
          kind,
          entry,
          source_url: null,
          license: 'CC0-1.0',
          map_title: false,
          map_author: false
        });
      } catch (error) {
        check(`${kind}: the complete example imports`, false, String(error));
        continue;
      }
      made.push(pkg.id);
      check(
        `${kind}: the complete example imports as a ${mode} package`,
        pkg.manifest?.kind === kind &&
          pkg.manifest?.mode === mode &&
          (mode === 'reference-doc'
            ? pkg.manifest?.reference_doc === entry
            : pkg.manifest?.template === entry),
        pkg.manifest
      );
      check(
        `${kind}: its metadata and package defaults survive the import`,
        pkg.files.some((file) => file.name === 'metadata.yaml') &&
          pkg.files.some((file) => file.name === 'defaults.yaml'),
        pkg.files.map((file) => file.name)
      );
      const metadata = await api.readTemplateFile(pkg.id, 'metadata.yaml');
      check(`${kind}: the sample metadata names its note`, metadata.includes(`title: ${title}`), metadata);
      if (kind === 'docx' || kind === 'odt') {
        check(
          `${kind}: the sample metadata covers the reference document fields`,
          ['subtitle:', 'author:', 'date:', 'abstract:'].every((key) => metadata.includes(key)),
          metadata
        );
      }
      const validated = await api.validateTemplate(pkg.id);
      check(`${kind}: Pandoc validates the complete example`, validated.ok, validated);
      if (kind === 'pdf') {
        const testPdf = await api.testTemplatePdf(pkg.id);
        check('pdf: the example also compiles through XeLaTeX', testPdf.ok, testPdf);
      }
      if (kind === 'docx') {
        const source = await api.readTemplateFile(pkg.id, 'example.md');
        const target = `${folder}/complete.docx`;
        await exportApi.runExport({
          kind: 'docx',
          text: source,
          output_path: target,
          resource_paths: [],
          source_dir: null,
          bibliography: null,
          csl: null,
          references: null,
          title: 'Complete Word template example',
          language: 'en',
          paper: null,
          landscape: null,
          suppress_references: false,
          template_id: pkg.id,
          self_contained: false
        });
        const bytes = await invoke('plugin:fs|read_file', { path: target });
        const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
        const document = (await t.zipEntry(data, 'word/document.xml')) ?? '';
        const footnotes = (await t.zipEntry(data, 'word/footnotes.xml')) ?? '';
        const styles = [...`${document}${footnotes}`.matchAll(/w:(?:pStyle|rStyle|tblStyle) w:val="([^"]+)"/g)]
          .map((match) => match[1]);
        check(
          'docx: the complete Markdown produces every reference style',
          [
            'Title',
            'Subtitle',
            'Author',
            'Date',
            'AbstractTitle',
            'Abstract',
            'Heading1',
            'Heading9',
            'FirstParagraph',
            'BodyText',
            'Compact',
            'BlockText',
            'FootnoteText',
            'FootnoteBlockText',
            'TableCaption',
            'Table',
            'ImageCaption',
            'CaptionedFigure',
            'DefinitionTerm',
            'Definition',
            'Hyperlink',
            'VerbatimChar',
            'SourceCode',
            'TOCHeading',
            'Bibliography'
          ].every((style) => styles.includes(style)),
          [...new Set(styles)].sort()
        );
        check(
          'docx: the example figure is embedded',
          data.length > 0 && document.includes('<w:drawing>'),
          { size: data.length }
        );
      }
    }
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
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
