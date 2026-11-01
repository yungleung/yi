/**
 * The caret: the logical range, and the span that renders it.
 *
 * The caret is a single absolutely-positioned span inside the editor's prose
 * root, anchored to the logical position (`activeRange`) of the caret. The
 * text itself is never split, so text shaping (ligatures, kerning pairs such
 * as "Ta"/"Te") stays identical with or without the caret, and the DOM never
 * accumulates fragments.
 *
 * May import: the rendered geometry (`geometry.ts`), the layout-mutation
 * watcher (`observer.ts`), the document-tree helpers (`dom.ts`). Upholds: the
 * logical range is the source of truth for arrow-key navigation and offset
 * mapping, the rendered span is derived from it, and the span is re-anchored
 * whenever the layout around it changes — a reveal swap, a lazy block, a
 * virtualised window swap.
 *
 * **The state is module-wide, and this module is its only owner.** Every `let`
 * below lives for the life of the window, because a window holds one editor,
 * and every caller — `navigation.ts`, `geometry.ts`, `offsets.ts`, the editing
 * commands — reaches the caret through the functions here rather than holding
 * it. What each one is:
 *
 * - `activeRange` — where the caret is. The truth; everything else follows it.
 * - `selectionRange` — the non-collapsed selection the browser is showing, kept
 *   in step by `selectionchange`; null when there is only a caret.
 * - `caretElement` — the span that draws `activeRange`, re-created on demand.
 * - `caretFrame`, `caretTimeout` — the pending deferred render (a frame, with a
 *   timer as the fallback for a window that is not painting).
 * - `pendingNativeSelection`, `selectionTimeout` — a native selection paint
 *   deferred the same way, because forcing it synchronously costs a frame on a
 *   large document.
 * - `caretRangeListeners`, `listenersAttached` — who is told when the range
 *   moves, and the one-time wiring of the click handler that hides the caret
 *   when the author reaches outside the editor.
 *
 * Navigation moves the logical range (`navigation.ts`); the geometry is read in
 * `geometry.ts`; the watcher that re-anchors the span after a layout change is
 * `observer.ts`.
 */

import { afterNewline, collapsed, nextPositionNode } from './dom';
import * as span from './span';
import { TEXT_FROM } from '../offset_tags';

let listenersAttached = false;
let activeRange: Range | null = null;
let selectionRange: Range | null = null;
let pendingNativeSelection: Range | null = null;
let selectionTimeout: number | null = null;
// The drawn span reads the range through this, on the frames after a rebuild.
span.setRangeSource(() => activeRange);

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

/**
 * Navigation hook. The positioned caret never interferes with text walking,
 * so nothing needs cleaning; keeping the element in place lets movement reuse
 * it (style-only updates) instead of mutating the DOM on every arrow.
 */
export function normalizeCaretDom(): void {
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
export function showCaret(range: Range | null, scroll = true): void {
  if (!range) {
    clearPendingNativeSelection();
  }
  activeRange = range === null ? null : onTheLineItNames(range);
  notifyCaretRangeChanged(activeRange);
  if (activeRange) {
    span.render(scroll);
  } else {
    span.hide();
  }
}

/**
 * Moves the caret to a collapsed range but defers its rendered geometry to
 * the next animation frame. The logical position updates synchronously (so
 * navigation and reveal logic stay consistent); only the measuring is
 * postponed. Used after a block re-render, where the caret's container was
 * just replaced and reading its rect forces a layout.
 */
export function scheduleCaret(range: Range | null, scroll = true): void {
  if (!range) {
    clearPendingNativeSelection();
  }
  activeRange = range === null ? null : onTheLineItNames(range);
  notifyCaretRangeChanged(activeRange);
  if (activeRange) {
    span.scheduleRender(scroll);
  } else {
    span.hide();
  }
}

/**
 * The position a caret lies on, when it was handed the end of a text node whose last character is a
 * newline.
 *
 * WebKit draws that position at the end of the line the newline closed, one space past its text —
 * measured in a fenced block's source view: stepping right onto the body's first line left the caret
 * a space past the opening fence, and stepping onto the closing fence left it a space past the last
 * line of code. The position belongs to the text the newline introduces (`dom_position.ts:
 * textNodeAtRenderedOffset` reads it that way when it restores a caret from an offset), and one
 * span's text is the document's own characters in order, so the next text node names the same
 * document offset while drawing on the line below.
 */
function onTheLineItNames(range: Range): Range {
  const container = range.startContainer;
  if (!range.collapsed || container.nodeType !== Node.TEXT_NODE) {
    return range;
  }
  const text = container as Text;
  if (!afterNewline(text, range.startOffset)) {
    return range;
  }
  const span = sourceSpanOf(text);
  const next = span === null ? null : nextPositionNode(text, [span]);
  return next !== null && next.nodeType === Node.TEXT_NODE ? collapsed(next as Text, 0) : range;
}

/**
 * The outermost element around `node` that the renderer tagged with the text it holds (see
 * `offsets.ts`), up to the block: the source a fenced block shows is one such element, and the body
 * inside it is another, so the outermost one is the text that continues past both.
 */
function sourceSpanOf(node: Node): HTMLElement | null {
  let span: HTMLElement | null = null;
  for (let element = node.parentElement; element !== null; element = element.parentElement) {
    if (element.hasAttribute(`data-${TEXT_FROM}`)) {
      span = element;
    }
    if (element.classList.contains('markdown-block')) {
      break;
    }
  }
  return span;
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

/**
 * Re-creates the drawn caret when a DOM swap dropped it, leaving the logical range untouched
 * (see `span.ts: ensureRendered`).
 */
export function ensureCaretRendered(): void {
  span.ensureRendered();
}

/**
 * Puts the blinking bar away without moving the caret: the logical range stays, and
 * `getCaretRange` still answers, so the edit a commit lands still knows where the
 * author was. What draws in its place is the word being composed
 * (`editing/composition/view.ts`) — underlined text a bar blinking underneath would
 * spoil — and the bar is placed again only by an edit, which is what a commit is.
 */
export function setCaretBarVisible(visible: boolean): void {
  span.setBarVisible(visible);
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
