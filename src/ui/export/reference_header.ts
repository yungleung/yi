/**
 * Builds the LaTeX header that applies literal prefixes to native target counters.
 *
 * Labels and prefixes are document metadata. This module only translates their
 * numbering effect into LaTeX; empty prefixes add no command, and list labels
 * remain Yi-generated because Pandoc has no native list counter.
 *
 * May import: the Markdown parser and the reference vocabulary. Upholds: native
 * captions and Yi's automatic-reference text use the same configured prefix.
 */

import { parseMarkdown } from '../markdown/syntax/parser';
import { referenceVocabularyFromTree } from '../markdown/syntax/reference_vocabulary';

/** The generated LaTeX header for the document's caption words and number prefixes. */
export function referenceHeader(markdown: string): string {
  const vocabulary = referenceVocabularyFromTree(parseMarkdown(markdown));
  const commands: string[] = [
    `  \\renewcommand{\\figurename}{${latexText(vocabulary.figure.label)}}`,
    `  \\renewcommand{\\tablename}{${latexText(vocabulary.table.label)}}`,
    '  \\ifdefined\\lstlistingname',
    `    \\renewcommand{\\lstlistingname}{${latexText(vocabulary.listing.label)}}`,
    '  \\fi'
  ];
  for (const kind of ['figure', 'table', 'equation'] as const) {
    const prefix = vocabulary[kind].prefix;
    if (prefix !== '') {
      commands.push(
        `  \\renewcommand{\\the${kind}}{\\mbox{${latexText(prefix)}}\\arabic{${kind}}}`
      );
    }
  }
  const listing = vocabulary.listing.prefix;
  if (listing !== '') {
    commands.push(
      '  \\ifdefined\\thelstlisting',
      `    \\renewcommand{\\thelstlisting}{\\mbox{${latexText(listing)}}\\arabic{lstlisting}}`,
      '  \\fi'
    );
  }
  return ['\\AtBeginDocument{%', ...commands.map((line) => `${line}%`), '}', ''].join('\n');
}

/** Literal prefix text as printable LaTeX. */
function latexText(value: string): string {
  const escapes: Record<string, string> = {
    '\\': '\\textbackslash{}',
    '{': '\\{',
    '}': '\\}',
    $: '\\$',
    '&': '\\&',
    '#': '\\#',
    _: '\\_',
    '%': '\\%',
    '^': '\\textasciicircum{}',
    '~': '\\textasciitilde{}'
  };
  return value.replace(/[\\{}$&#_%^~]/g, (character) => escapes[character] ?? character);
}

