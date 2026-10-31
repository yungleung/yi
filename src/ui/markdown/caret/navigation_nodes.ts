/**
 * Finds the small block window and the first/last caret-bearing node used by
 * arrow movement.
 *
 * Example: from a paragraph, the window is that block plus up to three
 * siblings in the requested direction; generated chrome is skipped.
 *
 * May import: the DOM leaf helpers. Upholds: arrow movement scans only nearby
 * blocks, and a navigable node is text or a void leaf rather than chrome.
 */

import { isVoidElement } from './dom';

/**
 * How many blocks around the caret are scanned for movement. The nearest line
 * in a direction always lives in the caret's own block or the immediately
 * following/preceding blocks.
 */
const NEIGHBOR_WINDOW = 3;

/** The caret's block plus nearby siblings, ordered in document direction. */
export function neighborBlocks(container: Node, direction: -1 | 1): HTMLElement[] {
  const current =
    container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : (container as Element);
  const block = current?.closest('.markdown-block') as HTMLElement | null;
  if (!block) {
    return [];
  }

  const blocks: HTMLElement[] = [block];
  let cursor: HTMLElement | null = block;
  for (let i = 0; i < NEIGHBOR_WINDOW; i += 1) {
    cursor =
      direction < 0
        ? (cursor.previousElementSibling as HTMLElement | null)
        : (cursor.nextElementSibling as HTMLElement | null);
    if (!cursor) {
      break;
    }
    blocks.push(cursor);
  }
  if (direction < 0) {
    blocks.reverse();
  }
  return blocks;
}

/** First caret-bearing content: text or a void leaf, never generated chrome. */
export function firstNavigableNodeIn(element: Element): Node | null {
  return navigableNodeIn(element, false);
}

/** Last caret-bearing content: text or a void leaf, never generated chrome. */
export function lastNavigableNodeIn(element: Element): Node | null {
  return navigableNodeIn(element, true);
}

function navigableNodeIn(node: Node, reverse: boolean): Node | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (element?.closest('[data-chrome]') ?? null) {
    return null;
  }
  if (node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && isVoidElement(node))) {
    return node;
  }
  const children = [...node.childNodes];
  if (reverse) {
    children.reverse();
  }
  for (const child of children) {
    const found = navigableNodeIn(child, reverse);
    if (found) {
      return found;
    }
  }
  return null;
}
