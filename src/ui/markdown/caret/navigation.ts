/**
 * Arrow-key caret movement.
 *
 * Movement reads and updates the logical caret range (see `caret.ts`). It
 * only scans the caret's neighbouring blocks (a small window) so large
 * documents stay fast, and it reuses the caret's own geometry (`geometry.ts`)
 * and the document-position helpers in `dom.ts`.
 *
 * May import: the caret itself (`caret.ts`), its geometry (`geometry.ts`), the
 * document-tree helpers (`dom.ts`) and the offsets model (`offsets.ts`). Upholds:
 * arrow keys move the logical range, and every position they land on is a real
 * document offset — never a rendered pixel that happens to be next door.
 */

import {
  caretRangeAtPoint,
  getCaretRange,
  normalizeCaretDom,
  setCaretRange
} from './caret';
import { caretRect } from './geometry';
import {
  afterNewline,
  collapsed,
  firstTextNodeIn,
  isVoidElement,
  lastTextNodeIn,
  lineTopOf,
  nextPositionNode,
  previousPositionNode,
  rangeAfter,
  rangeBefore,
  sameLineTop,
  textNodesIn
} from './dom';

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
 * How many blocks around the caret are scanned for movement. The nearest line
 * in a direction always lives in the caret's own block or the immediately
 * following/preceding blocks, so a small window covers normal movement while
 * keeping arrow keys fast on large documents (a full-document scan samples
 * every character offset's geometry).
 */
const NEIGHBOR_WINDOW = 3;

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
      next = moveLeft(range, blocks);
      break;
    case CaretDirections.right:
      next = moveRight(range, blocks);
      break;
    case CaretDirections.up:
      next = moveVertically(root, range, -1, blocks);
      break;
    case CaretDirections.down:
      next = moveVertically(root, range, 1, blocks);
      break;
  }

  if (!next) {
    // A failed move must not leave the caret unrendered; re-render it at the
    // current position.
    setCaretRange(range);
    return false;
  }

  setCaretRange(next);
  return true;
}

/**
 * The block containing `container` plus up to {@link NEIGHBOR_WINDOW} sibling
 * blocks in `direction`, so movement only scans nearby content.
 */
function neighborBlocks(container: Node, direction: -1 | 1): HTMLElement[] {
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
      direction < 0 ? (cursor.previousElementSibling as HTMLElement | null) : (cursor.nextElementSibling as HTMLElement | null);
    if (!cursor) {
      break;
    }
    blocks.push(cursor);
  }
  if (direction < 0) {
    // The text-node searches rely on document order: put the preceding
    // blocks before the current one instead of the walk order.
    blocks.reverse();
  }
  return blocks;
}

interface CaretPoint {
  top: number;
  bottom: number;
  left: number;
  text: Text;
  offset: number;
}

/** One visual line fragment of a text node (a wrapped line or inline run). */
interface LineFragment {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function moveLeft(range: Range, blocks: readonly HTMLElement[]): Range | null {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer as Text;
    if (range.startOffset > 0) {
      return collapsed(text, range.startOffset - 1);
    }
    return endOfPreviousText(text, 0, blocks);
  }

  // Element-anchored (e.g. caret placed beside an image).
  const element = range.startContainer as Element;
  const before =
    range.startOffset > 0 ? element.childNodes[range.startOffset - 1] : null;
  if (before?.nodeType === Node.TEXT_NODE) {
    return collapsed(before as Text, Math.max(0, (before as Text).data.length - 1));
  }
  if (before?.nodeType === Node.ELEMENT_NODE) {
    // The neighbour can hold text (e.g. a revealed source span): step into
    // its content end instead of skipping over the whole element.
    const lastText = lastTextNodeIn(before as Element);
    if (lastText) {
      return collapsed(
        lastText,
        sourceRightEntryOffset(revealedSourceRange(lastText), lastText.data.length)
      );
    }
  }
  return endOfPreviousText(before ?? element, 0, blocks);
}

