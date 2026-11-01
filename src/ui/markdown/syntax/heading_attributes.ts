/**
 * Finds Pandoc's trailing attribute block on an ATX or setext heading.
 *
 * This module owns only where heading attributes may stand; the shared Pandoc
 * attribute reader owns their grammar.
 *
 * May import: the shared Pandoc attribute syntax. Upholds: one fact about
 * markdown syntax has one home.
 */

import {
  attributeBlockAtEnd,
  trimSpacesBack,
  type PandocAttributeBlock
} from './pandoc';

/** A trailing Pandoc attribute block, in heading-source coordinates. */
export type HeadingAttributeBlock = PandocAttributeBlock;

/** The heading's trailing attribute block, or null. */
export function readHeadingAttributes(source: string): HeadingAttributeBlock | null {
  const contentEnd = headingContentEnd(source);
  return contentEnd === null ? null : attributeBlockAtEnd(source, contentEnd, true);
}

/**
 * Where a heading's own content ends: before optional ATX closing hashes, or
 * before a setext underline.
 */
function headingContentEnd(source: string): number | null {
  const firstEnd = source.indexOf('\n');
  const firstLineEnd = firstEnd < 0 ? source.length : firstEnd;
  const firstLine = source.slice(0, firstLineEnd);
  if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(firstLine)) {
    let contentEnd = trimSpacesBack(source, firstLineEnd);
    const closing = /[ \t]+#+$/.exec(firstLine.slice(0, contentEnd));
    if (closing) {
      contentEnd = trimSpacesBack(source, closing.index);
    }
    return contentEnd;
  }

  const trimmed = source.replace(/[ \t\r\n]+$/, '');
  const underlineAt = trimmed.lastIndexOf('\n');
  if (
    underlineAt < 0 ||
    !/^ {0,3}(?:=+|-+)[ \t]*$/.test(trimmed.slice(underlineAt + 1))
  ) {
    return null;
  }
  const titleEnd = underlineAt;
  const titleStart = trimmed.lastIndexOf('\n', underlineAt - 1) + 1;
  return titleStart >= titleEnd ? null : titleEnd;
}
