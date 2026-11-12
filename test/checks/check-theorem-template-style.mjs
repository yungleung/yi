/**
 * Proves that a template theorem style survives Yi's generated fallback.
 *
 * Example: a template defines `template-style` whose heading writes a sentinel
 * to the TeX log. The generated guard must leave that definition in place, and
 * the compiled theorem must produce the sentinel.
 *
 * May import: Node process/files APIs and the theorem-header bundle. Upholds:
 * Yi owns the environment while a template-owned style remains authoritative.
 */
import {
  existsSync,
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

const failures = [];
const check = (name, pass) => {
  if (!pass) failures.push(name);
};
const directory = mkdtempSync(join(tmpdir(), 'yi-theorem-template-style-'));

try {
  const bundle = await rolldown({
    input: 'src/ui/export/reference/theorem_header.ts',
    logLevel: 'silent',
    platform: 'node'
  });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const headerModule = join(directory, 'theorem_header.mjs');
  writeFileSync(headerModule, output.find((chunk) => chunk.type === 'chunk').code);
  const { theoremHeader } = await import(pathToFileURL(headerModule).href);

  const note = [
    '---',
    'amsthm:',
    '  styles:',
    '    template-style:',
    '      headfont: bold',
    '  template-style:',
    '    - Theorem',
    '---',
    '',
    '::: {.Theorem}',
    'A theorem.',
    ':::'
  ].join('\n');
  const header = theoremHeader(note);
  check('the generated header guards the fallback style', header.includes('\\@ifundefined{th@template-style}'));

  const notePath = join(directory, 'note.md');
  const templatePath = join(directory, 'template.tex');
  const headerPath = join(directory, 'header.tex');
  const texPath = join(directory, 'output.tex');
  writeFileSync(notePath, note);
  writeFileSync(headerPath, header);
  writeFileSync(templatePath, String.raw`\documentclass{article}
\usepackage{amsthm}
\makeatletter
\newtheoremstyle{template-style}{}{}{\normalfont}{}{\bfseries}{!}{ }{%
  \typeout{YI_TEMPLATE_STYLE_USED}\thmname{#1}\nobreakspace\thmnumber{#2}}
\makeatother
$if(header-includes)$
$header-includes$
$endif$
\begin{document}
$body$
\end{document}
`);

  const pandoc = spawnSync(
    'pandoc',
    [
      '--from=markdown',
      '--to=latex',
      '--standalone',
      '--lua-filter',
      resolve('src-tauri/assets/export/amsthm.lua'),
      `--template=${templatePath}`,
      `--include-in-header=${headerPath}`,
      `--output=${texPath}`,
      notePath
    ],
    { cwd: resolve('.'), encoding: 'utf8' }
  );
  if (pandoc.error?.code === 'ENOENT') {
    console.log('theorem template style: pandoc is unavailable, integration check skipped');
  } else {
    check('Pandoc converts the guarded theorem header', pandoc.status === 0);
    const tex =
      pandoc.status === 0 && existsSync(texPath)
        ? readFileSync(texPath, 'utf8')
        : '';
    check(
      'the template style and generated environment coexist in the conversion',
      tex.includes('\\@ifundefined{th@template-style}') &&
        tex.includes('\\newtheoremstyle{template-style}') &&
        tex.includes('\\newtheorem{Theorem}{Theorem}')
    );

    const pdflatex = spawnSync('pdflatex', ['--version'], { encoding: 'utf8' });
    if (pdflatex.error?.code === 'ENOENT' || pdflatex.status !== 0) {
      console.log('theorem template style: pdflatex is unavailable, compile skipped');
    } else {
      const compiled = spawnSync(
        'pdflatex',
        ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', directory, texPath],
        { cwd: directory, encoding: 'utf8' }
      );
      const logPath = join(directory, 'output.log');
      const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
      check('the generated theorem compiles', compiled.status === 0);
      check(
        'the template style, not Yi fallback, produces the theorem heading',
        log.includes('YI_TEMPLATE_STYLE_USED')
      );
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('theorem template style: all checks passed');
