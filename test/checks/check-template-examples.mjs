/**
 * The six complete template packages kept beside the tests as authoring examples.
 *
 * Each package has to carry its own valid manifest, a real entry and any file that manifest names.
 * When Pandoc is available the check also converts one paragraph through the text templates and
 * reference documents, so an example cannot drift into something that merely looks plausible.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { runEpubcheck } from './support/epubcheck.mjs';

const root = resolve('test/fixtures/templates/examples');
const kinds = ['html', 'latex', 'pdf', 'epub', 'docx', 'odt'];
const failures = [];
const check = (name, pass, actual = null) => {
  if (!pass) failures.push(actual === null ? name : `${name}\n  actual: ${JSON.stringify(actual)}`);
};

check('the examples have a guide', existsSync(join(root, 'README.md')));
for (const kind of kinds) {
  const folder = join(root, kind);
  const manifestPath = join(folder, 'template.json');
  check(`${kind}: the package has its own reading guide`, existsSync(join(folder, 'README.md')));
  check(`${kind}: the package has template.json`, existsSync(manifestPath));
  if (kind === 'html') {
    check('html: the package has a complete example markdown', existsSync(join(folder, 'example.md')));
    const defaults = parse(readFileSync(join(folder, 'defaults.yaml'), 'utf8'));
    check(
      'html: the package asks Pandoc for a two-level contents sidebar',
      defaults.toc === true && defaults['toc-depth'] === 2
    );
  }
  if (kind === 'epub') {
    check('epub: the package has a complete example novel', existsSync(join(folder, 'example.md')));
    check('epub: the package has its own cover', existsSync(join(folder, 'assets/cover.svg')));
    const defaults = parse(readFileSync(join(folder, 'defaults.yaml'), 'utf8'));
    check(
      'epub: the package asks Pandoc for navigation, a cover and unshifted chapters',
      defaults.toc === true &&
        defaults['toc-depth'] === 2 &&
        defaults['shift-heading-level-by'] === 0 &&
        defaults['epub-cover-image'] === 'assets/cover.svg'
    );
    if (existsSync(join(folder, 'example.md'))) {
      const source = readFileSync(join(folder, 'example.md'), 'utf8');
      check(
        'epub: the novel has exactly a prologue, main story and epilogue',
        [...source.matchAll(/^# (?!#)/gm)].length === 3 &&
          ['# Prologue', '# The Animal Between Us', '# Epilogue'].every((heading) =>
            source.includes(heading)
          )
      );
    }
  }
  if (kind === 'latex') {
    const entry = readFileSync(join(folder, 'template.tex'), 'utf8');
    const guide = readFileSync(join(folder, 'README.md'), 'utf8');
    const defaults = parse(readFileSync(join(folder, 'defaults.yaml'), 'utf8'));
    const examplePath = join(folder, 'example.md');
    check(
      'latex: the guide diagnoses a missing latexmk log with direct pdflatex',
      /LaTeX didn't generate the expected log file/.test(guide) &&
        /pdflatex -interaction=nonstopmode -halt-on-error note\.tex/.test(guide) &&
        /Operation not permitted/.test(guide) &&
        /restricted\/sandboxed terminal/.test(guide)
    );
    check('latex: the package has a complete example markdown', existsSync(examplePath));
    check(
      'latex: the package has a bibliography, bibliography style and vector figure',
      ['references.bib', 'bibliography/apsrev4-2.bst', 'figures/cmb-spectrum.pdf'].every(
        (file) => existsSync(join(folder, file))
      )
    );
    check(
      'latex: the template reads metadata instead of naming the example authors',
      ['$title$', '$date$', '$abstract$', '$for(author)$', '$author.name$', '$author.affiliation$', '$author.email$'].every(
        (variable) => entry.includes(variable)
      ) &&
        !/Cosmic Microwave Background|Elena M\. Hart|Mateo R\. Silva|Priya N\. Rao/.test(entry)
    );
    check(
      'latex: native BibTeX and unshifted headings are declared in package defaults',
      Array.isArray(defaults.filters) &&
        defaults.filters.includes('tools/revtex-table.lua') &&
        defaults['cite-method'] === 'natbib' &&
        defaults.bibliography === 'references.bib' &&
        defaults['shift-heading-level-by'] === 0
    );
    if (existsSync(examplePath)) {
      const example = readFileSync(examplePath, 'utf8');
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(example)?.[1] ?? '';
      const metadata = parse(frontmatter);
      const authors = Array.isArray(metadata.author) ? metadata.author : [];
      check(
        'latex: the metadata carries three authors with distinct institutions and emails',
        authors.length === 3 &&
          authors.every(
            (author) =>
              typeof author.name === 'string' &&
              typeof author.affiliation === 'string' &&
              typeof author.email === 'string'
          ) &&
          new Set(authors.map((author) => author.affiliation)).size === 3 &&
          new Set(authors.map((author) => author.email)).size === 3
      );
      const introduction = /^# Introduction\n([\s\S]*?)(?=^# )/m.exec(example)?.[1] ?? '';
      const cited = [...introduction.matchAll(/@([A-Za-z0-9_:#$%&+?<>~./-]+)/g)].map(
        (match) => match[1]
      );
      check(
        'latex: the introduction carries at least five distinct citations',
        new Set(cited).size >= 5
      );
      check(
        'latex: the main text has a figure, a table and mathematics',
        /!\[[^\]]*\]\(figures\/cmb-spectrum\.pdf\)/.test(example) &&
          /^\| /m.test(example) &&
          /\$\$[\s\S]*?\\mu|\\Delta|\\chi\^2[\s\S]*?\$\$/.test(example) &&
          !/: Table 1\./i.test(example)
      );
      const bibliography = readFileSync(join(folder, 'references.bib'), 'utf8');
      check(
        'latex: every cited key has a BibTeX entry',
        [...new Set(cited)].every((key) => new RegExp(`@\\w+\\{${key},`).test(bibliography))
      );
    }
  }
  if (kind === 'docx') {
    check('docx: the package has a complete example markdown', existsSync(join(folder, 'example.md')));
    check('docx: the example has a figure asset', existsSync(join(folder, 'example.svg')));
    const defaults = parse(readFileSync(join(folder, 'defaults.yaml'), 'utf8'));
    check(
      'docx: the package asks Pandoc for a two-level contents field',
      defaults.toc === true && defaults['toc-depth'] === 2
    );
    const referenceSettings = spawnSync(
      'unzip',
      ['-p', join(folder, 'reference.docx'), 'word/settings.xml'],
      { encoding: 'utf8' }
    ).stdout;
    check(
      'docx: the reference asks the word processor to update fields',
      /<w:updateFields\b[^>]*w:val="(?:true|1)"/.test(referenceSettings)
    );
    if (existsSync(join(folder, 'example.md'))) {
      const example = readFileSync(join(folder, 'example.md'), 'utf8');
      const prose = example.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^$\n]+\$/g, '');
      check(
        'docx: the example carries complete document metadata',
        ['title:', 'subtitle:', 'author:', 'date:', 'abstract:', 'lang:', 'keywords:'].every(
          (key) => example.includes(key)
        )
      );
      check(
        'docx: the example covers headings one through six',
        Array.from({ length: 6 }, (_, index) => index + 1).every((level) =>
          new RegExp(`^${'#'.repeat(level)} `, 'm').test(example)
        )
      );
      check(
        'docx: the example uses only Markdown Yi renders',
        !/^:::/m.test(example) &&
          !/\]\{|\)\{/.test(example) &&
          !/^#{7,}\s/m.test(example) &&
          !/^:\s+(?:Table|Figure) caption/m.test(example) &&
          !/(^|[^~])~[^~\n]+~([^~]|$)/m.test(prose) &&
          !/\^[^$\n^]{1,30}\^/m.test(prose)
      );
      check(
        'docx: the example covers the block and inline elements',
        [
          '> ',
          '```',
          '~~',
          '[^',
          '|',
          '![',
          ': Definition',
          '$',
          '- [ ]',
          '1. '
        ].every((needle) => example.includes(needle))
      );
    }
  }
  if (kind === 'odt') {
    check('odt: the package has a complete example markdown', existsSync(join(folder, 'example.md')));
    check('odt: the example has a figure asset', existsSync(join(folder, 'example.svg')));
    check('odt: the example has a bibliography', existsSync(join(folder, 'references.bib')));
    if (existsSync(join(folder, 'example.md'))) {
      const source = readFileSync(join(folder, 'example.md'), 'utf8');
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1] ?? '';
      const metadata = parse(frontmatter);
      const prose = source.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^$\n]+\$/g, '');
      const coverLines = Array.isArray(metadata.author)
        ? [...metadata.author.map(String), `Date: ${String(metadata.date)}`]
        : [];
      check(
        'odt: the cover carries the four labelled lines',
        ['Author:', 'Institution:', 'Instructor:', 'Date:'].every((label) =>
            coverLines.some((line) => line.startsWith(label))
          ),
        coverLines
      );
      check(
        'odt: the abstract page carries abstract and keywords',
        typeof metadata.abstract === 'string' &&
          metadata.abstract.includes('Abstract') &&
          metadata.abstract.includes('Keywords:')
      );
      check(
        'odt: the example uses only Markdown Yi renders',
        !/^:::/m.test(source) &&
          !/\]\{|\)\{/.test(source) &&
          !/^#{7,}\s/m.test(source) &&
          !/^:\s+(?:Table|Figure) caption/m.test(source) &&
          !/(^|[^~])~[^~\n]+~([^~]|$)/m.test(prose) &&
          !/\^[^$\n^]{1,30}\^/m.test(prose),
        {
          fencedDiv: /^:::/m.test(source),
          attributeBlock: /\]\{|\)\{/.test(source),
          deepHeading: /^#{7,}\s/m.test(source),
          textCaption: /^:\s+(?:Table|Figure) caption/m.test(source),
          subscript: /(^|[^~])~[^~\n]+~([^~]|$)/m.test(prose),
          superscript: /\^[^$\n^]{1,30}\^/m.test(prose)
        }
      );
      check(
        'odt: the example leaves the contents to Pandoc',
        !source.includes('> **Contents**') && !/^1\. Introduction$/m.test(source)
      );
    }
    const defaults = parse(readFileSync(join(folder, 'defaults.yaml'), 'utf8'));
    check(
      'odt: the package keeps source heading levels',
      defaults['shift-heading-level-by'] === 0
    );
    check(
      'odt: the package asks Pandoc for a two-level contents field',
      defaults.toc === true && defaults['toc-depth'] === 2
    );
    const styleFile = join(folder, 'reference.odt');
    if (existsSync(styleFile)) {
      const styles = spawnSync('unzip', ['-p', styleFile, 'styles.xml'], { encoding: 'utf8' }).stdout;
      const entries = spawnSync('unzip', ['-Z1', styleFile], { encoding: 'utf8' }).stdout;
      const settings = spawnSync('unzip', ['-p', styleFile, 'settings.xml'], {
        encoding: 'utf8'
      }).stdout;
      check(
        'odt: the reference has cover, abstract, TOC and body master pages',
        ['DissertationCover', 'DissertationAbstract', 'DissertationTOC', 'DissertationBody'].every(
          (name) => styles.includes(`style:master-page style:name=\"${name}\"`)
        )
      );
      check(
        'odt: the master pages are A4 portrait',
        styles.includes('fo:page-width="21cm"') && styles.includes('fo:page-height="29.7cm"')
      );
      check(
        'odt: the cover page embeds its college picture',
        entries.includes('Pictures/college-cover.png') &&
          /style:background-image[^>]*xlink:href="Pictures\/college-cover\.png"/.test(styles)
      );
      check(
        'odt: the reference asks the word processor to update fields',
        /config:name="FieldAutoUpdate"[^>]*>true</.test(settings) &&
          /config:name="UpdateFromTemplate"[^>]*>true</.test(settings)
      );
      check(
        'odt: the four cover values use an underlined Author style',
        /style:name="Author"[\s\S]{0,800}fo:text-decoration="underline"/.test(styles)
      );
      check(
        'odt: title, abstract, TOC and first body heading select their master pages',
        [
          ['Title', 'DissertationCover'],
          ['Abstract', 'DissertationAbstract'],
          ['Contents_20_Heading', 'DissertationTOC'],
          ['Heading_20_1', 'DissertationBody']
        ].every(([style, master]) =>
          new RegExp(
            `style:name=\"${style}\"[\\s\\S]{0,900}style:master-page-name=\"${master}\"`
          ).test(styles)
        )
      );
      check(
        'odt: only the body master page carries page numbers, starting at one',
        /style:name="Heading_20_1"[\s\S]{0,900}style:page-number="1"/.test(styles) &&
          /style:name="DissertationBody"[\s\S]{0,600}<text:page-number\b/.test(styles) &&
          /<style:master-page style:name="DissertationCover"[^>]*>\s*<\/style:master-page>/.test(
            styles
          ) &&
          /<style:master-page style:name="DissertationAbstract"[^>]*\/>/.test(styles) &&
          /<style:master-page style:name="DissertationTOC"[^>]*\/>/.test(styles)
      );
    }
  }
  if (!existsSync(manifestPath)) continue;
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    check(`${kind}: template.json is valid JSON`, false, error.message);
    continue;
  }
  check(`${kind}: manifest schema is 1`, manifest.schema === 1, manifest.schema);
  check(`${kind}: package kind matches its folder`, manifest.kind === kind, manifest.kind);
  check(`${kind}: package id is stable`, manifest.id === `example-${kind}`, manifest.id);
  check(`${kind}: manifest name is present`, typeof manifest.name === 'string' && manifest.name.length > 0);
  check(
    `${kind}: exactly one entry matches the mode`,
    manifest.mode === 'reference-doc'
      ? manifest.reference_doc !== null && manifest.template === null
      : manifest.template !== null && manifest.reference_doc === null
  );
  const entry = manifest.mode === 'reference-doc' ? manifest.reference_doc : manifest.template;
  check(`${kind}: the entry exists`, typeof entry === 'string' && existsSync(join(folder, entry)), entry);
  if (typeof entry === 'string' && existsSync(join(folder, entry))) {
    if (manifest.mode === 'reference-doc') {
      const bytes = readFileSync(join(folder, entry));
      check(`${kind}: the reference document is a ZIP container`, bytes[0] === 0x50 && bytes[1] === 0x4b);
    } else {
      const text = readFileSync(join(folder, entry), 'utf8');
      check(`${kind}: the template has Pandoc’s body variable`, text.includes('$body$'));
    }
  }
  for (const asset of [...(manifest.assets ?? []), manifest.csl].filter(Boolean)) {
    check(`${kind}: asset ${asset} exists`, existsSync(join(folder, asset)), asset);
  }
  const defaults = join(folder, 'defaults.yaml');
  check(`${kind}: the example includes defaults.yaml`, existsSync(defaults));
  if (existsSync(defaults)) {
    try {
      const parsed = parse(readFileSync(defaults, 'utf8'));
      check(`${kind}: defaults.yaml is a mapping`, parsed !== null && typeof parsed === 'object');
      check(
        `${kind}: defaults.yaml asks for no shell escape`,
        !JSON.stringify(parsed).toLowerCase().includes('shell-escape')
      );
    } catch (error) {
      check(`${kind}: defaults.yaml parses`, false, error.message);
    }
  }
  const metadata = join(folder, 'metadata.yaml');
  check(`${kind}: the example includes metadata.yaml`, existsSync(metadata));
  if (existsSync(metadata)) {
    try {
      const parsed = parse(readFileSync(metadata, 'utf8'));
      check(`${kind}: metadata.yaml is a mapping`, parsed !== null && typeof parsed === 'object');
      if (kind === 'docx' || kind === 'odt') {
        for (const key of ['title', 'subtitle', 'author', 'date', 'abstract']) {
          check(
            `${kind}: metadata.yaml demonstrates ${key}`,
            Object.prototype.hasOwnProperty.call(parsed, key)
          );
        }
      }
    } catch (error) {
      check(`${kind}: metadata.yaml parses`, false, error.message);
    }
  }
}

const pandoc = spawnSync('pandoc', ['--version'], { encoding: 'utf8' });
if (pandoc.status !== 0) {
  console.log('template examples: structure passed; pandoc is not installed, so conversion was skipped');
} else {
  for (const kind of kinds) {
    const folder = join(root, kind);
    const manifestPath = join(folder, 'template.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const format =
      kind === 'epub' ? 'epub3' : kind === 'pdf' ? 'latex' : kind;
    const args = ['--from=markdown', `--to=${format}`, '--standalone'];
    if (kind === 'html') args.push('--section-divs');
    let output = null;
    let outputFolder = null;
    args.push(`--defaults=${join(folder, 'defaults.yaml')}`);
    if (manifest.mode === 'reference-doc') {
      args.push(`--reference-doc=${join(folder, manifest.reference_doc)}`);
      args.push(`--metadata-file=${join(folder, 'metadata.yaml')}`);
      if (kind === 'docx') {
        args.push('--citeproc', '--resource-path=' + folder);
      }
      if (kind === 'odt') {
        args.push('--citeproc', '--resource-path=' + folder);
      }
      outputFolder = mkdtempSync(join(tmpdir(), `yi-template-${kind}-`));
      output = join(outputFolder, `out.${kind}`);
      args.push(`--output=${output}`);
    } else {
      args.push(`--template=${join(folder, manifest.template)}`);
      if (kind === 'epub') {
        outputFolder = mkdtempSync(join(tmpdir(), 'yi-template-epub-'));
        output = join(outputFolder, 'out.epub');
        args.push(`--resource-path=${folder}`, `--output=${output}`);
      }
    }
    const example = join(folder, 'example.md');
    const input =
      (kind === 'html' || kind === 'latex' || kind === 'epub' || kind === 'docx' || kind === 'odt') &&
      existsSync(example)
        ? readFileSync(example, 'utf8')
        : '# Example\n\nOne paragraph.\n';
    const converted = spawnSync('pandoc', args, {
      input,
      encoding: 'utf8',
      cwd: folder
    });
    check(
      `${kind}: Pandoc converts a paragraph with the example`,
      converted.status === 0 &&
        (output === null ? converted.stdout.length > 0 : existsSync(output)),
      converted.stderr.trim()
    );
    if (kind === 'latex' && converted.status === 0) {
      check(
        'latex: Pandoc writes native citations into the REVTeX source',
        converted.stdout.includes('\\documentclass[') &&
          converted.stdout.includes('revtex4-2}') &&
          converted.stdout.includes('\\citep{penzias1965, dicke1965}') &&
          converted.stdout.includes('\\bibliography{references}') &&
          !converted.stdout.includes('\\section*{References}')
      );
      const tools = spawnSync('latexmk', ['-v'], { encoding: 'utf8' });
      if (tools.status === 0) {
        const latexFolder = mkdtempSync(join(tmpdir(), 'yi-template-latex-compile-'));
        mkdirSync(join(latexFolder, 'figures'), { recursive: true });
        mkdirSync(join(latexFolder, 'bibliography'), { recursive: true });
        writeFileSync(join(latexFolder, 'note.tex'), converted.stdout);
        copyFileSync(join(folder, 'references.bib'), join(latexFolder, 'references.bib'));
        copyFileSync(
          join(folder, 'figures/cmb-spectrum.pdf'),
          join(latexFolder, 'figures/cmb-spectrum.pdf')
        );
        copyFileSync(
          join(folder, 'bibliography/apsrev4-2.bst'),
          join(latexFolder, 'bibliography/apsrev4-2.bst')
        );
        const compiled = spawnSync(
          'latexmk',
          ['-pdf', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', 'note.tex'],
          {
            cwd: latexFolder,
            encoding: 'utf8',
            env: {
              ...process.env,
              BIBINPUTS: '.:bibliography:',
              BSTINPUTS: '.:bibliography:'
            }
          }
        );
        const fullLog = existsSync(join(latexFolder, 'note.log'))
          ? readFileSync(join(latexFolder, 'note.log'), 'utf8')
          : compiled.stdout;
        const errorAt = fullLog.indexOf('\n!');
        const log = errorAt === -1 ? fullLog.slice(-2000) : fullLog.slice(errorAt, errorAt + 3000);
        check(
          'latex: the exported source compiles through REVTeX and BibTeX',
          compiled.status === 0 && existsSync(join(latexFolder, 'note.pdf')),
          log
        );
        check(
          'latex: the compiled PRL source has no overfull boxes or unresolved references',
          !/Overfull \\hbox/.test(fullLog) &&
            !/undefined (?:references|citations)|Citation .* undefined/i.test(fullLog),
          log
        );
        rmSync(latexFolder, { recursive: true, force: true });
      } else {
        console.log('template examples: latexmk is absent, so the REVTeX compile was skipped');
      }
    }
    if (kind === 'html' && converted.status === 0) {
      const html = converted.stdout;
      const nav = /<aside\b[^>]*>[\s\S]*?<nav id="TOC"[\s\S]*?<\/nav>[\s\S]*?<\/aside>/.exec(
        html
      )?.[0];
      const targets = [...(nav ?? '').matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
      const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
      check(
        'html: the example has a Bootstrap stylesheet',
        /<link\b[^>]*href="https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap[^"]*\/dist\/css\/bootstrap[^"]*\.css"/.test(
          html
        )
      );
      check(
        'html: the contents sit in a sidebar with links into the article',
        nav !== undefined &&
          targets.length >= 3 &&
          targets.every((target) => ids.has(target))
      );
      check(
        'html: a level-three heading stays out of a two-level contents',
        ids.has('a-note-on-plausibility') && !targets.includes('a-note-on-plausibility')
      );
    }
    if (kind === 'epub' && output !== null && existsSync(output)) {
      const entries = spawnSync('unzip', ['-Z1', output], { encoding: 'utf8' }).stdout;
      const titlePage = spawnSync('unzip', ['-p', output, 'EPUB/text/title_page.xhtml'], {
        encoding: 'utf8'
      }).stdout;
      const nav = spawnSync('unzip', ['-p', output, 'EPUB/nav.xhtml'], {
        encoding: 'utf8'
      }).stdout;
      const opf = spawnSync('unzip', ['-p', output, 'EPUB/content.opf'], {
        encoding: 'utf8'
      }).stdout;
      check(
        'epub: the book carries a cover, title page, contents and exactly three chapters',
        entries.includes('EPUB/text/cover.xhtml') &&
          entries.includes('EPUB/text/title_page.xhtml') &&
          entries.includes('EPUB/nav.xhtml') &&
          ['ch001', 'ch002', 'ch003'].every((chapter) =>
            entries.includes(`EPUB/text/${chapter}.xhtml`)
          ) &&
          !entries.includes('EPUB/text/ch004.xhtml')
      );
      check(
        'epub: the title page carries press, ISBN, copyright and dedication',
        ['North Window Press', '978-1-946821-47-8', 'Copyright', 'For the cat'].every((text) =>
          titlePage.includes(text)
        ),
        titlePage
      );
      check(
        'epub: the visible contents links all three chapters',
        ['Prologue', 'The Animal Between Us', 'Epilogue'].every((text) =>
          new RegExp(`href="text/ch00[1-3]\\.xhtml#[^"]+">${text}</a>`).test(nav)
        ),
        nav
      );
      check(
        'epub: package metadata reaches the book record',
        ['<dc:title', 'The Animal Between Us', '<dc:creator', 'An Rui', '<dc:publisher', 'North Window Press', '<dc:rights'].every(
          (text) => opf.includes(text)
        )
      );
      const checked = runEpubcheck(output);
      if (!checked.available) {
        console.log(`template examples: EPUB validation skipped, ${checked.reason}`);
      } else {
        check(
          'epub: the generated novel passes epubcheck',
          checked.ok,
          checked.complaints.length > 0 ? checked.complaints : checked.counts
        );
      }
    }
    if ((kind === 'docx' || kind === 'odt') && output !== null && existsSync(output)) {
      const entry = kind === 'docx' ? 'word/document.xml' : 'content.xml';
      const unpacked = spawnSync('unzip', ['-p', output, entry], { encoding: 'utf8' });
      const required =
        kind === 'docx'
          ? [
              'Title',
              'Subtitle',
              'Author',
              'Date',
              'AbstractTitle',
              'Abstract',
              'Heading1',
              'Heading2',
              'Heading3',
              'Heading4',
              'Heading5',
              'Heading6',
              'FirstParagraph',
              'BodyText',
              'Compact',
              'BlockText',
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
            ]
          : [
              'Title',
              'Subtitle',
              'Author',
              'Abstract',
              'Heading_20_1',
              'Heading_20_2',
              'First_20_paragraph',
              'Text_20_body',
              'Quotations',
              'Preformatted_20_Text',
              'FigureCaption',
              'Definition_20_Term',
              'Definition_20_Definition',
              'Source_20_Text'
            ];
      check(
        `${kind}: the reference document receives every metadata style`,
        unpacked.status === 0 &&
          required.every((style) => unpacked.stdout.includes(`\"${style}\"`)),
        required.filter((style) => !unpacked.stdout.includes(`\"${style}\"`))
      );
      if (kind === 'docx') {
        const footnotes = spawnSync('unzip', ['-p', output, 'word/footnotes.xml'], {
          encoding: 'utf8'
        });
        const settings = spawnSync('unzip', ['-p', output, 'word/settings.xml'], {
          encoding: 'utf8'
        }).stdout;
        check(
          'docx: the generated document updates its contents field when opened',
          /<w:updateFields\b[^>]*w:val="(?:true|1)"/.test(settings)
        );
        check(
          'docx: the generated document has a two-level contents field',
          /<w:instrText[^>]*>\s*TOC\b[^<]*\\o &quot;1-2&quot;/.test(unpacked.stdout)
        );
        check(
          'docx: the footnote body receives the footnote paragraph styles',
          footnotes.status === 0 &&
            ['FootnoteText', 'FootnoteBlockText'].every((style) =>
              footnotes.stdout.includes(`\"${style}\"`)
            ),
          ['FootnoteText', 'FootnoteBlockText'].filter(
            (style) => !footnotes.stdout.includes(`\"${style}\"`)
          )
        );
      }
      if (kind === 'odt') {
        const content = spawnSync('unzip', ['-p', output, 'content.xml'], {
          encoding: 'utf8'
        }).stdout;
        check(
          'odt: the exported content has an automatic TOC and the body heading',
          content.includes('<text:table-of-content>') &&
            content.includes('text:outline-level="2"') &&
            content.includes('text:style-name="Heading_20_1"') &&
            content.includes('Introduction')
        );
        const office = spawnSync('soffice', ['--version'], { encoding: 'utf8' });
        const pdfInfo = spawnSync('pdfinfo', ['-v'], { encoding: 'utf8' });
        if (office.status === 0 && pdfInfo.status === 0) {
          const rendered = spawnSync(
            'soffice',
            ['--headless', '--convert-to', 'pdf', '--outdir', outputFolder, output],
            { encoding: 'utf8' }
          );
          const pdf = output.replace(/\.odt$/, '.pdf');
          const info = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' });
          const pages = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1] ?? 0);
          check(
            'odt: the dissertation render has A4 pages',
            rendered.status === 0 &&
              info.status === 0 &&
              pages >= 3 &&
              /595\.\d+ x 841\.\d+ pts \(A4\)/.test(info.stdout),
            { pages, size: /^Page size:\s+(.*)$/m.exec(info.stdout)?.[1] ?? null }
          );
          const ghostscript = spawnSync('gs', ['--version'], { encoding: 'utf8' });
          if (ghostscript.status === 0) {
            const pageText = (page) =>
              spawnSync(
                'gs',
                [
                  '-q',
                  '-dNOPAUSE',
                  '-dBATCH',
                  `-dFirstPage=${page}`,
                  `-dLastPage=${page}`,
                  '-sDEVICE=txtwrite',
                  '-sOutputFile=-',
                  pdf
                ],
                { encoding: 'utf8' }
              ).stdout.replace(/\s+/g, ' ').trim();
            const pageTexts = Array.from({ length: pages }, (_, index) => pageText(index + 1));
            const bodyIndex = pageTexts.findIndex((text) =>
              text.includes('This is the first paragraph of the dissertation body.')
            );
            check(
              'odt: page numbering starts with the body and numbers no front matter',
              bodyIndex >= 2 &&
              ['The Architecture of Academic Inquiry', 'Author: John', 'Institution: Example College'].every(
                (text) => pageTexts[0].includes(text)
              ) &&
                pageTexts[1].includes('Abstract') &&
                pageTexts[1].includes('Keywords:') &&
                !pageTexts[0].endsWith('1') &&
                !pageTexts[1].endsWith('1') &&
                pageTexts[bodyIndex].includes('Introduction') &&
                pageTexts[bodyIndex].endsWith('1'),
              { bodyPage: bodyIndex + 1, pages: pageTexts }
            );
          } else {
            console.log(
              'template examples: Ghostscript is absent, so ODT page-order extraction was skipped'
            );
          }
        } else {
          console.log('template examples: LibreOffice/PDF tools are absent, so ODT rendering was skipped');
        }
      }
    }
    if (outputFolder !== null) {
      rmSync(outputFolder, { recursive: true, force: true });
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`template examples: ${kinds.length} packages passed`);
