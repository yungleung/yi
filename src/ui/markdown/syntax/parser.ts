/**
 * The public Markdown parser facade: prepare one block, run the remark
 * pipeline, and repair the nodes whose source spans the pipeline cannot retain.
 *
 * Example: `parseMarkdown('term\n: detail')` returns one `descriptionlist`
 * whose term and detail nodes carry absolute offsets into the input.
 *
 * May import: the remark pipeline, source-preparation rules, node repairs and
 * serializer. Upholds: this is the editor's one parse entry point, and every
 * repair runs after the pipeline in the order the node contracts require.
 */

import type { Root } from 'mdast';
import {
  restoreListCaptions,
  restoreTableCaptions
} from './caption';
import {
  fixDescriptionPositions,
  remarkDeflistCompat
} from './description_repairs';
import { restoreBareMarkers } from './bare_markers';
import { calloutsForParsers } from './callout';
import { restoreListings } from './code';
import { restoreEmptyItems } from './empty_items';
import { equationsForParsers } from './equation';
import { restoreFigures } from './figures';
import { listCaptionsForParsers } from './list';
import { frontmatterForParsers } from './markers';
import { frontmatterText } from './markers';
import { createParseProcessor } from './remark_pipeline';
import { serializeMarkdown } from './serializer';
import { restoreSpacedDestinations } from './spaced_destinations';
import {
  theoremVocabularyFromFrontmatter,
  theoremsForParsers,
  type TheoremVocabulary
} from './theorem';

export { serializeMarkdown };

const parseProcessor = createParseProcessor(remarkDeflistCompat);

export interface ParseOptions {
  theoremVocabulary?: TheoremVocabulary;
}

export function parseMarkdown(markdown: string, options: ParseOptions = {}): Root {
  const theoremVocabulary =
    options.theoremVocabulary ??
    theoremVocabularyFromFrontmatter(frontmatterText(markdown));
  const prepared = equationsForParsers(
    theoremsForParsers(
      calloutsForParsers(frontmatterForParsers(markdown)),
      theoremVocabulary
    )
  );
  const parserText = listCaptionsForParsers(prepared);
  const tree = parseProcessor.parse(parserText) as Root;
  const root = parseProcessor.runSync(tree, {
    value: parserText,
    data: {
      calloutSource: markdown,
      theoremVocabulary
    }
  }) as Root;
  fixDescriptionPositions(root, markdown);
  restoreBareMarkers(root, markdown);
  restoreEmptyItems(root, markdown);
  restoreSpacedDestinations(root, markdown);
  restoreFigures(root, markdown);
  restoreListings(root, markdown);
  restoreTableCaptions(root, markdown);
  restoreListCaptions(root, markdown);
  return root;
}
