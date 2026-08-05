import { getCaretRange, setCaretRange } from './caret';

/**
 * Caret movement directions — the single source of truth for the direction
 * literals, so callers and the key mapping below never hard-code them.
 */
export const CaretDirections = {
  left: 'left',
  right: 'right',
  up: 'up',
  down: 'down'
} as const;

export type CaretDirection = (typeof CaretDirections)[keyof typeof CaretDirections];

/** Keyboard arrows → caret directions, kept next to the direction vocabulary. */
export const ARROW_KEY_DIRECTIONS: Readonly<Record<string, CaretDirection>> = {
  ArrowLeft: CaretDirections.left,
  ArrowRight: CaretDirections.right,
  ArrowUp: CaretDirections.up,
  ArrowDown: CaretDirections.down
};

/**
 * Moves the caret in the given direction within `root` and re-renders it.
 * Returns false when there is no active caret or it cannot move further.
 */
export function moveCaret(root: HTMLElement, direction: CaretDirection): boolean {
  const range = getCaretRange();
  if (!range || !root.contains(range.startContainer)) {
    return false;
  }

  let next: Range | null = null;
  switch (direction) {
    case CaretDirections.left:
      next = moveLeft(root, range);
      break;
    case CaretDirections.right:
      next = moveRight(root, range);
      break;
    case CaretDirections.up:
      next = moveVertically(root, range, -1);
      break;
    case CaretDirections.down:
      next = moveVertically(root, range, 1);
      break;
  }

  if (!next) {
    return false;
  }

  setCaretRange(next);
  return true;
}

function textNodes(root: HTMLElement): Text[] {
  const result: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    result.push(node as Text);
  }
  return result;
}

function collapsed(text: Text, offset: number): Range {
  const range = document.createRange();
  range.setStart(text, offset);
  range.collapse(true);
  return range;
}

function moveLeft(root: HTMLElement, range: Range): Range | null {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer as Text;
    if (range.startOffset > 0) {
      return collapsed(text, range.startOffset - 1);
    }
    return endOfPreviousText(root, text);
  }

  // Element-anchored (e.g. caret placed beside an image).
  const element = range.startContainer as Element;
  const before =
    range.startOffset > 0 ? element.childNodes[range.startOffset - 1] : null;
  if (before?.nodeType === Node.TEXT_NODE) {
    return collapsed(before as Text, (before as Text).data.length);
  }
  return endOfPreviousText(root, before ?? element);
}

function moveRight(root: HTMLElement, range: Range): Range | null {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer as Text;
    if (range.startOffset < text.data.length) {
      return collapsed(text, range.startOffset + 1);
    }
    return startOfNextText(root, text);
  }

  // Element-anchored (e.g. caret placed beside an image).
  const element = range.startContainer as Element;
  const offset = range.startOffset;
  const after = offset < element.childNodes.length ? element.childNodes[offset] : null;
  if (after?.nodeType === Node.TEXT_NODE) {
    return collapsed(after as Text, 0);
  }
  if (after) {
    return startOfNextText(root, after);
  }
  // At the element's end: continue from its last child so sibling text
  // nodes inside the element are not mistaken for following content.
  return startOfNextText(root, element.lastChild ?? element);
}

function endOfPreviousText(root: HTMLElement, node: Node): Range | null {
  const text = previousTextBefore(root, node);
  return text ? collapsed(text, text.data.length) : null;
}

function startOfNextText(root: HTMLElement, node: Node): Range | null {
  const text = nextTextAfter(root, node);
  return text ? collapsed(text, 0) : null;
}

function previousTextBefore(root: HTMLElement, node: Node): Text | null {
  const texts = textNodes(root);
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = texts[index];
    if (
      text !== node &&
      (text.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    ) {
      return text;
    }
  }
  return null;
}

function nextTextAfter(root: HTMLElement, node: Node): Text | null {
  const texts = textNodes(root);
  for (const text of texts) {
    if (
      text !== node &&
      (text.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
    ) {
      return text;
    }
  }
  return null;
}

function moveVertically(root: HTMLElement, range: Range, direction: -1 | 1): Range | null {
  const current = range.getBoundingClientRect();
  if (current.height === 0) {
    return null;
  }
  const targetX = current.left;

  interface CaretPoint {
    top: number;
    bottom: number;
    left: number;
    text: Text;
    offset: number;
  }

  // Sample every caret position in the document so lines can be found purely
  // by geometry (works across paragraphs, inline markup, code, math, ...).
  const points: CaretPoint[] = [];
  for (const text of textNodes(root)) {
    for (let offset = 0; offset <= text.data.length; offset += 1) {
      const rect = collapsed(text, offset).getBoundingClientRect();
      if (rect.height === 0) {
        continue;
      }
      points.push({ top: rect.top, bottom: rect.bottom, left: rect.left, text, offset });
    }
  }

  const candidates = points.filter((point) =>
    direction < 0 ? point.bottom < current.top - 0.5 : point.top > current.bottom + 0.5
  );
  if (candidates.length === 0) {
    return null;
  }

  // Pick the nearest line in that direction, then the position on it whose
  // column is closest to the caret's current column.
  const targetTop =
    direction < 0
      ? Math.max(...candidates.map((point) => point.top))
      : Math.min(...candidates.map((point) => point.top));
  const line = candidates.filter((point) => Math.abs(point.top - targetTop) < 1);

  let best = line[0];
  for (const point of line) {
    const distance = Math.abs(point.left - targetX);
    const bestDistance = Math.abs(best.left - targetX);
    if (distance < bestDistance || (distance === bestDistance && point.left > best.left)) {
      best = point;
    }
  }

  return collapsed(best.text, best.offset);
}
