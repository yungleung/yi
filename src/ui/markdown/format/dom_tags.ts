/**
 * Tagged-text and DOM primitives used by the in-place formatting patcher.
 *
 * Example: `taggedTexts(block)` answers each rendered text leaf with its raw
 * range; `shiftTags(block, …)` moves those ranges when markers are added.
 *
 * May import: formatting style names, literal-space rendering and raw offset
 * tags. Upholds: every DOM primitive used by formatting keeps its text in the
 * raw-offset vocabulary the rest of the editor maps through.
 */

import type { FormattingStyle } from './rules';
import { preserveSpaces } from '../text_spacing';
import {
  FORMAT_FROM,
  FORMAT_TO,
  SOURCE_FROM,
  TEXT_FROM,
  offsetOf,
  setOffset
} from '../offset_tags';

const FORMAT_TAGS: Record<FormattingStyle, string> = {
  bold: 'strong',
  italic: 'em',
  strikethrough: 'del',
  inlineCode: 'code'
};

const MARKER_LENGTH: Record<FormattingStyle, number> = {
  bold: 2,
  italic: 1,
  strikethrough: 2,
  inlineCode: 1
};

/** A rendered text leaf (span or inline code) with its block-relative raw range. */
export interface TaggedText {
  element: HTMLElement;
  start: number;
  end: number;
}

/** The element name represented by a formatting style. */
export function formatTag(style: FormattingStyle): string {
  return FORMAT_TAGS[style];
}

/** How many marker characters the style contributes at each edge. */
export function markerLength(style: FormattingStyle): number {
  return MARKER_LENGTH[style];
}

/** The block's text leaves in DOM order, with their raw ranges. */
export function taggedTexts(blockElement: HTMLElement): TaggedText[] {
  const texts: TaggedText[] = [];
  for (const element of blockElement.querySelectorAll<HTMLElement>(`[data-${TEXT_FROM}]`)) {
    const text = element.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) {
      continue;
    }
    const start = offsetOf(element, TEXT_FROM);
    if (!Number.isFinite(start)) {
      continue;
    }
    texts.push({ element, start, end: start + (text as Text).data.length });
  }
  return texts;
}

/**
 * Whether the element is a widget's own drawing rather than the document's text: a citation or a
 * link at rest (`markdown-citation`, `markdown-link`, …), or any of the sources a widget shows
 * while the caret is inside it (`markdown-…-source`).
 */
export function isWidget(element: HTMLElement): boolean {
  return (
    element.closest(
      '.markdown-citation, .markdown-wikilink, .markdown-link, ' +
        '.markdown-link-source, .markdown-image-source, .markdown-citation-source, ' +
        '.markdown-wikilink-source, .markdown-math-source, .markdown-break-source, ' +
        '.markdown-thematic-break-source, .markdown-footnote-source'
    ) !== null
  );
}

/** Creates the formatting element for a style, without raw tags yet. */
export function createFormatElement(style: FormattingStyle): HTMLElement {
  const element = document.createElement(FORMAT_TAGS[style]);
  if (style === 'inlineCode') {
    element.className = 'markdown-inline-code';
  }
  element.classList.add('markdown-node');
  return element;
}

/** Creates a text span tagged with a raw start (adjusted by the shift pass). */
export function makeTaggedSpan(oldStart: number, text: Text): HTMLElement {
  const span = document.createElement('span');
  span.classList.add('markdown-node');
  setOffset(span, TEXT_FROM, oldStart);
  span.appendChild(document.createTextNode(preserveSpaces(text.data)));
  return span;
}

/**
 * Splits `element`'s text node so the piece `[pieceStart, pieceEnd)` is an
 * isolated text node, and returns that node. The element keeps any prefix
 * and suffix as sibling text nodes.
 */
export function isolatePiece(
  element: HTMLElement,
  pieceStart: number,
  pieceEnd: number
): Text {
  const text = element.firstChild as Text;
  const prefixLen = Math.max(0, pieceStart - (offsetOf(element, TEXT_FROM) || 0));
  let node = text;
  if (prefixLen > 0) {
    node = text.splitText(prefixLen);
  }
  const pieceLen = Math.max(0, pieceEnd - pieceStart);
  if (pieceLen < node.data.length) {
    node.splitText(pieceLen);
  }
  return node;
}

/**
 * Shifts every raw tag in the block by the marker delta: elements inside the
 * wrap range shift by one marker, elements after it by two.
 */
export function shiftTags(
  blockElement: HTMLElement,
  wrapFrom: number,
  wrapTo: number,
  markers: number,
  direction: 1 | -1
): void {
  const deltaStart = (start: number): number => {
    if (direction > 0) {
      if (start >= wrapTo) {
        return 2 * markers;
      }
      if (start >= wrapFrom) {
        return markers;
      }
      return 0;
    }
    if (start >= wrapTo) {
      return -2 * markers;
    }
    if (start >= wrapFrom + markers) {
      return -markers;
    }
    return 0;
  };
  // Format ends are exclusive (past the closing marker): an end at or inside
  // the wrap range shifts by one marker, an end past it by two.
  const deltaEnd = (end: number): number => {
    if (direction > 0) {
      if (end <= wrapFrom) {
        return 0;
      }
      return end <= wrapTo ? markers : 2 * markers;
    }
    if (end <= wrapFrom) {
      return 0;
    }
    return end <= wrapTo - markers ? -markers : -2 * markers;
  };

  for (const element of blockElement.querySelectorAll<HTMLElement>(`[data-${TEXT_FROM}]`)) {
    const start = offsetOf(element, TEXT_FROM);
    if (Number.isFinite(start)) {
      setOffset(element, TEXT_FROM, start + deltaStart(start));
    }
  }
  for (const element of blockElement.querySelectorAll<HTMLElement>(`[data-${FORMAT_FROM}]`)) {
    const start = offsetOf(element, FORMAT_FROM);
    const end = offsetOf(element, FORMAT_TO);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      setOffset(element, FORMAT_FROM, start + deltaStart(start));
      setOffset(element, FORMAT_TO, end + deltaEnd(end));
    }
  }
  for (const element of blockElement.querySelectorAll<HTMLElement>(`[data-${SOURCE_FROM}]`)) {
    const start = offsetOf(element, SOURCE_FROM);
    if (Number.isFinite(start)) {
      setOffset(element, SOURCE_FROM, start + deltaStart(start));
    }
  }
}
