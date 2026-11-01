/**
 * The LaTeX header that aligns native caption counters with Yi's reference vocabulary.
 *
 * Figures, tables and listings use Pandoc's native counters. Equations use the
 * native equation counter, while lists use Yi's namespaced object counter.
 * Automatic table, equation and list references call the portable macros
 * below, so a template that redefines a counter remains authoritative.
 *
 * May import: the parser, the reference index, and the document vocabulary.
 * Upholds: a note without a referenced object contributes no header, and every
 * literal inserted into TeX is escaped as text.
 */

import { referenceIndex } from '../../markdown/document/reference_index';
import { parseMarkdown } from '../../markdown/syntax/parser';
import { referenceVocabularyFromTree } from '../../markdown/syntax/reference_vocabulary';

/** The generated LaTeX header for the document's caption words and number prefixes. */
export function referenceHeader(markdown: string): string {
  const references = referenceIndex(markdown);
  const hasFigure = references.some((entry) => entry.kind === 'figure');
  const hasListing = references.some((entry) => entry.kind === 'listing');
  const hasTable = references.some((entry) => entry.kind === 'table');
  const hasEquation = references.some((entry) => entry.kind === 'equation');
  const hasList = references.some((entry) => entry.kind === 'list');
  if (!hasFigure && !hasListing && !hasTable && !hasEquation && !hasList) {
    return '';
  }

  const vocabulary = referenceVocabularyFromTree(parseMarkdown(markdown));
  const lines = ['% Yi target references; generated from the document vocabulary.'];
  if (hasEquation) {
    lines.push('\\providecommand{\\equationname}{Equation}');
  }
  if (hasList) {
    lines.push(
      '\\makeatletter',
      '\\@ifundefined{c@yilist}{\\newcounter{yilist}}{}',
      '\\makeatother',
      '\\providecommand{\\yiListNumber}{\\arabic{yilist}}',
      '\\renewcommand{\\theyilist}{\\yiListNumber}',
      '\\providecommand{\\yiListName}{List}',
      '\\providecommand{\\yiListCounterSetup}{}'
    );
  }

  lines.push('\\AtBeginDocument{%');
  if (hasFigure) {
    const style = vocabulary.figure;
    lines.push(`  \\renewcommand{\\figurename}{${latexText(style.label)}}%`);
    if (style.prefix !== '') {
      lines.push(
        `  \\renewcommand{\\thefigure}{\\mbox{${latexText(style.prefix)}}\\arabic{figure}}%`
      );
    }
  }
  if (hasListing) {
    const style = vocabulary.listing;
    lines.push(
      '  \\ifdefined\\lstlistingname',
      `    \\renewcommand{\\lstlistingname}{${latexText(style.label)}}%`,
      '  \\fi'
    );
    if (style.prefix !== '') {
      lines.push(
        '  \\ifdefined\\thelstlisting',
        `    \\renewcommand{\\thelstlisting}{\\mbox{${latexText(style.prefix)}}\\arabic{lstlisting}}%`,
        '  \\fi'
      );
    }
  }
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
  if (hasList) {
    const style = vocabulary.list;
    lines.push('  \\yiListCounterSetup');
    lines.push(`  \\renewcommand{\\yiListName}{${latexText(style.label)}}%`);
    if (style.prefix !== '') {
      lines.push(
        `  \\renewcommand{\\theyilist}{\\mbox{${latexText(style.prefix)}}\\yiListNumber}%`
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
  if (hasList) {
    lines.push(
      '\\providecommand{\\yiListRef}[1]{%',
      '  \\hyperref[#1]{\\yiListName~\\ref*{#1}}%',
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
