/**
 * Public arrow-key caret navigation facade.
 *
 * Example: `moveCaret(root, 'right')` gets the active logical range, scans the
 * nearby block window, dispatches horizontal or vertical movement, and renders
 * the resulting range.
 *
 * May import: caret state, neighbor discovery and the horizontal/vertical
 * movement modules. Upholds: a failed move restores the existing caret, and
 * successful movement always lands on a real document position.
 */

import {
  getCaretRange,
  normalizeCaretDom,
  setCaretRange
} from './caret';
import { neighborBlocks } from './navigation_nodes';
import { moveHorizontally } from './navigation_horizontal';
import { moveVertically } from './navigation_vertical';

/** Caret movement directions — the one source of truth for direction literals. */
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
  normalizeCaretDom();

  const range = getCaretRange();
  if (!range || !root.contains(range.startContainer)) {
    return false;
  }

  const directionSign: -1 | 1 =
    direction === CaretDirections.up || direction === CaretDirections.left ? -1 : 1;
  const blocks = neighborBlocks(range.startContainer, directionSign);

  let next: Range | null = null;
  switch (direction) {
    case CaretDirections.left:
    case CaretDirections.right:
      next = moveHorizontally(range, directionSign, blocks);
      break;
    case CaretDirections.up:
    case CaretDirections.down:
      next = moveVertically(root, range, directionSign, blocks);
      break;
  }

  if (!next) {
    setCaretRange(range);
    return false;
  }

  setCaretRange(next);
  return true;
}
