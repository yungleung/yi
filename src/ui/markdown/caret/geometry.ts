/**
 * Pure geometry helpers for the caret: where a caret position sits on screen
 * and how to estimate a line's height. These have no dependencies on the
 * editor, so both the caret renderer and arrow navigation share them.
 *
 * May import: nothing but the DOM. Upholds: a caret's rendered position is
 * derived from its range — this module measures that range and holds no state,
 * so the same range always measures the same way.
 */

/**
 * The viewport rectangle of a caret position: the collapsed range rect for
 * text, or the boundary child's edge for element-anchored ranges (beside an
 * image/rule/break, or a revealed source span). Returns null when no usable
 * geometry exists.
 */
export function caretRect(range: Range): { left: number; top: number; height: number } | null {
  const container = range.startContainer;
  if (container.nodeType === Node.TEXT_NODE) {
    const rect = range.getBoundingClientRect();
    if (rect.height > 0) {
      return { left: rect.left, top: rect.top, height: rect.height };
    }
    // A collapsed range at a soft-wrap boundary can have no rectangle at all: WebKit gives an
    // empty rect for the collapsed space that ends the visual line above. Anchor it to the
    // nearest visible glyph before that boundary, so stepping left from the next line lands at
    // the previous line's right edge rather than the paragraph's start.
    const previousGlyph = boundaryGlyphRect(container as Text, range.startOffset, -1);
    if (previousGlyph) {
      return {
        left: previousGlyph.right,
        top: previousGlyph.top,
        height: previousGlyph.height
      };
    }
    // At the start of a text node there is no glyph before the boundary; the first visible glyph
    // is the line's left edge instead.
    const nextGlyph = boundaryGlyphRect(container as Text, range.startOffset, 1);
    if (nextGlyph) {
      return { left: nextGlyph.left, top: nextGlyph.top, height: nextGlyph.height };
    }
    // Degenerate collapsed rect (rare): anchor at the text node's own box.
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(container);
    const box = nodeRange.getBoundingClientRect();
    if (box.height > 0 || box.width > 0) {
      return {
        left: rect.left || box.left,
        top: box.top,
        height: box.height || estimateLineHeight(container)
      };
    }
    // A text node that measures as nothing — the *empty* one a placeholder holds, on a blank line,
    // an empty list item or an empty cell — has no position of its own: the line it sits on does.
    const line = lineBoxAround(container);
    if (line) {
      // The bar is as tall as the *type*, not as tall as the line: that is what a caret in a text
      // node measures as, and a blank line's own box is the block's `min-height` (one whole line).
      const height = Math.min(caretFontHeight(container.parentElement ?? document.body), line.height || Infinity);
      return {
        left: line.left,
        top: line.top + Math.max(0, (line.height - height) / 2),
        height: height > 0 ? height : estimateLineHeight(container)
      };
    }
    return {
      left: rect.left,
      top: rect.top,
      height: estimateLineHeight(container)
    };
  }

  // Element container: the caret can sit on a child boundary (beside an
  // image/rule/break, or a revealed source span). Anchor at that child's edge
  // so the caret sits at the node's real start/end instead of the container's
  // left edge.
  const element = container as Element;
  const offset = Math.min(Math.max(0, range.startOffset), element.childNodes.length);
  const after = offset < element.childNodes.length ? element.childNodes[offset] : null;
  const before = offset > 0 ? element.childNodes[offset - 1] : null;
  if (after?.nodeType === Node.ELEMENT_NODE) {
    const childRect = (after as Element).getBoundingClientRect();
    if (childRect.height > 0) {
      return { left: childRect.left, top: childRect.top, height: childRect.height };
    }
  }
  if (before?.nodeType === Node.ELEMENT_NODE) {
    const childRect = (before as Element).getBoundingClientRect();
    if (childRect.height > 0) {
      return { left: childRect.right, top: childRect.top, height: childRect.height };
    }
  }

  // Empty container: anchor at the element's content box.
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padTop = parseFloat(style.paddingTop) || 0;
  return {
    left: box.left + padLeft,
    top: box.top + padTop,
    height: box.height > 0 ? box.height : estimateLineHeight(element)
  };
}

/**
 * The nearest visible character rectangle before or after a zero-width boundary. A wrapped space,
 * a newline or another non-painting character can have no rectangle of its own, so the search
 * continues in the requested direction until a painted character is found.
 */
