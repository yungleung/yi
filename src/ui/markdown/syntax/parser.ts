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
} from './caption_repairs';
import {
  fixDescriptionPositions,
  remarkDeflistCompat
} from './description_repairs';
import { restoreBareMarkers } from './bare_markers';
import { calloutsForParsers } from './callouts';
import { restoreEmptyItems } from './empty_items';
import { equationsForParsers } from './equation_masking';
import { restoreFigures } from './figures';
import { listCaptionsForParsers } from './list_captions';
import { restoreListings } from './listings';
import { frontmatterForParsers } from './markers';
import { createParseProcessor } from './remark_pipeline';
import { serializeMarkdown } from './serializer';
import { restoreSpacedDestinations } from './spaced_destinations';

export { serializeMarkdown };

const parseProcessor = createParseProcessor(remarkDeflistCompat);

export function parseMarkdown(markdown: string): Root {
  const prepared = equationsForParsers(
    calloutsForParsers(frontmatterForParsers(markdown))
  );
  const parserText = listCaptionsForParsers(prepared);
  const tree = parseProcessor.parse(parserText) as Root;
  const root = parseProcessor.runSync(tree, {
    value: parserText,
    data: { calloutSource: markdown }
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
