/**
 * Surgical DOM patching for formatting commands.
 *
 * Re-rendering a whole block after every formatting edit is correct but
 * expensive: replacing a block element invalidates layout for the whole
 * document (measured around a second on a math-heavy file), so the formatted
 * result takes noticeably long to appear. A formatting edit only adds or
 * removes marker characters around rendered text, so the existing block DOM
 * can be patched in place — wrapping or unwrapping the affected nodes and
 * re-tagging their raw offsets. Structural changes of a few elements cost
 * ~1ms to lay out.
 *
 * Selections that cannot be patched safely (partially covering a formatted
 * unit, covering an unrevealed widget, spanning blocks, ...) return false so
 * the caller falls back to re-rendering the block.
 *
 * May import: the pure formatting rules and the state's parse
 * (`format.ts`, `state.ts`) and the text nodes it patches. Upholds: the DOM it
 * writes mirrors the edit that was made to the text — the raw offsets it
 * re-tags come from the same edit, so the rendering can never claim a range the
 * document does not have.
 */

import type { FormattingEdit, FormattingStyle } from './format';
import type { MarkdownEditorState } from './document/state';
import { preserveSpaces } from './nodes/text';

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
interface TaggedText {
  element: HTMLElement;
  start: number;
  end: number;
}

/**
 * Applies a formatting edit to the rendered block in place.
 *
 * Returns false when the edit cannot be patched safely; the caller then
 * re-renders the block through the normal path.
 */
export function patchFormatDom(
  state: MarkdownEditorState,
  root: HTMLElement,
  style: FormattingStyle,
  edit: FormattingEdit
): boolean {
  const block = state.getBlockAtOffset(edit.wrapFrom);
  if (!block) {
    return false;
  }
  const blockElement = root.querySelector<HTMLElement>(
    `.markdown-block[data-line-start="${block.lineStart}"]`
  );
  if (!blockElement) {
    return false;
  }

  const wrapFrom = edit.wrapFrom - block.charStart;
  const wrapTo = edit.wrapTo - block.charStart;
  if (edit.unwrap) {
    return unwrapUnit(blockElement, style, wrapFrom, wrapTo);
  }
  const contentFrom = edit.contentFrom - block.charStart;
  const contentTo = edit.contentTo - block.charStart;
  return wrapRange(blockElement, style, wrapFrom, wrapTo, contentFrom, contentTo);
}

/** The block's text leaves in DOM order, with their raw ranges. */
function taggedTexts(blockElement: HTMLElement): TaggedText[] {
  const texts: TaggedText[] = [];
  for (const element of blockElement.querySelectorAll<HTMLElement>('[data-text-from]')) {
    const text = element.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) {
      continue;
    }
    const start = Number(element.dataset.textFrom);
    if (!Number.isFinite(start)) {
      continue;
    }
    texts.push({ element, start, end: start + (text as Text).data.length });
  }
  return texts;
}

/** Whether the element renders a widget (citation, math, link, ...). */
function isWidget(element: HTMLElement): boolean {
  return (
    element.closest(
      '.markdown-citation, .markdown-wikilink, .markdown-math, .markdown-link, ' +
        '.markdown-image, .markdown-break, .markdown-thematic-break, ' +
        '.markdown-link-source, .markdown-image-source, .markdown-citation-source, ' +
        '.markdown-wikilink-source, .markdown-math-source, .markdown-break-source, ' +
        '.markdown-thematic-break-source, .markdown-footnote-source'
    ) !== null
  );
}

/** Creates the formatting element for a style, without raw tags yet. */
function createFormatElement(style: FormattingStyle): HTMLElement {
  const element = document.createElement(FORMAT_TAGS[style]);
  if (style === 'inlineCode') {
    element.className = 'markdown-inline-code';
  }
  element.classList.add('markdown-node');
  return element;
}

/** Creates a text span tagged with a raw start (adjusted by the shift pass). */
function makeTaggedSpan(oldStart: number, text: Text): HTMLElement {
  const span = document.createElement('span');
  span.classList.add('markdown-node');
  span.dataset.textFrom = String(oldStart);
  span.appendChild(document.createTextNode(preserveSpaces(text.data)));
  return span;
}

/**
 * Splits `element`'s text node so the piece `[pieceStart, pieceEnd)` is an
 * isolated text node, and returns that node. The element keeps any prefix
 * and suffix as sibling text nodes.
 */
