/**
 * Pure geometry helpers for the caret: where a caret position sits on screen
 * and how to estimate a line's height. These have no dependencies on the
 * editor, so both the caret renderer and arrow navigation share them.
 *
 * May import: nothing but the DOM. Upholds: a caret's rendered position is
 * derived from its range — this module measures that range and holds no state,
 * so the same range always measures the same way.
 */

/**
 * The viewport rectangle of a caret position: the collapsed range rect for
 * text, or the boundary child's edge for element-anchored ranges (beside an
 * image/rule/break, or a revealed source span). Returns null when no usable
 * geometry exists.
 */
export function caretRect(range: Range): { left: number; top: number; height: number } | null {
  const container = range.startContainer;
  if (container.nodeType === Node.TEXT_NODE) {
    const rect = range.getBoundingClientRect();
    if (rect.height > 0) {
      return { left: rect.left, top: rect.top, height: rect.height };
    }
    // Degenerate collapsed rect (rare): anchor at the text node's own box.
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(container);
    const box = nodeRange.getBoundingClientRect();
    return {
      left: rect.left || box.left,
      top: box.top,
      height: box.height || estimateLineHeight(container)
    };
  }

  // Element container: the caret can sit on a child boundary (beside an
  // image/rule/break, or a revealed source span). Anchor at that child's edge
  // so the caret sits at the node's real start/end instead of the container's
  // left edge.
  const element = container as Element;
  const offset = Math.min(Math.max(0, range.startOffset), element.childNodes.length);
  const after = offset < element.childNodes.length ? element.childNodes[offset] : null;
  const before = offset > 0 ? element.childNodes[offset - 1] : null;
  if (after?.nodeType === Node.ELEMENT_NODE) {
    const childRect = (after as Element).getBoundingClientRect();
    if (childRect.height > 0) {
      return { left: childRect.left, top: childRect.top, height: childRect.height };
    }
  }
  if (before?.nodeType === Node.ELEMENT_NODE) {
    const childRect = (before as Element).getBoundingClientRect();
    if (childRect.height > 0) {
      return { left: childRect.right, top: childRect.top, height: childRect.height };
    }
  }

  // Empty container: anchor at the element's content box.
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padTop = parseFloat(style.paddingTop) || 0;
  return {
    left: box.left + padLeft,
    top: box.top + padTop,
    height: box.height > 0 ? box.height : estimateLineHeight(element)
  };
}

/** The computed line height around a node, with a sane default. */
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

/** The editor's prose root (positioning host) for a node, or null. */
export function proseHost(node: Node): HTMLElement | null {
  return (node.nodeType === Node.TEXT_NODE
    ? node.parentElement
    : (node as Element)
  )?.closest('.prose') as HTMLElement | null;
}
