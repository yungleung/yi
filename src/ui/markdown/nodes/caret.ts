/**
 * Shared blinking caret for editable markdown node components.
 *
 * A single caret element is reused across the whole document. It is rendered as
 * a fixed-position span with a CSS blink animation, so showing it never mutates
 * the AST-rendered DOM tree.
 */

let caretElement: HTMLSpanElement | null = null;
let listenersAttached = false;

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
  hideCaret();

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
  hideCaret();

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return;
  }

  const caret = ensureCaretElement();
  const width = caret.getBoundingClientRect().width || 2;
  const before = clientX < rect.left + rect.width / 2;
  // Match the element's own height (e.g. an image) so the caret spans it fully,
  // but never shrink below a normal text caret so thin elements such as
  // horizontal rules still show one, centered on their line.
  const height = Math.max(rect.height, estimateLineHeight(element));
  const top = rect.top + (rect.height - height) / 2;

  caret.style.left = `${before ? rect.left - width : rect.right}px`;
  caret.style.top = `${top}px`;
  caret.style.height = `${height}px`;
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

  const rect = range.getBoundingClientRect();
  showCaretAtRect({
    left: rect.left,
    top: rect.top,
    height: rect.height || estimateLineHeight(range.startContainer)
  });
}

/** Removes the blinking caret from the document. */
export function hideCaret(): void {
  caretElement?.remove();
  caretElement = null;
}

function ensureListeners(): void {
  if (listenersAttached) {
    return;
  }
  listenersAttached = true;

  // The caret is viewport-anchored, so it must not survive scrolling.
  window.addEventListener('scroll', hideCaret, true);

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
