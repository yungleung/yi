/**
 * Reads the shared Pandoc-style caption line used by tables and lists.
 *
 * The line begins with `:` and separation whitespace, carries inline Markdown,
 * and may end in one Pandoc attribute block. This module owns only that source
 * grammar; each block kind decides when the line attaches.
 *
 * May import: the shared Pandoc attribute grammar. Upholds: malformed or
 * non-final attributes remain caption text and create no target.
 */

import {
  attributeBlockAtEnd,
  trimSpacesBack,
  type PandocAttributeBlock
} from '../pandoc';

/** One caption line, with every range in document coordinates. */
export interface CaptionLineData {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  caption: string;
  source: string;
  attribute: PandocAttributeBlock | null;
  captionFrom: number;
  captionTo: number;
  textFrom: number;
  textTo: number;
}

/**
 * The caption data on one line, or null when the line is not a caption.
 *
 * Example: `': Results {#tbl:data}'` returns caption `'Results'` and id
 * `'tbl:data'`; `'Results'` without the colon returns null.
 */
export function captionLine(line: string, from: number): CaptionLineData | null {
  const opening = /^:(\s+)/.exec(line);
  if (opening === null) {
    return null;
  }
  const contentFrom = opening[0].length;
  const relative = attributeBlockAtEnd(line, line.length, true);
  const attribute =
    relative === null
      ? null
      : {
          ...relative,
          from: from + relative.from,
          to: from + relative.to,
          separatorFrom: from + relative.separatorFrom
        };
  const textEnd = trimSpacesBack(line, relative?.separatorFrom ?? line.length);
  const caption = line.slice(contentFrom, textEnd);
  if (caption === '' && attribute?.id == null) {
    return null;
  }
  return {
    id: attribute?.id ?? null,
    classes: attribute?.classes ?? [],
    attributes: attribute?.attributes ?? {},
    caption,
    source: line,
    attribute,
    captionFrom: from,
    captionTo: from + line.length,
    textFrom: from + contentFrom,
    textTo: from + textEnd
  };
}
