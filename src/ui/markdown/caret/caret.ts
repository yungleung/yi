/**
 * Local blinking caret for editable markdown node components.
 *
 * The caret is a single absolutely-positioned span inside the editor's prose
 * root, anchored to the logical position (`activeRange`) of the caret. The
 * text itself is never split, so text shaping (ligatures, kerning pairs such
 * as "Ta"/"Te") stays identical with or without the caret, and the DOM never
 * accumulates fragments.
 *
 * The logical range remains the source of truth for arrow-key navigation and
 * offset mapping; the rendered span follows it and is re-anchored whenever
 * the surrounding layout changes (reveal swaps, lazy rendering, ...).
 *
 * Geometry lives in `geometry.ts`; the layout-mutation watcher lives in
 * `observer.ts`; navigation moves the logical range (see `navigation.ts`).
 */

import { caretRect, proseHost } from './geometry';
import { watchContentMutations } from './observer';

let caretElement: HTMLSpanElement | null = null;
let listenersAttached = false;
let activeRange: Range | null = null;
let stopWatchingLayout: (() => void) | null = null;

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

function createCaretElement(): HTMLSpanElement {
  const caret = document.createElement('span');
  caret.className = 'markdown-caret';
  caret.setAttribute('aria-hidden', 'true');
  return caret;
}

/** Removes the rendered caret span (and any stale ones from other instances). */
function removeCaretElement(): void {
  for (const stray of document.querySelectorAll('.markdown-caret')) {
    if (stray === caretElement) {
      continue;
    }
    stray.remove();
  }
  caretElement?.remove();
  caretElement = null;
}

/**
 * Navigation hook. The positioned caret never interferes with text walking,
 * so nothing needs cleaning; keeping the element in place lets movement reuse
 * it (style-only updates) instead of mutating the DOM on every arrow.
 */
export function normalizeCaretDom(): void {
}

/** Positions the (reused) caret span for the active range. */
function renderCaret(): void {
  if (!activeRange) {
    removeCaretElement();
    return;
  }

  const container = activeRange.startContainer;
  if (!container.isConnected) {
    removeCaretElement();
    return;
  }
  const host = proseHost(container);
  if (!host) {
    removeCaretElement();
    return;
  }
  const rect = caretRect(activeRange);
  if (!rect || rect.height <= 0) {
    removeCaretElement();
    return;
  }

  let caret = caretElement;
  if (!caret || !caret.isConnected || caret.parentElement !== host) {
    caret = createCaretElement();
    host.appendChild(caret);
    caretElement = caret;
  }
  placeCaret(caret, host, rect);
  ensureLayoutWatcher(host);
  scrollCaretIntoView(caret);
}

/**
 * Re-anchors the rendered caret to the active range without touching the DOM
 * tree (style only). Used after layout shifts such as reveal swaps and lazy
 * rendering, whose mutations would otherwise leave the caret misplaced.
 */
function positionCaret(): void {
  if (!caretElement || !activeRange || !activeRange.startContainer.isConnected) {
    removeCaretElement();
    return;
  }
  const host = proseHost(activeRange.startContainer);
  if (!host || caretElement.parentElement !== host) {
    removeCaretElement();
    return;
  }
  const rect = caretRect(activeRange);
  if (!rect || rect.height <= 0) {
    removeCaretElement();
    return;
  }
  placeCaret(caretElement, host, rect);
}

/**
 * Positions the caret span inside its host. The transform moves it without
 * invalidating layout; only the initial creation mutates the DOM.
 */
function placeCaret(
  caret: HTMLElement,
  host: HTMLElement,
  rect: { left: number; top: number; height: number }
): void {
  const hostRect = host.getBoundingClientRect();
  caret.style.transform = `translate(${rect.left - hostRect.left}px, ${rect.top - hostRect.top}px)`;
  caret.style.height = `${rect.height}px`;
}

/** Repositions the caret to the current logical position. */
export function refreshCaretPosition(): void {
  positionCaret();
}

/** Watches the editor's scroll container so content mutations re-anchor the caret. */
function ensureLayoutWatcher(host: HTMLElement): void {
  if (stopWatchingLayout) {
    return;
  }
  const scroller = host.closest('.overflow-auto') as HTMLElement | null;
  if (!scroller) {
    return;
  }
  stopWatchingLayout = watchContentMutations(scroller, () => positionCaret());
}

/**
 * Keeps the caret inside its scroll container: when the caret is rendered
 * (or moved with arrows) past the visible edge, scroll the editor so the
 * caret stays in view instead of drifting out to the status bar area.
 */
function scrollCaretIntoView(caret: HTMLElement): void {
  const scroller = caret.closest('.overflow-auto') as HTMLElement | null;
  if (!scroller) {
    return;
  }
  const caretBox = caret.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const margin = 8;
  if (caretBox.top < scrollerRect.top + margin) {
    scroller.scrollTop += caretBox.top - scrollerRect.top - margin;
  } else if (caretBox.bottom > scrollerRect.bottom - margin) {
    scroller.scrollTop += caretBox.bottom - scrollerRect.bottom + margin;
  }
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

/** Shows the caret at a collapsed range, rendered locally in the DOM. */
export function showCaret(range: Range | null): void {
  activeRange = range;
  notifyCaretRangeChanged(range);
  if (range) {
    renderCaret();
  } else {
    removeCaretElement();
  }
}

/**
 * Places the caret beside a character-less element (image, rule, ...), on the
 * side of the pointer. The caret is anchored to the element's boundary.
 */
export function showCaretBeside(element: HTMLElement, clientX: number): void {
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
  showCaret(range);
}

/** Removes the blinking caret from the document. */
export function hideCaret(): void {
  showCaret(null);
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
