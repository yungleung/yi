/**
 * Holds mounted block elements, their content identities and bounded spare DOM.
 *
 * Example: a block that leaves the viewport is retained under its content key;
 * returning to the same source reuses the element instead of rebuilding KaTeX.
 *
 * May import: nothing. Upholds: mounted ownership and spare retention are one
 * cache concern, separate from viewport measurement and DOM reconciliation.
 */

/** A bounded cache of mounted and recently unmounted block elements. */
export class RendererBlockCache {
  private readonly builtFrom = new WeakMap<HTMLElement, string>();
  private readonly spare = new Map<string, HTMLElement>();
  private readonly mounted = new Map<number, HTMLElement>();

  /** The rendering identity an element was built from. */
  keyOf(element: HTMLElement): string | undefined {
    return this.builtFrom.get(element);
  }

  /** Records the rendering identity an element now represents. */
  markBuilt(element: HTMLElement, key: string): void {
    this.builtFrom.set(element, key);
  }

  /** The element mounted for a block's starting line. */
  mountedAt(lineStart: number): HTMLElement | undefined {
    return this.mounted.get(lineStart);
  }

  /** Associates one block's starting line with its mounted element. */
  mount(lineStart: number, element: HTMLElement): void {
    this.mounted.set(lineStart, element);
  }

  /** Stops tracking a mounted block. */
  unmount(lineStart: number): void {
    this.mounted.delete(lineStart);
  }

  /** Mounted entries in insertion order. */
  entries(): Array<[number, HTMLElement]> {
    return [...this.mounted.entries()];
  }

  /** Mounted elements in insertion order. */
  elements(): HTMLElement[] {
    return [...this.mounted.values()];
  }

  /**
   * Forgets every mounted block, optionally removing its DOM.
   *
   * Example: `clear(false)` follows removal of the prose root, while
   * `clear(true)` drops blocks that are still attached.
   */
  clear(removeElements: boolean): void {
    if (removeElements) {
      for (const element of this.mounted.values()) {
        element.remove();
      }
    }
    this.mounted.clear();
  }

  /** Takes a reusable element for this rendering identity, if one is retained. */
  takeSpare(key: string): HTMLElement | null {
    const element = this.spare.get(key);
    if (!element) {
      return null;
    }
    this.spare.delete(key);
    return element;
  }

  /**
   * Retains an element under its rendering identity, evicting the oldest beyond
   * the limit.
   *
   * Example: leaving a viewport retains one window's worth of heavy blocks;
   * a two-block window does not evict below `MIN_SPARE_ELEMENTS`.
   */
  keepSpare(
    element: HTMLElement,
    key: string | undefined,
    limit: number
  ): void {
    if (!key) {
      return;
    }
    this.spare.get(key)?.remove();
    this.spare.set(key, element);
    while (this.spare.size > limit) {
      const oldest = this.spare.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.spare.delete(oldest);
    }
  }

  /** Removes an element from the page and puts it in the spare cache. */
  release(
    element: HTMLElement,
    key: string | undefined,
    limit: number
  ): void {
    element.remove();
    this.keepSpare(element, key, limit);
  }

  /** Removes and forgets every spare element. */
  dropSpare(): void {
    for (const element of this.spare.values()) {
      element.remove();
    }
    this.spare.clear();
  }
}