function boundaryGlyphRect(text: Text, offset: number, direction: -1 | 1): DOMRect | null {
  let cursor = Math.max(0, Math.min(offset, text.data.length));
  while (direction < 0 ? cursor > 0 : cursor < text.data.length) {
    const start = direction < 0 ? previousCharacterStart(text.data, cursor) : cursor;
    const end = direction < 0 ? cursor : nextCharacterEnd(text.data, cursor);
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, end);
    const rects = [...range.getClientRects()].filter((rect) => rect.height > 0);
    if (rects.length > 0) {
      return direction < 0 ? rects[rects.length - 1] : rects[0];
    }
    cursor = direction < 0 ? start : end;
  }
  return null;
}

/** The start of the code point immediately before `offset`. */
function previousCharacterStart(text: string, offset: number): number {
  const end = Math.max(0, Math.min(offset, text.length));
  if (end >= 2) {
    const low = text.charCodeAt(end - 1);
    const high = text.charCodeAt(end - 2);
    if (low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff) {
      return end - 2;
    }
  }
  return Math.max(0, end - 1);
}

/** The end of the code point immediately after `offset`. */
function nextCharacterEnd(text: string, offset: number): number {
  const start = Math.max(0, Math.min(offset, text.length));
  if (start < text.length - 1) {
    const high = text.charCodeAt(start);
    const low = text.charCodeAt(start + 1);
    if (high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) {
      return start + 2;
    }
  }
  return Math.min(text.length, start + 1);
}

/**
 * The left edge of a collapsed position, for a position that has no box of its own: the line's own
 * left edge (`lineBoxAround`) instead of the nothing an *empty* text node measures as. This is what
 * picks between the two ends of a node whose only text is a placeholder (`nodes/editable_node.ts:
 * placeCaretFallback`).
 */
export function caretLeft(node: Text, offset: number): number {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  if (rect.height > 0 || rect.width > 0) {
    return rect.left;
  }
  const line = lineBoxAround(node);
  return line ? line.left : rect.left;
}

/** Caret heights by font, so a fallback costs one style read and no canvas work after the first. */
const fontHeights = new Map<string, number>();

/**
 * The height a caret takes in this element's font: what a range over one of its characters measures
 * as — the font's own ascent and descent, which is *not* the line height. Measured from the font
 * itself (`fontBoundingBoxAscent`/`Descent`), because the line box of a blank line is the block's
 * own `min-height` and would give the caret a bar as tall as the line.
 */
export function caretFontHeight(element: Element): number {
  const style = getComputedStyle(element);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const cached = fontHeights.get(font);
  if (cached !== undefined) {
    return cached;
  }
  let height = 0;
  const context = document.createElement('canvas').getContext('2d');
  if (context) {
    context.font = font;
    const metrics = context.measureText('M');
    height = (metrics.fontBoundingBoxAscent ?? 0) + (metrics.fontBoundingBoxDescent ?? 0);
  }
  if (!(height > 0)) {
    height = (parseFloat(style.fontSize) || 16) * 1.2;
  }
  fontHeights.set(font, height);
  return height;
}

/**
 * The box of the line a text position sits on, for a position that has no box of its own: the
 * nearest ancestor that has one — the paragraph, the list item, the cell, the body a fence draws —
 * read as its *content* box, so padding is not mistaken for the line. Null when nothing around it
 * has a box either.
 */
export function lineBoxAround(
  node: Node
): { left: number; top: number; height: number } | null {
  for (let element = node.parentElement; element !== null; element = element.parentElement) {
    const box = element.getBoundingClientRect();
    if (box.height <= 0) {
      continue;
    }
    const style = getComputedStyle(element);
    const padTop = parseFloat(style.paddingTop) || 0;
    const padBottom = parseFloat(style.paddingBottom) || 0;
    return {
      left: box.left + (parseFloat(style.paddingLeft) || 0),
      top: box.top + padTop,
      height: Math.max(0, box.height - padTop - padBottom)
    };
  }
  return null;
}

/** The computed line height around a node, with a sane default. */
function estimateLineHeight(container: Node): number {
  const host =
    container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : (container as HTMLElement);
  const style = getComputedStyle(host ?? document.body);
  const fontSize = parseFloat(style.fontSize) || 16;
  const lineHeight = parseFloat(style.lineHeight);
  return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : fontSize * 1.2;
}

/** The editor's prose root (positioning host) for a node, or null. */
export function proseHost(node: Node): HTMLElement | null {
  return (node.nodeType === Node.TEXT_NODE
    ? node.parentElement
    : (node as Element)
  )?.closest('.prose') as HTMLElement | null;
}
