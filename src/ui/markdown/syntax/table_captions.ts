/**
 * Reads a Pandoc table caption line.
 *
 * The line begins with `:` and separation whitespace, carries inline
 * Markdown, and may end in one Pandoc attribute block. This module owns only
 * that source grammar; attaching the caption to its table and parsing the
 * caption's inline Markdown happen later.
 *
 * May import: the shared Pandoc attribute grammar. Upholds: malformed or
 * non-final attributes remain caption text and create no target.
 */

import {
  attributeBlockAtEnd,
  trimSpacesBack,
  type PandocAttributeBlock
} from './pandoc_attributes';

/** One caption line, with every range in its block's coordinates. */
export interface TableCaptionData {
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
 * `from` is the line's block-relative start. A caption needs non-empty inline
 * text or a non-empty ID; whitespace alone remains ordinary source.
 */
export function tableCaptionLine(line: string, from: number): TableCaptionData | null {
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

/** Whether a line carries the table-caption marker. */
export function isTableCaptionLine(line: string): boolean {
  return tableCaptionLine(line, 0) !== null;
}
