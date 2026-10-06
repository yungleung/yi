/**
 * The lines a vertical move can step onto, and the point on one nearest a column.
 *
 * A block is one unit of layout, so "the line above" is a line *inside* some text node, not a
 * block: these helpers collect the visual line fragments of a window of blocks (one cheap layout
 * read per text node), let the browser hit-test a point, and walk the few boundaries around that
 * hit to keep the column the reader aimed at. They were the half of `navigation.ts` that is not
 * movement — nothing here moves a caret; `navigation.ts: moveVertically` decides what to do with
 * the answer.
 *
 * May import: the document-tree helpers (`./dom`). Upholds: one way to find the line a vertical
 * move lands on, so the two directions cannot disagree about where the lines are.
 */

import { collapsed, textNodesIn } from './dom';

/** One visual line fragment of a text node (a wrapped line or inline run). */
export interface LineFragment {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** One caret position inside the given blocks, by text and offset. */
export interface CaretPoint {
  top: number;
  bottom: number;
  left: number;
  text: Text;
  offset: number;
}

/**
 * The browser's point hit-test snaps to a glyph boundary, which can land a
 * character away from the requested column. Walk the nearby boundaries of the
 * hit on the same line and keep the one closest to the target column, matching
 * the previous nearest-column behavior.
 */
export function refineColumn(hit: Range, targetX: number, lineTop: number): Range {
  const container = hit.startContainer;
  if (container.nodeType !== Node.TEXT_NODE) {
    return hit;
  }
  const text = container as Text;
  let best = hit;
  let bestDistance = Math.abs(hit.getBoundingClientRect().left - targetX);
  for (let delta = -6; delta <= 6; delta += 1) {
    const offset = hit.startOffset + delta;
    if (offset < 0 || offset > text.data.length) {
      continue;
    }
    const candidate = collapsed(text, offset);
    const rect = candidate.getBoundingClientRect();
    // Skip boundaries that wrapped onto a neighbouring line.
    if (rect.height === 0 || Math.abs(rect.top - lineTop) >= 1) {
      continue;
    }
    const distance = Math.abs(rect.left - targetX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** Line fragments of the text nodes in the given blocks (KaTeX excluded). */
export function collectLineFragments(blocks: readonly HTMLElement[]): LineFragment[] {
  const fragments: LineFragment[] = [];
  for (const text of textNodesIn(blocks)) {
    if (text.parentElement?.closest('.katex')) {
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) {
      if (rect.height === 0) {
        continue;
      }
      fragments.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
    }
  }
  return fragments;
}

/** Caret positions inside the given blocks (excluding KaTeX-generated text). */
export function samplePoints(blocks: readonly HTMLElement[]): CaretPoint[] {
  const points: CaretPoint[] = [];
  for (const text of textNodesIn(blocks)) {
    // KaTeX renders math as generated markup whose text nodes are not
    // document text; vertical movement must never land inside it.
    if (text.parentElement?.closest('.katex')) {
      continue;
    }
    for (let offset = 0; offset <= text.data.length; offset += 1) {
      const rect = collapsed(text, offset).getBoundingClientRect();
      if (rect.height === 0) {
        continue;
      }
      points.push({ top: rect.top, bottom: rect.bottom, left: rect.left, text, offset });
    }
  }
  return points;
}

/** Picks the nearest line among sampled points, then the closest column. */
export function pickVerticalPoint(
  points: readonly CaretPoint[],
  direction: -1 | 1,
  current: { top: number; bottom: number },
  targetX: number
): Range | null {
  const candidates = points.filter((point) =>
    direction < 0 ? point.bottom < current.top - 0.5 : point.top > current.bottom + 0.5
  );
  if (candidates.length === 0) {
    return null;
  }

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