function moveRight(range: Range, blocks: readonly HTMLElement[]): Range | null {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer as Text;
    if (range.startOffset < text.data.length) {
      return collapsed(text, range.startOffset + 1);
    }
    return startOfNextText(text, text.data.length, blocks);
  }

  // Element-anchored (e.g. caret placed beside an image).
  const element = range.startContainer as Element;
  const offset = range.startOffset;
  const after = offset < element.childNodes.length ? element.childNodes[offset] : null;
  if (after?.nodeType === Node.TEXT_NODE) {
    return collapsed(after as Text, Math.min(1, (after as Text).data.length));
  }
  if (after?.nodeType === Node.ELEMENT_NODE) {
    // The neighbour can hold text (e.g. a revealed source span): step into
    // its content start instead of skipping over the whole element.
    const firstText = firstTextNodeIn(after as Element);
    if (firstText) {
      return collapsed(
        firstText,
        sourceLeftEntryOffset(revealedSourceRange(firstText), firstText.data.length)
      );
    }
  }
  if (after) {
    return startOfNextText(after, 0, blocks);
  }
  // At the element's end: continue from its last child so sibling text
  // nodes inside the element are not mistaken for following content.
  return startOfNextText(element.lastChild ?? element, 0, blocks);
}

/**
 * The identifier content range of a revealed source span (see
 * `revealable_node.ts`), or null when `text` is not inside one. Boundary
 * movement uses it to enter the source at the content boundary instead of on
 * a raw marker (`[[target]]` → `target`, `[title](url)` → `title`, ...).
 */
