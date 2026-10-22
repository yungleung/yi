/**
 * The bundled Documentation guide, held to the promises its menu item makes.
 *
 * The document is opened as a pathless read-only note, so it cannot depend on a workspace or on
 * external images. It is also the place a reader learns how to build a package, which means the
 * installation, package-YAML and per-kind sections have to be present rather than implied.
 */
import { existsSync, readFileSync } from 'node:fs';

const file = 'src/ui/documentation/documentation.en.md';
const failures = [];
const check = (name, pass) => {
  if (!pass) failures.push(name);
};

check('the Documentation guide exists', existsSync(file));
if (existsSync('src-tauri/src/menu.rs')) {
  const menu = readFileSync('src-tauri/src/menu.rs', 'utf8');
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
    'native LaTeX bibliography packaging is explained',
    /cite-method: natbib/.test(text) &&
      /bibliography: references\.bib/.test(text) &&
      /citation-key/.test(text) &&
      /only those works|only the cited|uncited works/i.test(text)
  );
  check(
    'LaTeX source pictures and the BibTeX search path are explained',
    /BSTINPUTS/.test(text) &&
      /Local pictures named by the note are copied/i.test(text) &&
      /\.assets\//.test(text)
  );
  check(
    'the optional package files and their precedence are explicit',
    /metadata\.yaml/.test(text) &&
      /export\.yaml/.test(text) &&
      /defaults\.yaml/.test(text) &&
      /wins over|takes precedence/i.test(text)
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
    text.includes('test/fixtures/templates/examples')
  );
  const prompts = ['HTML', 'LaTeX', 'PDF', 'EPUB', 'Word', 'OpenDocument'];
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

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('documentation: all checks passed');
