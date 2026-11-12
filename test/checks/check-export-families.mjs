/**
 * Checks the export families that share source rewriting.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/export/kind_family.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-export-families-'));
const file = join(directory, 'kind_family.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { isLatexKind, isHtmlLikeKind } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
};

check('LaTeX source is a LaTeX export', isLatexKind('latex'), true);
check('PDF is a LaTeX export', isLatexKind('pdf'), true);
check('Beamer is a LaTeX export', isLatexKind('beamer'), true);
check('DOCX is not a LaTeX export', isLatexKind('docx'), false);
check('HTML is an HTML-like export', isHtmlLikeKind('html'), true);
check('EPUB is an HTML-like export', isHtmlLikeKind('epub'), true);
check('Reveal.js is an HTML-like export', isHtmlLikeKind('revealjs'), true);
check('ODT is not an HTML-like export', isHtmlLikeKind('odt'), false);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('export families: all checks passed');