function isolatePiece(element: HTMLElement, pieceStart: number, pieceEnd: number): Text {
  const text = element.firstChild as Text;
  const prefixLen = Math.max(0, pieceStart - (Number(element.dataset.textFrom) || 0));
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

/** Wraps the content range in a new formatting element. */
function wrapRange(
  blockElement: HTMLElement,
  style: FormattingStyle,
  wrapFrom: number,
  wrapTo: number,
  contentFrom: number,
  contentTo: number
): boolean {
  const texts = taggedTexts(blockElement);
  const overlapping = texts.filter((t) => t.start < contentTo && t.end > contentFrom);
  if (overlapping.length === 0) {
    return false;
  }

  // Units that the content covers entirely move into the wrapper whole. A
  // unit whose range is exactly the wrap range is the unit being wrapped
  // (e.g. wrapping `*x*` in bold) — its content sits inside its markers, so
  // it counts as whole even though the content range is narrower than it.
  const wholeUnits: HTMLElement[] = [];
  for (const element of blockElement.querySelectorAll<HTMLElement>('[data-format-from]')) {
    const start = Number(element.dataset.formatFrom);
    const end = Number(element.dataset.formatTo);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      continue;
    }
    const isWrapUnit = start === wrapFrom && end === wrapTo;
    const fullyCovered = start >= contentFrom && end <= contentTo;
    const partial = start < contentTo && end > contentFrom && !fullyCovered;
    if (partial && !isWrapUnit) {
      // Cutting through a formatted unit cannot be represented with tags.
      return false;
    }
    if (fullyCovered || isWrapUnit) {
      wholeUnits.push(element);
    }
  }
  // Only the outermost whole units move; inner ones stay inside them.
  const movedUnits = wholeUnits.filter((u) => !wholeUnits.some((o) => o !== u && o.contains(u)));
  const movedSet = new Set(movedUnits);

  // Widgets between the boundary leaves would leave a gap in the covered
  // text; their offsets only exist in the mdast model, not in the DOM.
  for (const t of overlapping) {
    if (isWidget(t.element)) {
      return false;
    }
  }
  let covered = 0;
  for (const t of overlapping) {
    covered += Math.min(t.end, contentTo) - Math.max(t.start, contentFrom);
  }
  if (covered < contentTo - contentFrom) {
    return false;
  }

  const markerLen = MARKER_LENGTH[style];
  const wrapper = createFormatElement(style);
  const textPieces: { start: number; text: Text }[] = [];
  const appended = new Set<HTMLElement>();

  // A stable anchor at the first moved node's position: every insertion is
  // done relative to it, so detaching leaves never invalidates the reference.
  const firstLeaf = overlapping[0];
  const firstUnit = firstLeaf.element.closest<HTMLElement>('[data-format-from]');
  const firstMoved =
    firstUnit && movedSet.has(firstUnit) ? firstUnit : firstLeaf.element;
  const firstParent = firstMoved.parentNode;
  if (!firstParent) {
    return false;
  }
  // Validate before mutating: partial leaves must live in the wrapper's own
  // parent, otherwise text would move across containers (list items, ...).
  for (const t of overlapping) {
    const pieceStart = Math.max(t.start, contentFrom);
    const pieceEnd = Math.min(t.end, contentTo);
    const whole = pieceStart === t.start && pieceEnd === t.end;
    if (!whole && t.element.parentNode !== firstParent) {
      return false;
    }
  }
  const anchor = document.createTextNode('');
  firstParent.insertBefore(anchor, firstMoved);

  for (const t of overlapping) {
    // Leaves inside a moved unit ride along with it.
    const unit = t.element.closest<HTMLElement>('[data-format-from]');
    if (unit && movedSet.has(unit)) {
      if (!appended.has(unit)) {
        appended.add(unit);
        wrapper.appendChild(unit);
      }
      continue;
    }

    const pieceStart = Math.max(t.start, contentFrom);
    const pieceEnd = Math.min(t.end, contentTo);
    const whole = pieceStart === t.start && pieceEnd === t.end;
    const parent = t.element.parentNode;
    if (!parent) {
      return false;
    }
    if (whole) {
      // A whole plain leaf moves into the wrapper as one node.
      wrapper.appendChild(t.element);
      continue;
    }
    const piece = isolatePiece(t.element, pieceStart, pieceEnd);
    if (pieceStart > t.start) {
      // Only the first leaf has a prefix; it goes before the wrapper.
      const prefix = t.element.childNodes[0] as Text;
      parent.insertBefore(makeTaggedSpan(t.start, prefix), anchor);
    }
    if (pieceEnd < t.end) {
      // Only the last leaf has a suffix; it goes after the wrapper.
      const suffix = t.element.childNodes[t.element.childNodes.length - 1] as Text;
      parent.insertBefore(makeTaggedSpan(pieceEnd, suffix), anchor.nextSibling);
    }
    textPieces.push({ start: pieceStart, text: piece });
    t.element.remove();
  }

  // Move the isolated text pieces into the wrapper. Whole leaves and nested
  // formatted units were already moved above; assigning `textContent` here
  // would clear them, which made a whole inline-code selection disappear.
  if (style === 'inlineCode') {
    for (const piece of textPieces) {
      wrapper.appendChild(piece.text);
    }
  } else {
    for (const piece of textPieces) {
      const span = document.createElement('span');
      span.classList.add('markdown-node');
      // The raw start is the old value; the shift pass moves it by the
      // marker length into the correct new position.
      span.dataset.textFrom = String(piece.start);
      span.appendChild(piece.text);
      wrapper.appendChild(span);
    }
  }

  firstParent.insertBefore(wrapper, anchor);
  anchor.remove();

  // Shift every raw tag in the block: content shifts by one marker, text
  // after the wrap range by two.
  shiftTags(blockElement, wrapFrom, wrapTo, markerLen, 1);
  wrapper.dataset.formatFrom = String(wrapFrom);
  // The wrap always adds two markers, so the wrapper ends after both.
  wrapper.dataset.formatTo = String(wrapTo + 2 * markerLen);
  if (style === 'inlineCode') {
    wrapper.dataset.textFrom = String(contentFrom + markerLen);
  }
  return true;
}

