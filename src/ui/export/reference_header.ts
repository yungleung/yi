/**
 * The LaTeX header that makes table and equation references follow native counters.
 *
 * The document's own frontmatter supplies the visible table word and literal
 * prefix. The portable reference macros ask LaTeX for the final number, so a
 * class or template that redefines `\thetable` or `\theequation` remains
 * authoritative.
 *
 * May import: the parser and reference vocabulary. Upholds: a note without a
 * captioned table or labeled equation contributes no header, and every literal
 * inserted into TeX is escaped as text.
 */

import { referenceIndex } from '../markdown/document/reference_index';
import { parseMarkdown } from '../markdown/syntax/parser';
import { referenceVocabularyFromTree } from '../markdown/syntax/reference_vocabulary';

/** The table portion of a LaTeX/PDF run's generated header, or the empty string. */
export function referenceHeader(markdown: string): string {
  const references = referenceIndex(markdown);
  const hasTable = references.some((entry) => entry.kind === 'table');
  const hasEquation = references.some((entry) => entry.kind === 'equation');
  if (!hasTable && !hasEquation) {
    return '';
  }
  const vocabulary = referenceVocabularyFromTree(parseMarkdown(markdown));
  const lines = ['% Yi target references; generated from the document vocabulary.'];
  if (hasEquation) {
    lines.push('\\providecommand{\\equationname}{Equation}');
  }
  lines.push('\\AtBeginDocument{%');
  if (hasTable) {
    const style = vocabulary.table;
    lines.push(`  \\renewcommand{\\tablename}{${latexText(style.label)}}%`);
    if (style.prefix !== '') {
      lines.push(
        `  \\renewcommand{\\thetable}{\\mbox{${latexText(style.prefix)}}\\arabic{table}}%`
      );
    }
  }
  if (hasEquation) {
    const style = vocabulary.equation;
    lines.push(`  \\renewcommand{\\equationname}{${latexText(style.label)}}%`);
    if (style.prefix !== '') {
      lines.push(
        `  \\renewcommand{\\theequation}{\\mbox{${latexText(style.prefix)}}\\arabic{equation}}%`
      );
    }
  }
  lines.push('}');
  if (hasTable) {
    lines.push(
      '\\providecommand{\\yiTableRef}[1]{%',
      '  \\hyperref[#1]{\\tablename~\\ref*{#1}}%',
      '}'
    );
  }
  if (hasEquation) {
    lines.push(
      '\\providecommand{\\yiEquationRef}[1]{%',
      '  \\hyperref[#1]{\\equationname~\\eqref{#1}}%',
      '}'
    );
  }
  return `${lines.join('\n')}\n`;
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
