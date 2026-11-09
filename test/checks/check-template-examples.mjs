/**
 * The eight complete template packages kept beside the tests as authoring examples.
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
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { parse } from 'yaml';
import { runEpubcheck } from './support/epubcheck.mjs';
import { remarkMarkerAlignment } from './support/remark-geometry.mjs';

const root = resolve('examples/templates');
const exampleRoot = resolve('examples');
const appPdfDefaults = resolve('src-tauri/assets/export/export.pdf.yaml');
const kinds = ['html', 'latex', 'pdf', 'epub', 'docx', 'odt'];
const failures = [];
const check = (name, pass, actual = null) => {
  if (!pass) failures.push(actual === null ? name : `${name}\n  actual: ${JSON.stringify(actual)}`);
};

check('the examples have a guide', existsSync(join(root, 'README.md')));
const presentationExamples = {
  revealjs: join(exampleRoot, 'revealjs.md'),
  beamer: join(exampleRoot, 'beamer.md')
};
for (const [kind, path] of Object.entries(presentationExamples)) {
  check(`the ${kind} presentation example exists`, existsSync(path));
  if (existsSync(path)) {
    const source = readFileSync(path, 'utf8');
    check(
      `the ${kind} presentation example uses frontmatter and slide headings`,
      /^---\n[\s\S]*?\n---\n/.test(source) &&
        /^slide-level: 2$/m.test(source) &&
        /^## /m.test(source)
    );
    if (kind === 'revealjs') {
      check(
        'the Reveal.js example uses a bundled picture rather than depending on the network',
        /^!\[[^\]]*\]\(assets\/presentation-demo\.svg\)$/m.test(source) &&
          existsSync(join(exampleRoot, 'assets/presentation-demo.svg'))
      );
    }
  }
}
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
          const pdf = output.replace(/\.odt$/, '.pdf');
          let rendered = null;
          // A headless call that joins the profile of a running LibreOffice window returns before
          // that instance writes the PDF. A fresh profile keeps the check independent of the
          // reader's open documents; on macOS LibreOffice 26.8 also occasionally aborts while
          // registering its application menus, so a second isolated attempt makes this external
          // renderer deterministic without weakening the document checks below.
          for (let attempt = 0; attempt < 2 && !existsSync(pdf); attempt += 1) {
            const officeProfile = mkdtempSync(join(tmpdir(), 'yi-template-office-'));
            rendered = spawnSync(
              'soffice',
              [
                `-env:UserInstallation=${pathToFileURL(officeProfile).href}`,
                '--headless',
                '--convert-to',
                'pdf',
                '--outdir',
                outputFolder,
                output
              ],
              { encoding: 'utf8' }
            );
            rmSync(officeProfile, { recursive: true, force: true });
            const deadline = Date.now() + 15_000;
            while (!existsSync(pdf) && Date.now() < deadline) {
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
            }
          }
          if (!existsSync(pdf)) {
            console.log(
              'template examples: LibreOffice could not render the ODT on this machine, so ' +
                'page layout and page-order extraction were skipped'
            );
          } else {
            const info = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' });
            const pages = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1] ?? 0);
            check(
              'odt: the dissertation render has A4 pages',
              info.status === 0 &&
                pages >= 3 &&
                /595\.\d+ x 841\.\d+ pts \(A4\)/.test(info.stdout),
              {
                pages,
                size: /^Page size:\s+(.*)$/m.exec(info.stdout)?.[1] ?? null,
                rendered: rendered?.status ?? null
              }
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
                  [
                    'The Architecture of Academic Inquiry',
                    'Author: John',
                    'Institution: Example College'
                  ].every((text) => pageTexts[0].includes(text)) &&
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

const rhoClass = join(root, 'rho-class');
check(
  'rho-class: the licensed PDF example carries its complete source package',
  [
    'ATTRIBUTION.txt',
    'CSL-NOTICE.txt',
    'README.md',
    'callout.lua',
    'defaults.yaml',
    'example.md',
    'ieee.csl',
    'metadata.yaml',
    'rho.bib',
    'rho-class/rho.cls',
    'rho-class/rhobabel.sty',
    'rho-class/rhoenvs.sty',
    'template.json',
    'template.tex',
    'table.lua'
  ].every((file) => existsSync(join(rhoClass, file)))
);
if (existsSync(join(rhoClass, 'template.json'))) {
  const manifest = JSON.parse(readFileSync(join(rhoClass, 'template.json'), 'utf8'));
  const defaults = parse(readFileSync(join(rhoClass, 'defaults.yaml'), 'utf8'));
  const template = readFileSync(join(rhoClass, 'template.tex'), 'utf8');
  const example = readFileSync(join(rhoClass, 'example.md'), 'utf8');
  const calloutFilter = readFileSync(join(rhoClass, 'callout.lua'), 'utf8');
  const attribution = readFileSync(join(rhoClass, 'ATTRIBUTION.txt'), 'utf8');
  check(
    'rho-class: the manifest identifies the CC BY PDF package and its source',
    manifest.kind === 'pdf' &&
      manifest.mode === 'template' &&
      manifest.template === 'template.tex' &&
      /CC-BY-4\.0/.test(manifest.origin.license) &&
      /CC-BY-SA-3\.0/.test(manifest.origin.license) &&
      manifest.origin.source === 'https://latextemplates.com/template/rho-class-article/' &&
      manifest.assets.every((asset) => existsSync(join(rhoClass, asset)))
  );
  check(
    'rho-class: pdfLaTeX and its table/callout filters leave citations to Yi settings',
    defaults['pdf-engine'] === 'pdflatex' &&
      defaults.filters.length === 2 &&
      defaults.filters[0] === 'table.lua' &&
      defaults.filters[1] === 'callout.lua' &&
      defaults.bibliography === undefined &&
      defaults.csl === undefined &&
      defaults['shift-heading-level-by'] === 0
  );
  check(
    'rho-class: the manifest supplies the package IEEE citation style',
    manifest.csl === 'ieee.csl'
  );
  check(
    'rho-class: the Pandoc entry takes title, authors, dates and journal fields from metadata',
    ['$title$', '$for(author)$', '$author.name$', '$author.affiliation$', '$date$', '$abstract$', '$keywords$', '$journal-name$'].every(
      (variable) => template.includes(variable)
    ) &&
      !['Seeing Structure in a Noisy Sky', 'Mira Chen', 'Elias Ward', 'Noor Patel'].some(
        (text) => template.includes(text)
      )
  );
  check(
    'rho-class: the example uses supported Markdown and exercises the article layout',
    /::: \{\.callout \.callout-note title="Calibration assumption\."\}/m.test(example) &&
      /::: \{\.callout \.callout-info title="Information"\}/m.test(example) &&
      !/^> \*\*Calibration assumption\.\*\*/m.test(example) &&
      /^```python$/m.test(example) &&
      /^!\[[^\]]*\]\(figures\/sensor-residuals\.pdf\)\{width=70%\}$/m.test(example) &&
      /^\| Channel \|/m.test(example) &&
      /\\hat\{s\}/.test(example) &&
      /^\[\^weights\]:/m.test(example)
  );
  check(
    'rho-class: the filter maps semantic callouts to Rho environments and keeps custom titles',
    /callout-note/.test(calloutFilter) &&
      /callout-info/.test(calloutFilter) &&
      /pandoc\.Strong/.test(calloutFilter) &&
      /RawBlock/.test(calloutFilter)
  );
  check(
    'rho-class: the upstream author and licence travel with the package',
    /Guillermo Jimenez/.test(attribution) &&
      /CC-BY-4\.0/.test(attribution) &&
      /MemoJimenez\/Rho-class/.test(attribution) &&
      /CC BY 4\.0/.test(readFileSync(join(rhoClass, 'README.md'), 'utf8'))
  );
  if (pandoc.status === 0) {
    const outputFolder = mkdtempSync(join(tmpdir(), 'yi-template-rho-'));
    const output = join(outputFolder, 'rho-article.pdf');
    const converted = spawnSync(
      'pandoc',
      [
        '--from=markdown',
        '--to=pdf',
        `--defaults=${appPdfDefaults}`,
        `--defaults=${join(rhoClass, 'defaults.yaml')}`,
        `--template=${join(rhoClass, 'template.tex')}`,
        `--resource-path=${rhoClass}`,
        '--bibliography=rho.bib',
        '--csl=ieee.csl',
        '--metadata=reference-section-title=References',
        `--output=${output}`,
        join(rhoClass, 'example.md')
      ],
      {
        cwd: rhoClass,
        encoding: 'utf8',
        env: {
          ...process.env,
          TEXINPUTS: `.${process.platform === 'win32' ? ';' : ':'}${rhoClass}${process.platform === 'win32' ? ';' : ':'}`,
          BIBINPUTS: `.${process.platform === 'win32' ? ';' : ':'}${rhoClass}${process.platform === 'win32' ? ';' : ':'}`,
          BSTINPUTS: `.${process.platform === 'win32' ? ';' : ':'}${rhoClass}${process.platform === 'win32' ? ';' : ':'}`
        }
      }
    );
    check(
      'rho-class: the complete example compiles through pdfLaTeX and citeproc',
      converted.status === 0 && existsSync(output),
      converted.stderr.trim()
    );
    if (converted.status === 0 && existsSync(output)) {
      const rendered = spawnSync(
        'gs',
        ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=txtwrite', '-sOutputFile=-', output],
        { encoding: 'utf8' }
      );
      const renderedText = rendered.stdout
        .replace(/-\s*\r?\n\s*/g, '')
        .replace(/\s+/g, ' ');
      check(
        'rho-class: the rendered article resolves its citation and reference',
        rendered.status === 0 &&
          /\[1\]/.test(renderedText) &&
          /J\. Doe and J\. Roe/.test(renderedText) &&
          /Journal of Example Studies/.test(renderedText) &&
          !/Citation .* undefined/i.test(renderedText),
        rendered.stdout.slice(-2500)
      );
      check(
        'rho-class: Note, Information and the author callout title are rendered once',
        (renderedText.match(/\bNote\b/g) ?? []).length === 1 &&
          (renderedText.match(/\bInformation\b/g) ?? []).length === 1 &&
          (renderedText.match(/\bCalibration assumption\b/g) ?? []).length === 1,
        rendered.stdout.slice(-2500)
      );
    }
    rmSync(outputFolder, { recursive: true, force: true });
  }
}

const legrand = join(root, 'legrand-orange-book');
check(
  'legrand-orange-book: the licensed PDF example carries its complete source package',
  [
    'ATTRIBUTION.txt',
    'README.md',
    'assets/background.pdf',
    'assets/chapter-head-1.pdf',
    'assets/chapter-head-2.pdf',
    'assets/illustration.jpg',
    'callout.lua',
    'defaults.yaml',
    'example.md',
    'metadata.yaml',
    'references.bib',
    'template.json',
    'template.tex',
    'theorem-styles.sty'
  ].every((file) => existsSync(join(legrand, file)))
);
if (existsSync(join(legrand, 'template.json'))) {
  const manifest = JSON.parse(readFileSync(join(legrand, 'template.json'), 'utf8'));
  const defaults = parse(readFileSync(join(legrand, 'defaults.yaml'), 'utf8'));
  const metadata = parse(readFileSync(join(legrand, 'metadata.yaml'), 'utf8'));
  const template = readFileSync(join(legrand, 'template.tex'), 'utf8');
  const example = readFileSync(join(legrand, 'example.md'), 'utf8');
  const exampleMetadata = parse(
    example.slice(4, example.indexOf('\n---', 4))
  );
  const calloutFilter = existsSync(join(legrand, 'callout.lua'))
    ? readFileSync(join(legrand, 'callout.lua'), 'utf8')
    : '';
  const convertCallouts = (markdown) =>
    spawnSync(
      'pandoc',
      [
        '--from=markdown',
        '--to=latex',
        `--lua-filter=${join(legrand, 'callout.lua')}`
      ],
      { input: markdown, encoding: 'utf8' }
    );
  const theoremStyles = existsSync(join(legrand, 'theorem-styles.sty'))
    ? readFileSync(join(legrand, 'theorem-styles.sty'), 'utf8')
    : '';
  const attribution = readFileSync(join(legrand, 'ATTRIBUTION.txt'), 'utf8');
  check(
    'legrand-orange-book: the manifest identifies the licensed PDF package',
    manifest.id === 'example-legrand-orange-book' &&
      manifest.kind === 'pdf' &&
      manifest.mode === 'template' &&
      manifest.template === 'template.tex' &&
      manifest.origin.source ===
        'https://github.com/igormcoelho/pandoc-template-legrand-orange-book' &&
      /CC-BY-NC-SA-3\.0/.test(manifest.origin.license) &&
      manifest.assets.includes('callout.lua') &&
      manifest.assets.every((asset) => existsSync(join(legrand, asset)))
  );
  check(
    'legrand-orange-book: pdfLaTeX builds parts without adding an index',
    defaults['pdf-engine'] === 'pdflatex' &&
      defaults['top-level-division'] === 'part' &&
      defaults.toc === false &&
      defaults.bibliography === 'references.bib' &&
      defaults.filters?.length === 1 &&
      defaults.filters[0] === 'callout.lua' &&
      !/\\makeindex|\\printindex|\\index\{/.test(template) &&
      !/\\index\{/.test(example)
  );
  check(
    'legrand-orange-book: the entry reads document metadata and preserves the orange layout',
    ['$title$', '$subtitle$', '$for(author)$', '$dedication$', '$copyright$', '$body$', '$header-includes$'].every(
      (variable) => template.includes(variable)
    ) &&
      /\\definecolor\{ocre\}\{RGB\}\{243,102,25\}/.test(template) &&
      /background\.pdf/.test(template) &&
      /\\newcommand\{\\chapterimage\}/.test(template) &&
      /\\usepackage\{theorem-styles\}/.test(template) &&
      !/\\newenvironment\{theorem\}/.test(template) &&
      /chapter-head-1\.pdf/.test(example) &&
      /chapter-head-2\.pdf/.test(example)
  );
  check(
    'legrand-orange-book: the example uses semantic theorem Divs without source LaTeX indexes',
    /^# Part One$/m.test(example) &&
      /^# Part Two$/m.test(example) &&
      /^::: \{\.Theorem\b/m.test(example) &&
      /^::: \{\.Definition\b/m.test(example) &&
      /^::: \{\.Remark\b/m.test(example) &&
      /legrand-plain/.test(example) &&
      /legrand-definition/.test(example) &&
      /legrand-remark/.test(example) &&
      !/\\begin\{(?:theorem|definition|remark|corollary|proposition|example)\}/.test(example) &&
      example.includes('> [!IMPORTANT]\n') &&
      !/\\begin\{importantblock\}/.test(example) &&
      /^```python$/m.test(example) &&
      /assets\/illustration\.jpg/.test(example)
  );
  check(
    'legrand-orange-book: the results are a Markdown pipe table',
    /^\| Treatment \| Response A \| Response B \|$/m.test(example) &&
      /^\| --- \| ---: \| ---: \|$/m.test(example) &&
      !/\\begin\{(?:table|tabular)\}/.test(example)
  );
  if (pandoc.status === 0) {
    const builtInCallouts = [
      ['note', 'Note', 'noteblock'],
      ['tip', 'Tip', 'tipblock'],
      ['important', 'Important', 'importantblock'],
      ['warning', 'Warning', 'warningblock'],
      ['caution', 'Caution', 'cautionblock']
    ];
    const builtInConversion = convertCallouts(
      builtInCallouts
        .map(
          ([kind, title]) =>
            `:::: {.callout .callout-${kind}}\n` +
            `::: {.callout-title}\n${title}\n:::\n\n` +
            `${title} body.\n` +
            '::::'
        )
        .join('\n\n')
    );
    check(
      'legrand-orange-book: semantic built-in callouts become their awesomebox environments',
      calloutFilter.length > 0 &&
        builtInConversion.status === 0 &&
        builtInCallouts.every(
          ([kind, title, environment]) =>
            new RegExp(`\\\\begin\\{${environment}\\}`).test(builtInConversion.stdout) &&
            builtInConversion.stdout.includes(`${title} body.`)
        ) &&
        !builtInCallouts.some(([, title]) =>
          new RegExp(`\\\\textbf\\{${title}\\}`).test(builtInConversion.stdout)
        ),
      builtInConversion
    );
    check(
      'legrand-orange-book: the semantic callout keeps a custom title',
      calloutFilter.length > 0 &&
        (() => {
          const converted = convertCallouts(
            ':::: {.callout .callout-warning}\n' +
              '::: {.callout-title}\n' +
              'Check the margins\n' +
              ':::\n\n' +
              'The rule needs room.\n' +
              '::::\n'
          );
          return (
            converted.status === 0 &&
            /\\begin\{warningblock\}/.test(converted.stdout) &&
            /\\textbf\{Check the margins\}/.test(converted.stdout) &&
            /The rule needs room\./.test(converted.stdout)
          );
        })()
    );
    const unsupportedConversion = convertCallouts(
      ':::: {.callout .callout-definition}\n' +
        '::: {.callout-title}\n' +
        'Definition\n' +
        ':::\n\n' +
        'A defined term.\n' +
        '::::\n'
    );
    check(
      'legrand-orange-book: an unsupported callout kind is left for the template author',
      calloutFilter.length > 0 &&
        unsupportedConversion.status === 0 &&
        unsupportedConversion.stdout.includes('A defined term.') &&
        ![
          'noteblock',
          'tipblock',
          'importantblock',
          'warningblock',
          'cautionblock'
        ].some((environment) =>
          unsupportedConversion.stdout.includes(`\\begin{${environment}}`)
        ),
      unsupportedConversion
    );
  }
  check(
    'legrand-orange-book: the external style package owns theorem presentation',
    ['legrand-plain', 'legrand-definition', 'legrand-remark'].every((style) =>
      theoremStyles.includes(`\\newtheoremstyle{${style}}`)
    ) &&
      ['Theorem', 'Definition', 'Corollary', 'Exercise', 'Remark'].every((name) =>
        theoremStyles.includes(`\\BeforeBeginEnvironment{${name}}`)
      ) &&
      !/\\newenvironment\{(?:Theorem|Definition|Corollary|Exercise|Remark)\}/.test(
        theoremStyles
      )
  );
  const remarkAlignment = remarkMarkerAlignment(legrand);
  check(
    'legrand-orange-book: the remark marker aligns with its first line',
    remarkAlignment.skipped === true || remarkAlignment.distance <= 4,
    remarkAlignment
  );
  check(
    'legrand-orange-book: theorem counters reset in each section',
    metadata.amsthm?.parent_counter === 'section' &&
      exampleMetadata.amsthm?.parent_counter === 'section'
  );
  check(
    'legrand-orange-book: the upstream authors and non-commercial licence travel with the package',
    /Mathias Legrand/.test(attribution) &&
      /Vel/.test(attribution) &&
      /CC BY-NC-SA 3\.0/.test(attribution) &&
      /igormcoelho\/pandoc-template-legrand-orange-book/.test(attribution) &&
      /CC BY-NC-SA 3\.0/.test(readFileSync(join(legrand, 'README.md'), 'utf8'))
  );
  if (pandoc.status === 0) {
    const outputFolder = mkdtempSync(join(tmpdir(), 'yi-template-legrand-'));
    const output = join(outputFolder, 'legrand-orange-book.pdf');
    const headerBundle = await rolldown({
      input: 'src/ui/export/reference/theorem_header.ts',
      logLevel: 'silent',
      platform: 'node'
    });
    const { output: headerOutput } = await headerBundle.generate({ format: 'esm' });
    await headerBundle.close();
    const headerModule = join(outputFolder, 'theorem-header.mjs');
    writeFileSync(
      headerModule,
      headerOutput.find((chunk) => chunk.type === 'chunk').code
    );
    const { theoremHeader } = await import(pathToFileURL(headerModule).href);
    const header = join(outputFolder, 'theorem-header.tex');
    const theoremPreamble = theoremHeader(example);
    writeFileSync(header, theoremPreamble);
    check(
      'legrand-orange-book: generated theorem declarations carry the section parent',
      [
        '\\newtheorem{Theorem}{Theorem}[section]',
        '\\newtheorem{Definition}{Definition}[section]',
        '\\newtheorem{Remark}{Remark}[section]'
      ].every((declaration) => theoremPreamble.includes(declaration)),
      theoremPreamble
    );
    const converted = spawnSync(
      'pandoc',
      [
        '--from=markdown',
        '--to=pdf',
        `--lua-filter=${resolve('src-tauri/assets/export/amsthm.lua')}`,
        `--defaults=${appPdfDefaults}`,
        `--defaults=${join(legrand, 'defaults.yaml')}`,
        `--template=${join(legrand, 'template.tex')}`,
        `--include-in-header=${header}`,
        `--resource-path=${legrand}`,
        `--output=${output}`,
        join(legrand, 'example.md')
      ],
      {
        cwd: legrand,
        encoding: 'utf8',
        env: {
          ...process.env,
          TEXINPUTS: `.${process.platform === 'win32' ? ';' : ':'}${legrand}${process.platform === 'win32' ? ';' : ':'}`
        }
      }
    );
    check(
      'legrand-orange-book: the complete example compiles through pdfLaTeX and citeproc',
      converted.status === 0 && existsSync(output),
      converted.stderr.trim()
    );
    if (converted.status === 0 && existsSync(output)) {
      const rendered = spawnSync(
        'gs',
        ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=txtwrite', '-sOutputFile=-', output],
        { encoding: 'utf8' }
      );
      const renderedText = rendered.stdout.replace(/\s+/g, ' ');
      const squashed = renderedText
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
      check(
        'legrand-orange-book: the rendered book has its title, parts, theorem and references',
        rendered.status === 0 &&
          squashed.includes('thesearchforastructure') &&
          squashed.includes('partone') &&
          squashed.includes('typographyandstructure') &&
          squashed.includes('mathematicaldesign') &&
          squashed.includes('theorem211') &&
          squashed.includes('definition221') &&
          squashed.includes('remark231') &&
          squashed.includes('everydistinctionintheargument') &&
          squashed.includes('areadingrhythmis') &&
          squashed.includes('references') &&
          !/\bIndex\b/.test(renderedText),
        rendered.stdout.slice(-3000)
      );
    }
    rmSync(outputFolder, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`template examples: ${kinds.length + 2} packages passed`);