/** Removes the markers of a formatted unit by unwrapping its element. */
function unwrapUnit(
  blockElement: HTMLElement,
  style: FormattingStyle,
  wrapFrom: number,
  wrapTo: number
): boolean {
  const tag = FORMAT_TAGS[style].toUpperCase();
  let unit: HTMLElement | null = null;
  for (const element of blockElement.querySelectorAll<HTMLElement>(`${tag}[data-format-from]`)) {
    if (Number(element.dataset.formatFrom) === wrapFrom && Number(element.dataset.formatTo) === wrapTo) {
      unit = element;
      break;
    }
  }
  if (!unit) {
    return false;
  }

  const parent = unit.parentNode;
  if (!parent) {
    return false;
  }
  if (style === 'inlineCode') {
    const span = makeTaggedSpan(Number(unit.dataset.textFrom) || wrapFrom, document.createTextNode(unit.textContent ?? ''));
    parent.replaceChild(span, unit);
  } else {
    while (unit.firstChild) {
      parent.insertBefore(unit.firstChild, unit);
    }
    unit.remove();
  }

  const markerLen = MARKER_LENGTH[style];
  shiftTags(blockElement, wrapFrom, wrapTo, markerLen, -1);
  return true;
}

/**
 * Shifts every raw tag in the block by the marker delta: elements inside the
 * wrap range shift by one marker, elements after it by two.
 */
function shiftTags(
  blockElement: HTMLElement,
  wrapFrom: number,
  wrapTo: number,
  markerLen: number,
  direction: 1 | -1
): void {
  const deltaStart = (start: number): number => {
    if (direction > 0) {
      if (start >= wrapTo) {
        return 2 * markerLen;
      }
      if (start >= wrapFrom) {
        return markerLen;
      }
      return 0;
    }
    if (start >= wrapTo) {
      return -2 * markerLen;
    }
    if (start >= wrapFrom + markerLen) {
      return -markerLen;
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
      return end <= wrapTo ? markerLen : 2 * markerLen;
    }
    if (end <= wrapFrom) {
      return 0;
    }
    return end <= wrapTo - markerLen ? -markerLen : -2 * markerLen;
  };

  for (const element of blockElement.querySelectorAll<HTMLElement>('[data-text-from]')) {
    const start = Number(element.dataset.textFrom);
    if (Number.isFinite(start)) {
      element.dataset.textFrom = String(start + deltaStart(start));
    }
  }
  for (const element of blockElement.querySelectorAll<HTMLElement>('[data-format-from]')) {
    const start = Number(element.dataset.formatFrom);
    const end = Number(element.dataset.formatTo);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      element.dataset.formatFrom = String(start + deltaStart(start));
      element.dataset.formatTo = String(end + deltaEnd(end));
    }
  }
  for (const element of blockElement.querySelectorAll<HTMLElement>('[data-source-from]')) {
    const start = Number(element.dataset.sourceFrom);
    if (Number.isFinite(start)) {
      element.dataset.sourceFrom = String(start + deltaStart(start));
    }
  }
}
