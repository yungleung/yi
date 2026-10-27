/**
 * The DOM elements whose text stands in for a Markdown source view.
 *
 * A revealed node tags its exact source with `data-source-from`; a fenced block's
 * complete text uses `data-text-from` on `.markdown-source-text`. Both are literal editing
 * surfaces: the characters in them are the document's characters, one for one.
 *
 * May import: nothing. Upholds: the shape that makes a source editable has one selector,
 * so caret placement, rendering and typing cannot disagree about what counts as a source.
 */

export const SOURCE_TEXT_SELECTOR =
  '[data-source-from], .markdown-source-text[data-text-from]';

/** The source element containing `node`, or null when `node` is ordinary rendered text. */
export function sourceTextAt(node: Node | null): HTMLElement | null {
  if (node === null) {
    return null;
  }
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>(SOURCE_TEXT_SELECTOR) ?? null;
}

/** Whether a selection boundary is inside an exact source view. */
export function rangeInSourceText(range: Range): boolean {
  return sourceTextAt(range.startContainer) !== null;
}
