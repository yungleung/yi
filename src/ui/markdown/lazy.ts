/**
 * Viewport-driven rendering for expensive markdown widgets.
 *
 * Math (KaTeX), citations (CSL) and wikilink titles are cheap to show as raw
 * placeholders but expensive to render. This module defers the real render
 * until the element approaches the viewport. A timer fallback supports
 * environments without IntersectionObserver.
 *
 * May import: the DOM and nothing of the editor. Upholds: rendering is deferred
 * but never decided here — the callback a widget registers is its own, so this
 * module can decide *when* a widget renders and never *what* it renders.
 */

const VIEWPORT_MARGIN = 600;
const FALLBACK_DELAY_MS = 250;

const pending = new Set<HTMLElement>();
const renders = new WeakMap<HTMLElement, () => void>();
let observer: IntersectionObserver | null = null;
let fallbackTimer: number | null = null;
let observeQueued = false;

/**
 * Calls `render()` once, the first time `element` approaches the viewport.
 * Elements are rendered by the observer, or by the fallback timer when the
 * browser does not provide IntersectionObserver.
 */
export function onNearViewport(element: HTMLElement, render: () => void): void {
  if (element.dataset.lazyRendered === 'true') {
    return;
  }
  renders.set(element, render);
  pending.add(element);

  if (typeof IntersectionObserver !== 'undefined') {
    queueObservation(element);
    return;
  }
  scheduleFallback();
}

function queueObservation(element: HTMLElement): void {
  if (observer) {
    observer.observe(element);
    return;
  }
  if (!observeQueued) {
    observeQueued = true;
    queueMicrotask(() => {
      observeQueued = false;
      if (!observer) {
        const scrollRoot = element.closest('.overflow-auto');
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                renderElement(entry.target as HTMLElement);
              }
            }
          },
          { root: scrollRoot, rootMargin: `${VIEWPORT_MARGIN}px 0px` }
        );
      }
      for (const pendingElement of pending) {
        observer.observe(pendingElement);
      }
    });
  }
}

function renderElement(element: HTMLElement): void {
  if (!pending.has(element)) {
    return;
  }
  pending.delete(element);
  observer?.unobserve(element);
  element.dataset.lazyRendered = 'true';
  renders.get(element)?.();
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
