/**
 * The bundled Documentation guide, held to the promises its menu item makes.
 *
 * The document is opened as a pathless read-only note, so it cannot depend on a workspace or on
 * external images. It is also the place a reader learns how to build a package, which means the
 * installation, package-YAML and per-kind sections have to be present rather than implied.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const file = 'src/ui/documentation/en.md';
const failures = [];
const check = (name, pass) => {
  if (!pass) failures.push(name);
};

check('the Documentation guide exists', existsSync(file));
if (existsSync('src-tauri/src/menu/build.rs')) {
  const menu = readFileSync('src-tauri/src/menu/build.rs', 'utf8');
  check(
    'the native Documentation item owns the F1 accelerator',
    /\.accelerator\("F1"\)[\s\S]{0,120}\.id\("documentation"\)/.test(menu)
  );
}
if (existsSync(file)) {
  const text = readFileSync(file, 'utf8');
  check('it has the stable documentation identity', text.includes('id: yi-documentation'));
  check('it is titled as Documentation', /^title: Yi Documentation$/m.test(text));
  check('it declares its language', /^lang: en$/m.test(text));
  check(
    'it explains how to install Pandoc and a TeX distribution',
    /## Install Pandoc and TeX/i.test(text) &&
      /TeX Live/i.test(text) &&
      /MacTeX/i.test(text) &&
      /MiKTeX/i.test(text)
  );
  check(
    'it explains how to check the installation',
    /pandoc --version/.test(text) && /xelatex --version/.test(text)
  );
  const sections = [
    'Workspace and notes',
    'Export a note',
    'Template packages',
    'Create from Pandoc’s default',
    'Import a template kit',
    'Author HTML templates',
    'Author LaTeX and PDF templates',
    'Native BibTeX source',
    'Author EPUB templates',
    'Author Word and OpenDocument templates',
    'Package YAML',
    'Validate before using a template',
    'Security and trust',
    'Package checklist'
  ];
  for (const section of sections) {
    check(`it has the section “${section}”`, new RegExp(`^#{2,4} ${section}$`, 'm').test(text));
  }
  check(
    'every text-kind entry is illustrated with its Pandoc body variable',
    ['$body$', 'template.html', 'template.tex', 'template.xhtml'].every((needle) =>
      text.includes(needle)
    )
  );
  check(
    'both reference-document kinds are named',
    /reference\.docx/.test(text) && /reference\.odt/.test(text)
  );
  check(
    'it links to Pandoc’s reference-document workflow and shows both commands',
    text.includes('https://pandoc.org/MANUAL.html#option--reference-doc') &&
      text.includes('pandoc -o custom-reference.docx --print-default-data-file reference.docx') &&
      text.includes('pandoc -o custom-reference.odt --print-default-data-file reference.odt')
  );
  check(
    'native LaTeX bibliography packaging is explained',
    /cite-method: natbib/.test(text) &&
      /bibliography: references\.bib/.test(text) &&
      /citation-key/.test(text) &&
      /only those works|only the cited|uncited works/i.test(text)
  );
  check(
    'the Rho Class prompt preserves the upstream licence and attribution',
    /#### Example prompt: Rho Class PDF/.test(text) &&
      /latextemplates\.com\/template\/rho-class-article/.test(text) &&
      /CC BY 4\.0/.test(text) &&
      /Guillermo Jimenez/.test(text) &&
      /ATTRIBUTION\.txt/.test(text)
  );
  check(
    'the Legrand Orange Book prompt preserves the upstream licence and attribution',
    /#### Example prompt: Legrand Orange Book PDF/.test(text) &&
      /igormcoelho\/pandoc-template-legrand-orange-book/.test(text) &&
      /CC BY-NC-SA 3\.0/.test(text) &&
      /Mathias Legrand/.test(text) &&
      /ATTRIBUTION\.txt/.test(text)
  );
  check(
    'LaTeX source pictures and the BibTeX search path are explained',
    /BSTINPUTS/.test(text) &&
      /Local pictures named by the note are copied/i.test(text) &&
      /\.assets\//.test(text)
  );
  check(
    'the missing latexmk log and direct pdflatex diagnosis are explained',
    /LaTeX didn't generate the expected log file/.test(text) &&
      /pdflatex -interaction=nonstopmode -halt-on-error article\.tex/.test(text) &&
      /Operation not permitted/.test(text) &&
      /restricted or\s+sandboxed terminal/i.test(text) &&
      /macOS has denied folder access/i.test(text)
  );
  check(
    'the optional package files and their precedence are explicit',
    /metadata\.yaml/.test(text) &&
      /export\.yaml/.test(text) &&
      /defaults\.yaml/.test(text) &&
      /wins over|takes precedence/i.test(text)
  );
  check(
    'the manifest CSL override is distinguished from a defaults fallback',
    /`csl` optionally names a package CSL file/.test(text) &&
      /applies it after the reader's selected CSL/i.test(text) &&
      /only a fallback/i.test(text) &&
      /set the style file in the\s+manifest's `csl` field/i.test(text) &&
      /runs the filter twice/i.test(text) &&
      /duplicate references/i.test(text)
  );
  check(
    'it explains when to use wrapper mode instead of template mode',
    /### Wrapper mode/.test(text) &&
      /complete LaTeX document/i.test(text) &&
      /no `\$body\$`|without `\$body\$`/i.test(text) &&
      /template mode/i.test(text) &&
      /preserv/i.test(text)
  );
  check(
    'it maps Word and OpenDocument metadata to their reference-document styles',
    /Subtitle/.test(text) &&
      /Author/.test(text) &&
      /Date/.test(text) &&
      /Abstract Title/.test(text) &&
      /Abstract/.test(text)
  );
  check(
    'the HTML bundle and self-contained behavior are explained',
    /self-contained/i.test(text) && /assets/i.test(text)
  );
  check(
    'the no-shell-escape boundary is explained',
    /shell escape/i.test(text) && /does not run|refus/i.test(text)
  );
  check(
    'the document points readers at the complete fixture packages',
    text.includes('examples/templates')
  );
  check(
    'the document explains template-free Reveal.js and Beamer exports',
    /^### Presentation exports$/m.test(text) &&
      /Reveal\.js and Beamer take no template package/.test(text) &&
      /Use remote Reveal\.js resources/.test(text) &&
      /Use remote pictures/.test(text) &&
      /level-one headings for sections and level-two headings for\s+frames/i.test(text)
  );
  check(
    'it explains theorem declarations, references and the Pandoc floor',
    /^## Theorem blocks$/m.test(text) &&
      text.includes('name_to_text') &&
      text.includes('::: {#thm:bayes .Theorem info="Bayes"}') &&
      text.includes('See [#thm:bayes].') &&
      /`@id` and\s+`\[@id\]` remain citations/.test(text) &&
      /Pandoc 3\.1\.1 or later/.test(text)
  );
  check(
    'it explains explicit theorem kinds and template-owned styles',
    /Only\s+`Theorem`\s+and\s+`proof`\s+are\s+built in/i.test(text) &&
      /styles:\n    course-definition: \{\}/.test(text) &&
      text.includes('\\@ifundefined{th@<style>}') &&
      !text.includes('\\@ifundefined{th@${name}}') &&
      /separate `\.sty` file/i.test(text) &&
      /before `\$header-includes\$`/i.test(text) &&
      /must\s+not\s+define[\s\S]*capital-letter environment/i.test(text)
  );
  const legrandGuide = 'examples/templates/legrand-orange-book/README.md';
  check(
    'the Legrand guide names its theorem style package and styles',
    existsSync(legrandGuide) &&
      ['theorem-styles.sty', 'legrand-plain', 'legrand-definition', 'legrand-remark'].every(
        (needle) => readFileSync(legrandGuide, 'utf8').includes(needle)
      )
  );
  const prompts = [
    'HTML',
    'LaTeX',
    'PDF',
    'Rho Class PDF',
    'Legrand Orange Book PDF',
    'EPUB',
    'Word',
    'OpenDocument'
  ];
  for (const kind of prompts) {
    check(
      `it has a copy-ready ${kind} prompt`,
      new RegExp(`^#### Example prompt: ${kind}$`, 'm').test(text)
    );
  }
  check(
    'every example prompt leaves the package manifest to Yi',
    (text.match(/Do not\s+create\s+`template\.json`/g) ?? []).length === prompts.length
  );
  check(
    'the prompts repeat the package safety boundaries',
    (text.match(/do not\s+download|never download/gi) ?? []).length >= prompts.length &&
      (text.match(/tlmgr/g) ?? []).length >= prompts.length &&
      (text.match(/shell\s+escape/gi) ?? []).length >= prompts.length
  );
  check(
    'it contains no unfinished placeholders',
    !/\b(?:TODO|TBD|FIXME)\b/.test(text)
  );
}

const localeDocuments = readdirSync('src/ui/documentation')
  .filter((name) => name.endsWith('.md'))
  .sort();
check('all shipped Documentation languages exist', localeDocuments.length === 8);
for (const name of localeDocuments) {
  const text = readFileSync(`src/ui/documentation/${name}`, 'utf8');
  check(`${name} explains callouts`, /^## Callout/m.test(text));
  check(
    `${name} keeps the stable callout syntax and export contract`,
    text.includes('[!NOTE]') &&
      text.includes('.callout-note') &&
      text.includes('.callout-title')
  );
}

const localized = [
  ['ja', 'Japanese', 'Yi ドキュメント'],
  ['zh-Hans', 'Simplified Chinese', 'Yi 文档'],
  ['zh-Hant', 'Traditional Chinese', 'Yi 文件說明'],
  ['de', 'German', 'Yi-Dokumentation'],
  ['fr', 'French', 'Documentation de Yi'],
  ['es', 'Spanish', 'Documentación de Yi'],
  ['pt', 'Portuguese', 'Documentação do Yi']
];
for (const [code, name, title] of localized) {
  const localizedFile = `src/ui/documentation/${code}.md`;
  check(`the ${name} Documentation guide exists`, existsSync(localizedFile));
  if (!existsSync(localizedFile)) continue;
  const text = readFileSync(localizedFile, 'utf8');
  check(
    `the ${name} guide has localized identity and title`,
    text.includes('id: yi-documentation') &&
      text.includes(`title: ${title}`) &&
      new RegExp(`^lang: ${code.replace('-', '\\-')}$`, 'm').test(text)
  );
  check(
    `the ${name} guide covers every template kind and safety boundary`,
    ['$body$', 'reference.docx', 'reference.odt', 'tlmgr'].every((needle) =>
      text.includes(needle)
    ) && /shell[\s-]*(?:escape|Erweiterung)|extension shell/i.test(text)
  );
  check(
    `the ${name} guide links to Pandoc and keeps both reference commands`,
    text.includes('https://pandoc.org/MANUAL.html#option--reference-doc') &&
      text.includes('pandoc -o custom-reference.docx --print-default-data-file reference.docx') &&
      text.includes('pandoc -o custom-reference.odt --print-default-data-file reference.odt')
  );
  check(
    `the ${name} guide retains the complete authoring structure`,
    (text.match(/^#{2,4} /gm) ?? []).length >= 18 &&
      ['HTML', 'LaTeX', 'PDF', 'EPUB', 'Word', 'OpenDocument'].every((kind) =>
        text.includes(kind)
      ) &&
      text.includes('examples/templates')
  );
  check(
    `the ${name} guide has balanced code fences and no unfinished placeholders`,
    (text.match(/^```/gm) ?? []).length % 2 === 0 && !/\b(?:TODO|TBD|FIXME)\b/.test(text)
  );
  check(
    `the ${name} guide documents list references and LaTeX counter setup`,
    [
      '#list:steps',
      '[#list:steps]',
      'reference-labels:',
      'reference-number-prefixes:',
      '\\yiListCounterSetup',
      'yilist',
      'HTML',
      'EPUB',
      'Word',
      'ODT'
    ].every((needle) => text.includes(needle))
  );
  check(
    `${name} guide explains explicit kinds and template theorem styles`,
    text.includes('styles.course-definition') &&
      text.includes('theorem-styles.sty') &&
      text.includes('`Theorem`') &&
      text.includes('`proof`')
  );
  check(
    `${name} guide explains template-free presentation exports`,
    ['Reveal.js', 'Beamer', 'js/dist/', 'images/', 'examples/revealjs.md', 'examples/beamer.md'].every(
      (needle) => text.includes(needle)
    )
  );
  check(
    `${name} guide explains theorem blocks and their Pandoc floor`,
    text.includes('amsthm') &&
      text.includes('[#thm:') &&
      text.includes('3.1.1')
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('documentation: all checks passed');
