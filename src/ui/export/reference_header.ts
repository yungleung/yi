/**
 * The LaTeX header that makes table references follow the document's table counter.
 *
 * The document's own frontmatter supplies the visible table word and literal
 * prefix. `\yiTableRef` asks LaTeX for the final number, so a class or template
 * that redefines `\thetable` remains authoritative.
 *
 * May import: the parser and reference vocabulary. Upholds: a note without a
 * captioned table contributes no header, and every literal inserted into TeX is
 * escaped as text.
 */

import { referenceIndex } from '../markdown/document/reference_index';
import { parseMarkdown } from '../markdown/syntax/parser';
import { referenceVocabularyFromTree } from '../markdown/syntax/reference_vocabulary';

/** The table portion of a LaTeX/PDF run's generated header, or the empty string. */
export function referenceHeader(markdown: string): string {
  if (!referenceIndex(markdown).some((entry) => entry.kind === 'table')) {
    return '';
  }
  const style = referenceVocabularyFromTree(parseMarkdown(markdown)).table;
  const prefix =
    style.prefix === ''
      ? ''
      : `  \\renewcommand{\\thetable}{\\mbox{${latexText(style.prefix)}}\\arabic{table}}%\n`;
  return (
    '% Yi table references; generated from the note’s reference vocabulary.\n' +
    '\\AtBeginDocument{%\n' +
    `  \\renewcommand{\\tablename}{${latexText(style.label)}}%\n` +
    prefix +
    '}\n' +
    '\\providecommand{\\yiTableRef}[1]{%\n' +
    '  \\hyperref[#1]{\\tablename~\\ref*{#1}}%\n' +
    '}\n'
  );
}

/** Literal text placed inside `\mbox` or a macro argument. */
function latexText(text: string): string {
  const special: Record<string, string> = {
    '\\': '\\textbackslash{}',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}'
  };
  return text.replace(/[\\#$%&_{}~^]/g, (character) => special[character] ?? `\\${character}`);
}
