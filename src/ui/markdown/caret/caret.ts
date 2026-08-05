/**
 * Shared blinking caret for editable markdown node components.
 *
 * A single caret element is reused across the whole document. It is rendered as
 * a fixed-position span with a CSS blink animation, so showing it never mutates
 * the AST-rendered DOM tree.
 *
 * The caret has two facets:
 * - a logical position (`activeRange`), which arrow-key navigation reads and
 *   moves, and
 * - a rendered element, whose geometry is derived per placement.
 */

let caretElement: HTMLSpanElement | null = null;
let listenersAttached = false;
let activeRange: Range | null = null;

type CaretRangeListener = (range: Range | null) => void;
const caretRangeListeners = new Set<CaretRangeListener>();

function notifyCaretRangeChanged(range: Range | null): void {
  for (const listener of caretRangeListeners) {
    listener(range);
  }
}

/**
 * Subscribes to caret position changes, including when the caret is hidden
 * (the range is null). Returns an unsubscribe function.
 */
export function onCaretRangeChanged(listener: CaretRangeListener): () => void {
  caretRangeListeners.add(listener);
  return () => {
    caretRangeListeners.delete(listener);
  };
}

function ensureCaretElement(): HTMLSpanElement {
  if (!caretElement || !caretElement.isConnected) {
    caretElement = document.createElement('span');
    caretElement.className = 'markdown-caret';
    caretElement.setAttribute('aria-hidden', 'true');
    document.body.appendChild(caretElement);
  }
  return caretElement;
}

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

function removeCaretElement(): void {
  caretElement?.remove();
  caretElement = null;
}

/**
 * Re-anchors the rendered caret to the active range after layout shifts such
 * as scrolling (a real editor caret follows the text instead of vanishing).
 */
function refreshCaretPosition(): void {
  if (!activeRange) {
    return;
  }

  if (activeRange.startContainer.nodeType === Node.TEXT_NODE) {
    const rect = activeRange.getBoundingClientRect();
    showCaretAtRect({
      left: rect.left,
      top: rect.top,
      height: rect.height || estimateLineHeight(activeRange.startContainer)
    });
    return;
  }

  // Element-anchored ranges (beside an image / rule) have no reliable rect
  // after a layout change; hide rather than leave a stale caret behind.
  hideCaret();
}

/**
 * Returns the collapsed caret range under a viewport point, when the browser
 * can resolve one (WebKit/Chromium expose `caretRangeFromPoint`; standards
 * browsers expose `caretPositionFromPoint`).
 */
export function caretRangeAtPoint(clientX: number, clientY: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(clientX, clientY);
  }

  const position = doc.caretPositionFromPoint(clientX, clientY);
  if (!position) {
    return null;
  }

  const range = doc.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

/** Shows the blinking caret at a viewport rectangle (typically a collapsed range rect). */
export function showCaretAtRect(rect: { left: number; top: number; height: number }): void {
  removeCaretElement();

  const height = rect.height || estimateLineHeight(document.body);
  if (!Number.isFinite(height) || height <= 0) {
    return;
  }

  const caret = ensureCaretElement();
  caret.style.left = `${rect.left}px`;
  caret.style.top = `${rect.top}px`;
  caret.style.height = `${height}px`;
}

/**
 * Shows the blinking caret beside a character-less element (image, rule, ...),
 * on the side of the pointer. The caret never overlaps the element itself.
 */
export function showCaretBeside(element: HTMLElement, clientX: number): void {
  removeCaretElement();

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return;
  }

  const before = clientX < rect.left + rect.width / 2;
  const range = document.createRange();
  if (before) {
    range.setStartBefore(element);
  } else {
    range.setStartAfter(element);
  }
  range.collapse(true);
  activeRange = range;
  notifyCaretRangeChanged(range);

  // `activeRange` is the source of truth for the caret's logical position and
  // is what arrow navigation moves. Its own rect is degenerate (0x0) for
  // element-anchored ranges in WebKit, so the rendered geometry is taken from
  // the element's box, with the side read back from the range itself.
  const side = sideOfRange(element, range);
  const caret = ensureCaretElement();
  const width = caret.getBoundingClientRect().width || 2;
  // Match the element's own height (e.g. an image) so the caret spans it fully,
  // but never shrink below a normal text caret so thin elements such as
  // horizontal rules still show one, centered on their line.
  const height = Math.max(rect.height, estimateLineHeight(element));
  const top = rect.top + (rect.height - height) / 2;

  caret.style.left = `${side === 'before' ? rect.left - width : rect.right}px`;
  caret.style.top = `${top}px`;
  caret.style.height = `${height}px`;
}

/** Which side of the element the collapsed range sits on. */
function sideOfRange(element: HTMLElement, range: Range): 'before' | 'after' {
  const container = range.startContainer;
  const index =
    container instanceof Element ? Array.from(container.childNodes).indexOf(element) : -1;
  return range.startOffset <= index ? 'before' : 'after';
}

/** Shows the blinking caret at a collapsed range (a caret position inside text). */
export function showCaret(range: Range | null): void {
  // Caret positions only make sense inside a text node. Element-anchored ranges
  // (e.g. resolving a click in a flex gap) have degenerate rects and must never
  // render a caret (they would appear at the viewport origin).
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) {
    hideCaret();
    return;
  }

  activeRange = range;
  notifyCaretRangeChanged(range);
  const rect = range.getBoundingClientRect();
  showCaretAtRect({
    left: rect.left,
    top: rect.top,
    height: rect.height || estimateLineHeight(range.startContainer)
  });
}

/** Removes the blinking caret from the document. */
export function hideCaret(): void {
  activeRange = null;
  notifyCaretRangeChanged(null);
  removeCaretElement();
}

/** Returns the current caret position, or null when no caret is shown. */
export function getCaretRange(): Range | null {
  return activeRange;
}

/** Moves the caret to a new collapsed position and re-renders it. */
export function setCaretRange(range: Range | null): void {
  showCaret(range);
}

function ensureListeners(): void {
  if (listenersAttached) {
    return;
  }
  listenersAttached = true;

  // Keep the caret pinned to its text position as the document scrolls or the
  // layout shifts (e.g. an image revealing its source shrinks the content).
  window.addEventListener('scroll', refreshCaretPosition, true);

  // Clicking anywhere outside an editable markdown node clears the caret.
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('.markdown-node')) {
      return;
    }
    hideCaret();
  });
}

ensureListeners();
