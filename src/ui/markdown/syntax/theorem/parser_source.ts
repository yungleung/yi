/**
 * Rewrites declared theorem openings to the same-length directive spelling
 * understood by remark-directive.
 *
 * Example: `::: {.Theorem}` becomes `:::theorem    ` while an undeclared
 * `.Columns` opening remains exactly as written.
 *
 * May import: the shared fenced-Div directive adapter and theorem opening
 * reader. Upholds: offsets survive preparation and only declared classes become
 * theorem directives.
 */

import { divDirectivesForParsers } from '../container';
import type { TheoremVocabulary } from './model';
import { theoremFromOpening } from './reader';

/** The parser spelling of declared theorem Divs, with every source offset kept. */
export function theoremsForParsers(
  markdown: string,
  vocabulary: TheoremVocabulary
): string {
  return divDirectivesForParsers(markdown, (opening) => {
    const div = {
      from: 0,
      to: markdown.length,
      markerFrom: opening.quotePrefix.length + opening.fenceStart,
      markerTo: opening.quotePrefix.length + opening.fenceStart + opening.fenceLength,
      bodyFrom: 0,
      bodyTo: 0
    };
    return theoremFromOpening(opening, div, markdown, vocabulary) === null
      ? null
      : 'thm';
  });
}
