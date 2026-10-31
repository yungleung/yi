/**
 * Up/down caret movement by line fragments and a browser hit-test.
 *
 * Example: moving down from a table finds the nearest line below, clamps the
 * old column into that line, and resolves the exact offset under the point.
 *
 * May import: caret geometry, line-hit helpers and the caret range hit-test.
 * Upholds: vertical movement uses nearby blocks first, with a whole-page
 * fallback only for layouts whose neighbor window has no text.
 */

import { caretRangeAtPoint } from './caret';
import { caretRect } from './geometry';
import {
  collectLineFragments,
  pickVerticalPoint,
  refineColumn,
  samplePoints
} from './line_hits';

export function moveVertically(
  root: HTMLElement,
  range: Range,
  direction: -1 | 1,
  blocks: readonly HTMLElement[]
): Range | null {
  const rect = caretRect(range);
  if (!rect || rect.height <= 0) {
    return null;
  }
  const current = { top: rect.top, bottom: rect.top + rect.height, left: rect.left };
  const targetX = current.left;

  let fragments = collectLineFragments(blocks);
  if (fragments.length === 0) {
    fragments = collectLineFragments([root]);
  }

  const candidates = fragments.filter((fragment) =>
    direction < 0 ? fragment.bottom < current.top - 0.5 : fragment.top > current.bottom + 0.5
  );
  if (candidates.length === 0) {
    return null;
  }

  const targetTop =
    direction < 0
      ? Math.max(...candidates.map((fragment) => fragment.top))
      : Math.min(...candidates.map((fragment) => fragment.top));
  const line = candidates.filter((fragment) => Math.abs(fragment.top - targetTop) < 1);
  const fragment =
    line.find((f) => targetX >= f.left - 1 && targetX <= f.right + 1) ?? line[0];

  const x = Math.min(Math.max(targetX, fragment.left), fragment.right);
  const y = (fragment.top + fragment.bottom) / 2;
  const hit = caretRangeAtPoint(x, y);
  if (hit && hit.startContainer.isConnected) {
    const hitText =
      hit.startContainer.nodeType === Node.TEXT_NODE ? (hit.startContainer as Text) : null;
    const onLine =
      hitText !== null &&
      root.contains(hitText) &&
      !hitText.parentElement?.closest('.katex') &&
      Math.abs(hit.getBoundingClientRect().top - fragment.top) <
        Math.max(2, fragment.bottom - fragment.top);
    if (onLine) {
      return refineColumn(hit, targetX, fragment.top);
    }
  }

  let points = samplePoints(blocks);
  if (points.length === 0) {
    points = samplePoints([root]);
  }
  return pickVerticalPoint(points, direction, current, targetX);
}
