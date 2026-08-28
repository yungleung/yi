/**
 * Watches an editor container for content mutations (reveal swaps, lazy
 * rendering, ...) so callers can re-anchor layout-dependent state on the next
 * frame, coalescing bursts of mutations into a single callback.
 */

/**
 * Observes the subtree of `container` and invokes `onChange` after a batch of
 * child-list mutations. Returns an unsubscribe function.
 */
export function watchContentMutations(
  container: HTMLElement,
  onChange: () => void
): () => void {
  let frame: number | null = null;
  const observer = new MutationObserver(() => {
    if (frame !== null) {
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = null;
      onChange();
    });
  });
  observer.observe(container, { childList: true, subtree: true });
  return () => observer.disconnect();
}
