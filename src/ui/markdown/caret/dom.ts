/**
 * Shared DOM position utilities.
 *
 * These are pure document-tree helpers used by arrow navigation (finding the
 * nearest text/void node around a caret) and by revealable boundary detection
 * (finding the node adjacent to the caret). They have no editor dependencies.
 */

/**
 * A collapsed range anchored in a text node.
 *
 * The offset is clamped to the text: a caller that works in character offsets
 * over a *whole element* — a revealed source, whose highlighting splits it into
 * many text nodes — can hand a position past the end of the node it names, and
 * `setStart` throws for that rather than rounding. Clamping keeps the caret at
 * the nearest real position, which is what such a caller means anyway.
 */
export function collapsed(text: Text, offset: number): Range {
  const range = document.createRange();
  range.setStart(text, Math.max(0, Math.min(offset, text.data.length)));
  range.collapse(true);
  return range;
}

/** Text nodes inside the given blocks, in document order. */
export function textNodesIn(blocks: readonly HTMLElement[]): Text[] {
  const result: Text[] = [];
  for (const block of blocks) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      result.push(node as Text);
    }
  }
  return result;
}

/** The first text node inside `element`, or null. */
export function firstTextNodeIn(element: Element): Text | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode();
  return first ? (first as Text) : null;
}

/** The last text node inside `element`, or null. */
export function lastTextNodeIn(element: Element): Text | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    last = current as Text;
  }
  return last;
}

/** Whether `node` is a void leaf element (image, rule, break, ...). */
export function isVoidElement(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    ['IMG', 'HR', 'BR', 'INPUT', 'WBR'].includes((node as Element).tagName)
  );
}

export function withinBlocks(node: Node, blocks: readonly HTMLElement[]): boolean {
  return blocks.some((block) => block.contains(node));
}

/** The nearest node before `node` (in document order) that can hold a caret. */
export function previousPositionNode(node: Node, blocks: readonly HTMLElement[]): Node | null {
  let current: Node | null = node;
  while (current) {
    if (current.previousSibling) {
      const found = lastPositionableIn(current.previousSibling);
      if (found && withinBlocks(found, blocks)) {
        return found;
      }
    }
    current = current.parentNode;
  }
  return null;
}

/** The nearest node after `node` (in document order) that can hold a caret. */
export function nextPositionNode(node: Node, blocks: readonly HTMLElement[]): Node | null {
  let current: Node | null = node;
  while (current) {
    if (current.nextSibling) {
      const found = firstPositionableIn(current.nextSibling);
      if (found && withinBlocks(found, blocks)) {
        return found;
      }
    }
    current = current.parentNode;
  }
  return null;
}

/** The last text/void node inside `node`, or `node` itself when positionable. */
export function lastPositionableIn(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE || isVoidElement(node)) {
    return node;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
      const found = lastPositionableIn(node.childNodes[index]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** The first text/void node inside `node`, or `node` itself when positionable. */
export function firstPositionableIn(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE || isVoidElement(node)) {
    return node;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    for (let index = 0; index < node.childNodes.length; index += 1) {
      const found = firstPositionableIn(node.childNodes[index]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** The top of the line holding a caret position, or null when unresolvable. */
export function lineTopOf(node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const rect = collapsed(
      node as Text,
      Math.min(Math.max(0, offset), (node as Text).data.length)
    ).getBoundingClientRect();
    return rect.height > 0 ? rect.top : null;
  }
  const rect = (node as Element).getBoundingClientRect();
  return rect.height > 0 ? rect.top : null;
}

/** Whether two line tops are the same visual line. */
export function sameLineTop(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && Math.abs(a - b) < 1;
}

/** A collapsed range anchored before an element. */
export function rangeBefore(element: Element): Range {
  const range = document.createRange();
  range.setStartBefore(element);
  range.collapse(true);
  return range;
}

/** A collapsed range anchored after an element. */
export function rangeAfter(element: Element): Range {
  const range = document.createRange();
  range.setStartAfter(element);
  range.collapse(true);
  return range;
}

export function nextSiblingNode(node: Node): Node | null {
  let current: Node | null = node;
  while (current) {
    if (current.nextSibling) {
      return current.nextSibling;
    }
    current = current.parentNode;
  }
  return null;
}

export function previousSiblingNode(node: Node): Node | null {
  let current: Node | null = node;
  while (current) {
    if (current.previousSibling) {
      return current.previousSibling;
    }
    current = current.parentNode;
  }
  return null;
}

