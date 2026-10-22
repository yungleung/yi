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
  const examples = [
    ['html', 'template.html', 'template', 'Models, Agents, and the Harness Between Them'],
    [
      'latex',
      'template.tex',
      'template',
      'A Wideband Transition-Edge Search for Cosmic Microwave Background Spectral Distortions'
    ],
    ['pdf', 'template.tex', 'template', 'Example PDF note'],
    ['epub', 'template.xhtml', 'template', 'The Animal Between Us'],
    ['docx', 'reference.docx', 'reference-doc', 'Example Word document'],
    ['odt', 'reference.odt', 'reference-doc', 'Dissertation title']
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
      if (kind === 'latex') {
        const source = await api.readTemplateFile(pkg.id, 'example.md');
        const entry = await api.readTemplateFile(pkg.id, 'template.tex');
        await t.load(source);
        check(
          'latex: the example carries three authors and a real PRL manuscript',
          ['Elena M. Hart', 'Mateo R. Silva', 'Priya N. Rao'].every((name) =>
            source.includes(`name: ${name}`)
          ) &&
            source.includes('# Introduction') &&
            source.includes('figures/cmb-spectrum.pdf') &&
            source.includes(': Representative observing bands') &&
            !entry.includes('Elena M. Hart')
        );
        const native = await t.app('/src/ui/export/native_bibliography.ts');
        const selectedLibrary = await readText(
          `${checkout}test/fixtures/templates/examples/latex/references.bib`
        );
        const packaged = native.packageCitedBibliography(
          selectedLibrary,
          native.citedKeys(source)
        );
        const targetFolder = `${folder}/prl-source`;
        const target = `${targetFolder}/paper.tex`;
        await files.createEntry(folder, 'prl-source', false);
        await exportApi.runExport({
          kind: 'latex',
          text: source,
          output_path: target,
          resource_paths: [],
          source_dir: null,
          bibliography: `${checkout}test/fixtures/templates/examples/latex/references.bib`,
          csl: null,
          references: null,
          title: 'A Wideband Transition-Edge Search for Cosmic Microwave Background Spectral Distortions',
          language: 'en',
          paper: null,
          landscape: null,
          suppress_references: false,
          template_id: pkg.id,
          self_contained: false,
          native_bibliography: { path: 'references.bib', text: packaged.text }
        });
        const tex = await readText(target);
        const bibliography = await readText(`${targetFolder}/references.bib`);
        check(
          'latex: the exported source uses metadata, native citations and the PRL class',
          tex.includes('\\documentclass[') &&
            tex.includes('revtex4-2}') &&
            ['Elena M. Hart', 'Mateo R. Silva', 'Priya N. Rao'].every((name) =>
              tex.includes(`\\author{${name}}`)
            ) &&
            /\\(?:cite|citep)\{penzias1965/.test(tex) &&
            tex.includes('\\includegraphics') &&
            tex.includes('\\begin{table*}') &&
            tex.includes('\\bibliography{references}') &&
            !tex.includes('\\section*{References}')
        );
        check(
          'latex: the exported bibliography contains only the keys cited by the note',
          ['penzias1965', 'dicke1965', 'mather1994', 'smoot1992', 'fixsen2009', 'planck2020'].every(
            (key) => bibliography.includes(`{${key},`)
          ) && !bibliography.includes('uncited2024'),
          bibliography
        );
        check(
          'latex: the journal source tree carries the figure, style and REVTeX bibliography style',
          (await exists(`${targetFolder}/figures/cmb-spectrum.pdf`)) &&
            (await exists(`${targetFolder}/bibliography/apsrev4-2.bst`))
        );
      }
      if (kind === 'html') {
        const source = await api.readTemplateFile(pkg.id, 'example.md');
        await t.load(source);
        check(
          'html: the example is a technical article about models, agents and harnesses',
          ['large language model', 'AI agent', 'harness'].every((phrase) =>
            (t.prose().textContent ?? '').includes(phrase)
          )
        );
        const target = `${folder}/technical-blog`;
        const pagePath = `${target}/technical-blog.html`;
        await exportApi.runExport({
          kind: 'html',
          text: source,
          output_path: target,
          resource_paths: [],
          source_dir: null,
          bibliography: null,
          csl: null,
          references: null,
          title: 'Models, Agents, and the Harness Between Them',
          language: 'en',
          paper: null,
          landscape: null,
          suppress_references: false,
          template_id: pkg.id,
          self_contained: false
        });
        const page = await readText(pagePath);
        const nav = /<aside\b[^>]*>[\s\S]*?<nav id="TOC"[\s\S]*?<\/nav>[\s\S]*?<\/aside>/.exec(
          page
        )?.[0];
        const targets = [...(nav ?? '').matchAll(/href="#([^"]+)"/g)].map(
          (match) => match[1]
        );
        const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
        check(
          'html: the exported blog has a sidebar table of contents with working local links',
          nav !== undefined &&
            targets.length >= 10 &&
            targets.every((targetId) => ids.has(targetId))
        );
        check(
          'html: the sidebar respects the two-level toc depth',
          ids.has('a-note-on-plausibility') &&
            !targets.includes('a-note-on-plausibility'),
          { targets }
        );
        check(
          'html: Bootstrap and the blog assets travel with the export',
          page.includes(
            'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css'
          ) &&
            page.includes('href="assets/site.css"') &&
            page.includes('src="assets/site.js"') &&
            (await exists(`${target}/assets/site.css`)) &&
            (await exists(`${target}/assets/site.js`))
        );
        check(
          'html: the exported script highlights the section currently being read',
          (await readText(`${target}/assets/site.js`)).includes('IntersectionObserver')
        );
      }
      if (kind === 'epub') {
        const source = await api.readTemplateFile(pkg.id, 'example.md');
        await t.load(source);
        const lowerSource = source.toLowerCase();
        check(
          'epub: the example is a three-chapter psychological novel',
          ['# prologue', '# the animal between us', '# epilogue', 'yuzu', 'hard to domesticate'].every(
            (text) => lowerSource.includes(text)
          ) && (t.prose().textContent ?? '').includes('For one year I lived with a man')
        );
        const target = `${folder}/animal-between-us.epub`;
        await exportApi.runExport({
          kind: 'epub',
          text: source,
          output_path: target,
          resource_paths: [],
          source_dir: null,
          bibliography: null,
          csl: null,
          references: null,
          title: 'The Animal Between Us',
          language: 'en',
          paper: null,
          landscape: null,
          suppress_references: false,
          template_id: pkg.id,
          self_contained: false
        });
        const bytes = await invoke('plugin:fs|read_file', { path: target });
        const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
        const entries = t.zipNames(data);
        const titlePage = (await t.zipEntry(data, 'EPUB/text/title_page.xhtml')) ?? '';
        const coverPage = (await t.zipEntry(data, 'EPUB/text/cover.xhtml')) ?? '';
        const nav = (await t.zipEntry(data, 'EPUB/nav.xhtml')) ?? '';
        const opf = (await t.zipEntry(data, 'EPUB/content.opf')) ?? '';
        check(
          'epub: the exported novel has a cover, front matter, contents and three chapters',
          entries.includes('EPUB/text/cover.xhtml') &&
            entries.includes('EPUB/text/title_page.xhtml') &&
            entries.includes('EPUB/nav.xhtml') &&
            ['ch001', 'ch002', 'ch003'].every((chapter) =>
              entries.includes(`EPUB/text/${chapter}.xhtml`)
            ) &&
            !entries.includes('EPUB/text/ch004.xhtml'),
          entries
        );
        check(
          'epub: the cover carries the title, author and fictional press',
          ['The Animal Between Us', 'An Rui', 'North Window Press'].every((text) =>
            coverPage.includes(text)
          ),
          coverPage
        );
        check(
          'epub: the title page carries press, ISBN, rights and dedication',
          ['North Window Press', '978-1-946821-47-8', 'Copyright', 'For the cat'].every((text) =>
            titlePage.includes(text)
          ),
          titlePage
        );
        check(
          'epub: the contents page is visible in the spine and links the three chapters',
          nav.includes('id="toc"') &&
            nav.includes('>Contents</h1>') &&
            ['Prologue', 'The Animal Between Us', 'Epilogue'].every((text) =>
              new RegExp(`href="text/ch00[1-3]\\.xhtml#[^"]+">${text}</a>`).test(nav)
            ),
          nav
        );
        check(
          'epub: the book record carries title, author, publisher, rights and ISBN',
          [
            '<dc:title',
            'The Animal Between Us',
            '<dc:creator',
            'An Rui',
            '<dc:publisher',
            'North Window Press',
            '<dc:rights',
            '978-1-946821-47-8'
          ].every((text) => opf.includes(text)),
          opf
        );
      }
      if (kind === 'pdf') {
        const testPdf = await api.testTemplatePdf(pkg.id);
        check('pdf: the example also compiles through XeLaTeX', testPdf.ok, testPdf);
      }
      if (kind === 'docx') {
        const source = await api.readTemplateFile(pkg.id, 'example.md');
        await t.load(source);
        const visible = t.prose().textContent ?? '';
        check(
          'docx: the example renders only Markdown Yi supports',
          visible.includes('H₂O') &&
            visible.includes('E = mc²') &&
            !visible.includes('{.underline}') &&
            !visible.includes('{#fig:example') &&
            !visible.includes('Heading level seven')
        );
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
        const settings = (await t.zipEntry(data, 'word/settings.xml')) ?? '';
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
            'Heading6',
            'FirstParagraph',
            'BodyText',
            'Compact',
            'BlockText',
            'FootnoteText',
            'FootnoteBlockText',
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
        check(
          'docx: the automatic contents field is refreshed when opened',
          /<w:updateFields\b[^>]*w:val="(?:true|1)"/.test(settings) &&
            /TOC\b[^<]*\\o &quot;1-2&quot;/.test(document)
        );
      }
      if (kind === 'odt') {
        const source = await api.readTemplateFile(pkg.id, 'example.md');
        await t.load(source);
        const visible = t.prose().textContent ?? '';
        check(
          'odt: the example renders only Markdown Yi supports',
          visible.includes('H₂O') &&
            visible.includes('E = mc²') &&
            !visible.includes('custom-style') &&
            !visible.includes('{#fig:dissertation') &&
            !visible.includes('{.underline}') &&
            !visible.includes('Extended level seven')
        );
        const target = `${folder}/dissertation.odt`;
        await exportApi.runExport({
          kind: 'odt',
          text: source,
          output_path: target,
          resource_paths: [],
          source_dir: null,
          bibliography: null,
          csl: null,
          references: null,
          title: 'Dissertation reference-document example',
          language: 'en',
          paper: null,
          landscape: null,
          suppress_references: false,
          template_id: pkg.id,
          self_contained: false
        });
        const bytes = await invoke('plugin:fs|read_file', { path: target });
        const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
        const content = (await t.zipEntry(data, 'content.xml')) ?? '';
        const style = (await t.zipEntry(data, 'styles.xml')) ?? '';
        const settings = (await t.zipEntry(data, 'settings.xml')) ?? '';
        const manifest = (await t.zipEntry(data, 'META-INF/manifest.xml')) ?? '';
        const entries = t.zipNames(data);
        const outlineLevels = [...content.matchAll(/text:outline-level="(\d+)"/g)].map(
          (match) => match[1]
        );
        check(
          'odt: the generated book has the four cover lines, abstract and keywords',
          ['Author: John', 'Institution: Example College', 'Instructor: Professor Jane Scholar', 'Date: October 22, 2026', 'Abstract', 'Keywords:'].every(
            (text) => content.includes(text)
          ),
          { size: data.length }
        );
        check(
          'odt: the generated book has a visible automatic two-level contents table',
          !source.includes('> **Contents**') &&
            content.includes('<text:table-of-content') &&
            content.includes('text:outline-level="2"') &&
            content.includes('<text:index-body>') &&
            ['Introduction', 'Research questions', 'Materials and methods'].every((text) =>
              content.includes(`>${text}</text:a>`)
            ) &&
            outlineLevels.includes('1'),
          {
            manualContents: source.includes('> **Contents**'),
            field: content.includes('<text:table-of-content'),
            indexBody: content.includes('<text:index-body>'),
            bodyHeading: outlineLevels.includes('1'),
            outlineLevels
          }
        );
        check(
          'odt: the contents field is refreshed when opened',
          /config:name="FieldAutoUpdate"[^>]*>true</.test(settings) &&
            /config:name="UpdateFromTemplate"[^>]*>true</.test(settings)
        );
        check(
          'odt: the generated book keeps the cover, abstract, TOC and body master pages',
          ['DissertationCover', 'DissertationAbstract', 'DissertationTOC', 'DissertationBody'].every(
            (name) => style.includes(`style:name="${name}"`)
          )
        );
        check(
          'odt: numbering starts on the body and no front-matter page has a footer',
          /style:name="Heading_20_1"[\s\S]{0,900}style:page-number="1"/.test(style) &&
            /style:name="DissertationBody"[\s\S]{0,600}<text:page-number\b/.test(style) &&
            /<style:master-page style:name="DissertationAbstract"[^>]*\/>/.test(style) &&
            /<style:master-page style:name="DissertationTOC"[^>]*\/>/.test(style)
        );
        check(
          'odt: the generated book embeds the college cover and declares it',
          entries.includes('Pictures/college-cover.png') &&
            manifest.includes('Pictures/college-cover.png') &&
            style.includes('Pictures/college-cover.png')
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
