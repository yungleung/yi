/**
 * The caret's drawn span: the element, where it is put, and when it is re-drawn.
 *
 * The caret's *range* is the truth and lives in `caret.ts`; this is what a reader sees of it — one
 * absolutely-positioned span inside the prose root, moved with a transform so placing it never
 * invalidates layout, and re-drawn on the frames after a block is rebuilt. The two halves were one
 * module until the drawing grew its own state (the element, the blink flag, the pending frame) and
 * its own reasons: this file is the drawing, and `caret.ts` is the position.
 *
 * The range is read through `setRangeSource` when a frame or a layout mutation runs — both happen
 * after the call that scheduled them — so the drawing never holds a range of its own.
 *
 * May import: the rendered geometry (`./geometry`) and the layout-mutation watcher (`./observer`).
 * Upholds: one drawn span for one caret, put where the range says and nowhere else.
 */

import { caretRect, proseHost } from './geometry';
import { watchContentMutations } from './observer';

/** How long a deferred render waits for a frame before drawing anyway (occluded windows). */
const FRAME_FALLBACK_MS = 120;

let caretElement: HTMLSpanElement | null = null;
let caretFrame: number | null = null;
let caretTimeout: number | null = null;
let stopWatchingLayout: (() => void) | null = null;
/** Whether the blinking bar is drawn — false while a composition draws its own word. */
let caretBarVisible = true;
/** The range to draw, asked for when a frame or a layout mutation needs it. */
let rangeOf: () => Range | null = () => null;

/** Wires the drawing to the range it draws (see `caret.ts`, the range's owner). */
export function setRangeSource(source: () => Range | null): void {
  rangeOf = source;
}

