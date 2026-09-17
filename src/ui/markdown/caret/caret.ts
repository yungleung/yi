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
let selectionRange: Range | null = null;
let stopWatchingLayout: (() => void) | null = null;
let caretFrame: number | null = null;
let caretTimeout: number | null = null;
let pendingNativeSelection: Range | null = null;
let selectionTimeout: number | null = null;

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
  renderCaretNow();
}

/**
 * Positions the caret on the next animation frame, coalescing consecutive
 * requests. Used right after a DOM mutation (a block re-render) where
 * measuring immediately would force a full layout; the caller returns before
 * the expensive geometry is computed. A timer fallback guarantees the caret
 * still renders when animation frames are throttled (occluded/backgrounded
 * windows), since a missing caret is worse than a slightly later one.
 */
function renderCaretDeferred(): void {
  if (caretFrame !== null) {
    return;
  }
  caretFrame = requestAnimationFrame(() => {
    caretFrame = null;
    if (caretTimeout !== null) {
      clearTimeout(caretTimeout);
      caretTimeout = null;
    }
    renderCaretNow();
    // This frame's measurement can be stale — an edit can insert a block that
    // layout has not placed yet, a `content-visibility: auto` block can still
    // be skipped — so the caret is neither trusted nor scrolled from it. One
    // more frame re-anchors it, and scrolls, against the settled layout;
    // scrolling from the stale measurement moved the page when the caret had
    // not moved at all.
    renderCaretNow(false);
    requestAnimationFrame(() => {
      positionCaret();
      if (caretElement) {
        scrollCaretIntoView(caretElement);
      }
    });
  });
  caretTimeout = window.setTimeout(() => {
    if (caretFrame !== null) {
      cancelAnimationFrame(caretFrame);
      caretFrame = null;
    }
    caretTimeout = null;
    renderCaretNow();
  }, 120);
}

/** Cancels a pending deferred caret render. */
function clearPendingCaretRender(): void {
  if (caretFrame !== null) {
    cancelAnimationFrame(caretFrame);
    caretFrame = null;
  }
  if (caretTimeout !== null) {
    clearTimeout(caretTimeout);
    caretTimeout = null;
  }
}

/**
 * Applies a native (browser) selection after the current frame's paint.
 *
 * `removeAllRanges` + `addRange` force synchronous selection painting, which
 * is the dominant cost of a formatting edit on large documents (measured at
 * ~140ms on the math-heavy file). The editor's own selection state is
 * updated synchronously by the caller, so only the visible highlight is
 * deferred: the formatted text paints at the next frame, and the highlight
 * lands in the task right after it.
 */
export function scheduleNativeSelection(range: Range): void {
  pendingNativeSelection = range;
  if (selectionTimeout !== null) {
    return;
  }
  selectionTimeout = window.setTimeout(() => {
    selectionTimeout = null;
    const target = pendingNativeSelection;
    pendingNativeSelection = null;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    if (target) {
      selection?.addRange(target);
    }
  }, 0);
}

/** Cancels a deferred native selection (e.g. the caret moved or was hidden). */
function clearPendingNativeSelection(): void {
  pendingNativeSelection = null;
  if (selectionTimeout !== null) {
    clearTimeout(selectionTimeout);
    selectionTimeout = null;
  }
}

function renderCaretNow(scroll = true): void {
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
  let caret = caretElement;
  if (!caret || !caret.isConnected || caret.parentElement !== host) {
    caret = createCaretElement();
    host.appendChild(caret);
    caretElement = caret;
  }
  // Ensure the caret element exists before measuring, so one layout serves
  // both the range rect and the host rect instead of two.
  const rect = caretRect(activeRange);
  if (!rect || rect.height <= 0) {
    removeCaretElement();
    return;
  }
  placeCaret(caret, host, rect);
  ensureLayoutWatcher(host);
  if (scroll) {
    scrollCaretIntoView(caret);
  }
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

/**
 * Re-creates the caret element when a DOM swap (a virtualized window change)
 * dropped it, leaving the logical range untouched.
 */
export function ensureCaretRendered(): void {
  if (activeRange && (!caretElement || !caretElement.isConnected)) {
    // Called from the renderer's swap hook, where the DOM is mid-reconcile:
    // the caret span has to come back, but scrolling from a measurement taken
    // here moved the page to a position the caret never occupied. The deferred
    // pass scrolls once the layout has settled.
    renderCaretNow(false);
  }
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
  if (!range) {
    clearPendingNativeSelection();
  }
  activeRange = range;
  notifyCaretRangeChanged(range);
  if (range) {
    renderCaret();
  } else {
    clearPendingCaretRender();
    removeCaretElement();
  }
}

/**
 * Moves the caret to a collapsed range but defers its rendered geometry to
 * the next animation frame. The logical position updates synchronously (so
 * navigation and reveal logic stay consistent); only the measuring is
 * postponed. Used after a block re-render, where the caret's container was
 * just replaced and reading its rect forces a layout.
 */
export function scheduleCaret(range: Range | null): void {
  if (!range) {
    clearPendingNativeSelection();
  }
  activeRange = range;
  notifyCaretRangeChanged(range);
  if (range) {
    renderCaretDeferred();
  } else {
    clearPendingCaretRender();
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

/**
 * Records the current non-collapsed selection as a DOM range within the
 * editor. The formatting step reads it to map the selection to raw offsets.
 */
export function setSelectionRange(range: Range | null): void {
  selectionRange = range;
}

/** The current non-collapsed selection range, or null when none is active. */
export function getSelectionRange(): Range | null {
  return selectionRange;
}

/** Moves the caret to a new collapsed position and re-renders it. */
export function setCaretRange(range: Range | null): void {
  // Moving the caret collapses any pending selection highlight.
  clearPendingNativeSelection();
  // Moving the caret collapses an active selection, unless a native
  // selection is still live (e.g. a drag across a revealable that just
  // revealed its source) — the formatting step keeps that in sync.
  const nativeSelection = window.getSelection();
  if (!nativeSelection || nativeSelection.rangeCount === 0 || nativeSelection.getRangeAt(0).collapsed) {
    selectionRange = null;
  }
  showCaret(range);
}

function ensureListeners(): void {
  if (listenersAttached) {
    return;
  }
  listenersAttached = true;

  // Clicking outside the editable document clears the caret; clicks inside it
  // are resolved to a line edge by the editor.
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('.markdown-scroller')) {
      return;
    }
    // The titlebar holds the editor's own controls (formatting, table, the
    // window menu): reaching for them is not leaving the document, so the
    // caret stays where the author left it.
    if (target instanceof Element && target.closest('.titlebar')) {
      return;
    }
    hideCaret();
  });
}

ensureListeners();