function revealedSourceRange(text: Text): { start: number; end: number } | null {
  const span = text.parentElement?.closest('[data-content-start]') as HTMLElement | null;
  if (!span) {
    return null;
  }
  const start = Number(span.dataset.contentStart);
  const end = Number(span.dataset.contentEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return { start, end };
}

/**
 * The caret offset when entering a revealed source from its left side: the
 * content start (skipping the opening markers), or one character in when the
 * whole source is the content (thematic break, break) so the caret still
 * makes visible progress.
 */
function sourceLeftEntryOffset(
  range: { start: number; end: number } | null,
  length: number
): number {
  if (range && range.start > 0) {
    return range.start;
  }
  return Math.min(1, length);
}

/**
 * The caret offset when entering a revealed source from its right side: the
 * content end (skipping the closing marker). When only an opening marker
 * exists (e.g. a narrative `@key` citation) the content runs to the source
 * end; when the whole source is the content (thematic break, break) step one
 * character in from the end so the caret still makes visible progress.
 */
function sourceRightEntryOffset(
  range: { start: number; end: number } | null,
  length: number
): number {
  if (range && (range.end < length || range.start > 0)) {
    return range.end;
  }
  return Math.max(0, length - 1);
}

/**
 * Steps the caret left from the boundary of `node` (at `offset`). The
 * previous caret position is the nearest preceding text node or void leaf
 * (image, rule, ...) within the neighbor blocks.
 */
function endOfPreviousText(
  node: Node,
  offset: number,
  blocks: readonly HTMLElement[]
): Range | null {
  // Beside a void element, the previous position is its other side.
  if (node.nodeType === Node.ELEMENT_NODE && isVoidElement(node)) {
    return rangeBefore(node as Element);
  }
  const previous = previousPositionNode(node, blocks);
  if (!previous) {
    return null;
  }
  const currentTop = lineTopOf(node, offset);
  if (previous.nodeType === Node.TEXT_NODE) {
    const text = previous as Text;
    // The boundary between two inline runs is zero-width only on the same
    // line; across lines, land at the previous node's real end — and a node whose last character
    // is a newline ends the line *before* it, so stepping back onto that line is one character in
    // from the node's end (`dom.ts: afterNewline`; the position at the end itself is the line the
    // caret is already on).
    const end = text.data.length;
    const sameLine = sameLineTop(currentTop, lineTopOf(text, end));
    if (sameLine) {
      return collapsed(text, sourceRightEntryOffset(revealedSourceRange(text), end));
    }
    return collapsed(text, afterNewline(text, end) ? end - 1 : end);
  }
  const rect = (previous as Element).getBoundingClientRect();
  const sameLine = sameLineTop(currentTop, rect.height > 0 ? rect.top : null);
  return sameLine ? rangeBefore(previous as Element) : rangeAfter(previous as Element);
}

/**
 * Steps the caret right from the boundary of `node` (at `offset`). The next
 * caret position is the nearest following text node or void leaf within the
 * neighbor blocks.
 */
function startOfNextText(
  node: Node,
  offset: number,
  blocks: readonly HTMLElement[]
): Range | null {
  if (node.nodeType === Node.ELEMENT_NODE && isVoidElement(node)) {
    return rangeAfter(node as Element);
  }
  const next = nextPositionNode(node, blocks);
  if (!next) {
    return null;
  }
  const currentTop = lineTopOf(node, offset);
  if (next.nodeType === Node.TEXT_NODE) {
    const text = next as Text;
    const sameLine = sameLineTop(currentTop, lineTopOf(text, 0));
    return collapsed(
      text,
      sameLine
        ? sourceLeftEntryOffset(revealedSourceRange(text), text.data.length)
        : 0
    );
  }
  const rect = (next as Element).getBoundingClientRect();
  const sameLine = sameLineTop(currentTop, rect.height > 0 ? rect.top : null);
  return sameLine ? rangeAfter(next as Element) : rangeBefore(next as Element);
}

function moveVertically(
  root: HTMLElement,
  range: Range,
  direction: -1 | 1,
  blocks: readonly HTMLElement[]
): Range | null {
  // The collapsed range rect is degenerate for element-anchored carets
  // (beside an image/rule/break); use the same boundary-anchored geometry the
  // caret is rendered with so vertical movement never traps at those nodes.
  const rect = caretRect(range);
  if (!rect || rect.height <= 0) {
    return null;
  }
  const current = { top: rect.top, bottom: rect.top + rect.height, left: rect.left };
  const targetX = current.left;

  // Find the nearest line in the direction using per-line fragments (one
  // cheap layout call per text node) instead of sampling every character
  // offset, then resolve the target column with a single hit-test.
  let fragments = collectLineFragments(blocks);
  if (fragments.length === 0) {
    // The neighbor window has no text (e.g. only image/rule blocks around);
    // scan the whole document to preserve the old behavior in rare layouts.
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

  // Clamp the column to the target line, then ask the browser for the caret
  // position under that point.
  const x = Math.min(Math.max(targetX, fragment.left), fragment.right);
  const y = (fragment.top + fragment.bottom) / 2;
  const hit = caretRangeAtPoint(x, y);
  if (hit && hit.startContainer.isConnected) {
    const hitText =
      hit.startContainer.nodeType === Node.TEXT_NODE ? (hit.startContainer as Text) : null;
    const onLine =
      hitText !== null &&
      // The hit must stay inside the editor: a point near the bottom edge can
      // resolve into the status bar (e.g. the words-count label) that sits
      // below the scroll container inside the window.
      root.contains(hitText) &&
      !hitText.parentElement?.closest('.katex') &&
      Math.abs(hit.getBoundingClientRect().top - fragment.top) <
        Math.max(2, fragment.bottom - fragment.top);
    if (onLine) {
      return refineColumn(hit, targetX, fragment.top);
    }
  }

  // Fallback: dense per-offset sampling of the neighbor blocks (the previous
  // strategy), widening to the whole document when the window has no text.
  let points = samplePoints(blocks);
  if (points.length === 0) {
    points = samplePoints([root]);
  }
  return pickVerticalPoint(points, direction, current, targetX);
}

/**
 * The browser's point hit-test snaps to a glyph boundary, which can land a
 * character away from the requested column. Walk the nearby boundaries of the
 * hit on the same line and keep the one closest to the target column, matching
 * the previous nearest-column behavior.
 */
function refineColumn(hit: Range, targetX: number, lineTop: number): Range {
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
function collectLineFragments(blocks: readonly HTMLElement[]): LineFragment[] {
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
function samplePoints(blocks: readonly HTMLElement[]): CaretPoint[] {
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
function pickVerticalPoint(
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