function createCaretElement(): HTMLSpanElement {
  const caret = document.createElement('span');
  caret.className = 'markdown-caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.classList.toggle('markdown-caret-away', !caretBarVisible);
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

/** Positions the caret span for the range this is wired to. */
export function render(scroll: boolean): void {
  renderNow(scroll);
}

/**
 * Positions the caret on the next animation frame, coalescing consecutive
 * requests. Used right after a DOM mutation (a block re-render) where
 * measuring immediately would force a full layout; the caller returns before
 * the expensive geometry is computed. A timer fallback guarantees the caret
 * still renders when animation frames are throttled (occluded/backgrounded
 * windows), since a missing caret is worse than a slightly later one.
 */
export function scheduleRender(scroll: boolean): void {
  if (caretFrame !== null) {
    return;
  }
  caretFrame = requestAnimationFrame(() => {
    caretFrame = null;
    if (caretTimeout !== null) {
      clearTimeout(caretTimeout);
      caretTimeout = null;
    }
    // This frame's measurement can be stale — an edit can insert a block that
    // layout has not placed yet, a `content-visibility: auto` block can still
    // be skipped — so the caret is neither trusted nor scrolled from it. One
    // more frame re-anchors it, and scrolls, against the settled layout;
    // scrolling from the stale measurement moved the page when the caret had
    // not moved at all.
    renderNow(false);
    requestAnimationFrame(() => {
      reposition();
      // `scroll` is the difference between a caret that *moved* and one that was put back
      // where it already was: a move brings the caret into view, a window change must not
      // move the page (measured: scrolling up from the end of the demo document, the view
      // jumped 1097px to a caret that had not moved at all).
      if (caretElement && scroll) {
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
    renderNow(scroll);
  }, FRAME_FALLBACK_MS);
}

/** Cancels a pending deferred caret render. */
export function clearPendingRender(): void {
  if (caretFrame !== null) {
    cancelAnimationFrame(caretFrame);
    caretFrame = null;
  }
  if (caretTimeout !== null) {
    clearTimeout(caretTimeout);
    caretTimeout = null;
  }
}

function renderNow(scroll = true): void {
  const range = rangeOf();
  if (!range) {
    removeCaretElement();
    return;
  }

  const container = range.startContainer;
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
  const rect = caretRect(range);
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
 * Re-anchors the rendered caret to the current range without touching the DOM
 * tree (style only). Used after layout shifts such as reveal swaps and lazy
 * rendering, whose mutations would otherwise leave the caret misplaced.
 */
export function reposition(): void {
  const range = rangeOf();
  if (!caretElement || !range || !range.startContainer.isConnected) {
    removeCaretElement();
    return;
  }
  const host = proseHost(range.startContainer);
  if (!host || caretElement.parentElement !== host) {
    removeCaretElement();
    return;
  }
  const rect = caretRect(range);
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
export function ensureRendered(): void {
  if (rangeOf() && (!caretElement || !caretElement.isConnected)) {
    // Called from the renderer's swap hook, where the DOM is mid-reconcile:
    // the caret span has to come back, but scrolling from a measurement taken
    // here moved the page to a position the caret never occupied. The deferred
    // pass scrolls once the layout has settled.
    renderNow(false);
  }
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
  stopWatchingLayout = watchContentMutations(scroller, () => reposition());
}

/**
 * Keeps the caret inside its scroll container: when the caret is rendered
 * (or moved with arrows) past the visible edge, scroll the editor so the
 * caret stays in view instead of drifting out to the status bar area.
 */
function scrollCaretIntoView(caret: HTMLElement): void {
  const scroller = caret.closest('.overflow-auto') as HTMLElement | null;
  const caretBox = caret.getBoundingClientRect();
  if (scroller) {
    const scrollerRect = scroller.getBoundingClientRect();
    const margin = 8;
    if (caretBox.top < scrollerRect.top + margin) {
      scroller.scrollTop += caretBox.top - scrollerRect.top - margin;
    } else if (caretBox.bottom > scrollerRect.bottom - margin) {
      scroller.scrollTop += caretBox.bottom - scrollerRect.bottom + margin;
    }
  }
  scrollCaretHorizontallyIntoView(caret, rangeOf()?.startContainer ?? null);
}

/**
 * Brings a caret in a wide source line back into its own box.
 *
 * A block showing highlighted source is rebuilt after each keystroke, which replaces the `pre`
 * and resets its horizontal scroll. A caret restored near the end of a long fence line then sits
 * outside the visible box even though the page's vertical scroll is already right. The range,
 * rather than the caret span, names the source box: the span is positioned beside the prose host
 * so that it can draw across the page.
 */
function scrollCaretHorizontallyIntoView(caret: HTMLElement, container: Node | null): void {
  const source = horizontalSourceAround(container);
  if (source === null) {
    return;
  }
  const caretBox = caret.getBoundingClientRect();
  const sourceBox = source.getBoundingClientRect();
  const margin = 8;
  let moved = false;
  if (caretBox.left < sourceBox.left + margin) {
    source.scrollLeft += caretBox.left - sourceBox.left - margin;
    moved = true;
  } else if (caretBox.left > sourceBox.right - margin) {
    source.scrollLeft += caretBox.left - sourceBox.right + margin;
    moved = true;
  }
  if (moved) {
    // The caret span is positioned beside the prose host, not inside the source box, so moving
    // the box's scroll leaves the span at its old page coordinate until it reads the range again.
    reposition();
  }
}

/** The highlighted source box around a caret, when its text is wider than that box. */
function horizontalSourceAround(container: Node | null): HTMLElement | null {
  const start = container instanceof Element ? container : container?.parentElement;
  const source = start?.closest<HTMLElement>('.markdown-source-text') ?? null;
  if (source === null) {
    return null;
  }
  const overflow = getComputedStyle(source).overflowX;
  return (overflow === 'auto' || overflow === 'scroll') && source.scrollWidth > source.clientWidth
    ? source
    : null;
}

/** Takes the span away, cancelling whatever was pending for it. */
export function hide(): void {
  clearPendingRender();
  removeCaretElement();
}

/** Whether the blinking bar is drawn (a composed word draws its own underline instead). */
export function setBarVisible(visible: boolean): void {
  caretBarVisible = visible;
  caretElement?.classList.toggle('markdown-caret-away', !visible);
}
