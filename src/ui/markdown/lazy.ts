/**
 * Viewport-driven rendering for expensive markdown widgets.
 *
 * Math (KaTeX), citations (CSL) and wikilink titles are cheap to show as raw
 * placeholders but expensive to render. This module defers the real render
 * until the element approaches the viewport: an IntersectionObserver renders
 * it when scrolled near, and a fallback pass renders whatever is already near
 * the viewport shortly after registration (for environments where observer
 * callbacks are throttled or delayed).
 */

import { refreshCaretPosition } from './caret/caret';

const VIEWPORT_MARGIN = 600;
const FALLBACK_DELAY_MS = 250;

const pending = new Set<HTMLElement>();
const renders = new WeakMap<HTMLElement, () => void>();
let observer: IntersectionObserver | null = null;
let fallbackTimer: number | null = null;

/**
 * Calls `render()` once, the first time `element` approaches the viewport.
 * Elements already near the viewport are rendered by the fallback pass;
 * scrolled-into-view elements are rendered by the observer.
 */
export function onNearViewport(element: HTMLElement, render: () => void): void {
  if (element.dataset.lazyRendered === 'true') {
    return;
  }
  renders.set(element, render);
  pending.add(element);

  if (typeof IntersectionObserver !== 'undefined') {
    if (!observer) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              renderElement(entry.target as HTMLElement);
            }
          }
        },
        { rootMargin: `${VIEWPORT_MARGIN}px 0px` }
      );
    }
    observer.observe(element);
  }
  scheduleFallback();
}

function renderElement(element: HTMLElement): void {
  if (!pending.has(element)) {
    return;
  }
  pending.delete(element);
  observer?.unobserve(element);
  element.dataset.lazyRendered = 'true';
  renders.get(element)?.();
  // Lazy renders (KaTeX, formatted citations, ...) change the surrounding
  // layout; re-anchor the positioned caret to the active range.
  refreshCaretPosition();
}

function scheduleFallback(): void {
  if (fallbackTimer !== null) {
    return;
  }
  fallbackTimer = window.setTimeout(() => {
    fallbackTimer = null;
    for (const element of [...pending]) {
      if (!element.isConnected) {
        observer?.unobserve(element);
        pending.delete(element);
        continue;
      }
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      if (
        rect.height > 0 &&
        rect.top < viewportHeight + VIEWPORT_MARGIN &&
        rect.bottom > -VIEWPORT_MARGIN
      ) {
        renderElement(element);
      }
    }
  }, FALLBACK_DELAY_MS);
}
