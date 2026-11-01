/**
 * Turning a pointer position into a caret.
 *
 * Clicks that land on a markdown node are handled by the node itself, which
 * maps the pointer through the rendered text. Clicks that land on the margin
 * between two blocks, or on the space below the last line, have no node to map
 * through: they go to the nearest line edge, which is the line the reader is
 * pointing at.
 *
 * **A click that ends a drag belongs to the drag, not to the caret.** The
 * browser fires that click at the nearest common ancestor of where the press and
 * the release landed; across two blocks that ancestor is the page, which owns no
 * node, so this is exactly the spot that would otherwise place a caret — and
 * placing it clears the selection the drag just made (`context.ts: placeCaret`
 * drops the native ranges). A drag that ends on a node — a selection inside one
 * paragraph — never reaches here, which is why only the cross-block drag was
 * broken. So where the pointer went down is remembered, and a gesture that both
 * travelled past a few pixels and left the reader a selection asks for no caret;
 * a margin click that merely jittered a pixel or two still does.
 *
 * May import: the editing context and the caret (`caret/caret.ts`,
 * `caret/dom.ts`).
 * Upholds: the caret is a document offset — this resolves a pointer to the
 * nearest line edge and hands that to `restoreCaret`, which maps it through the
 * offsets model — and this module is the only owner of the one gesture fact it
 * needs to read.
 */

import { getSelectionRange } from '../caret/caret';
import { restoreCaret, type EditorContext } from './context';
import { proseRoot } from './selection';
import { firstTextNodeIn, lastTextNodeIn } from '../caret/dom';
import { lineBoxAround } from '../caret/geometry';

/**
 * How far the pointer may travel and still be a click rather than a drag. The tree's
 * rule takes a press that moves this far as a drag (`workspace/tree/drag.ts`); here the
 * distance is only half of it — see `endedADrag`.
 */
const DRAG_THRESHOLD = 4;

/** Where the pointer last went down, until the click it leads to reads it. */
let pressed: { x: number; y: number } | null = null;

/**
 * Remembers where the pointer goes down, so the click it leads to can be told from the
 * drag it may have ended. Capture, like every other pointer watcher on the editor
 * (`editing/composition_input.ts`), because a node may stop what it handles.
 *
 * A press is kept for one reason, and it is kept for one gesture: the click that ends a drag
 * is an ordinary click in every other way, so the distance the pointer travelled is the only
 * thing that can tell them apart. A gesture released where it went down travelled nowhere and
 * cannot have been a drag, so the press it left answers nothing — and *standing* it is not
 * harmless. A markdown node answers the click that lands on it and stops it (`click_routing.ts`),
 * so a press whose click a node took is never read by `endedADrag`; it lies in wait for the
 * next click that does reach the page, and refuses the caret to a click that merely happened
 * to arrive while something was selected.
 *
 * So the release, wherever the browser delivers it, is the end of the press: one that lands
 * within the click's own threshold is forgotten, and one that travelled is kept — it is
 * exactly the press a drag's click is read against. A cancelled gesture is forgotten too:
 * no click follows it, so there is nothing for the press to answer.
 */
export function watchPointerPresses(root: HTMLElement): void {
  root.addEventListener(
    'pointerdown',
    (event) => {
      pressed = { x: event.clientX, y: event.clientY };
    },
    true
  );
  document.addEventListener(
    'pointerup',
    (event) => {
      if (
        pressed &&
        Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DRAG_THRESHOLD
      ) {
        pressed = null;
      }
    },
    true
  );
  document.addEventListener('pointercancel', () => {
    pressed = null;
  }, true);
}

/**
 * Whether the gesture that arrived at this point was a drag the editor must leave alone.
 *
 * Both halves are needed. The distance is what the browser's click cannot tell us — the
 * click that ends a drag is an ordinary click in every other way — and the live selection
 * is what says the gesture really was a drag: a click the pointer merely jittered through
 * leaves nothing selected, and the caret it asks for is still placed.
 */
function endedADrag(clientX: number, clientY: number): boolean {
  const from = pressed;
  pressed = null;
  return (
    from !== null &&
    Math.hypot(clientX - from.x, clientY - from.y) >= DRAG_THRESHOLD &&
    getSelectionRange() !== null
  );
}

/** The top of a text node's first line, or the element's own top. */
function lineTop(node: Text | null, element: HTMLElement): number {
  return node ? edgeRect(node, 0).top : element.getBoundingClientRect().top;
}

/** The bottom of a text node's last line, or the element's own bottom. */
function lineBottom(node: Text | null, element: HTMLElement): number {
  return node ? edgeRect(node, node.data.length).bottom : element.getBoundingClientRect().bottom;
}

/** The line box a collapsed position at `offset` sits on. */
function edgeRect(node: Text, offset: number): { top: number; bottom: number } {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  if (rect.height > 0) {
    return { top: rect.top, bottom: rect.bottom };
  }
  // An empty text node (a placeholder) has no box of its own: use the line it sits on, which is
  // the nearest ancestor with a box (`caret/geometry.ts` — the caret's own drawing reads it the
  // same way).
  const line = lineBoxAround(node);
  if (line) {
    return { top: line.top, bottom: line.top + line.height };
  }
  const parent = node.parentElement?.getBoundingClientRect();
  return parent ? { top: parent.top, bottom: parent.bottom } : { top: rect.top, bottom: rect.bottom };
}

/**
 * Places the caret at the line edge nearest to the point a click arrived at.
 * Distances are measured to the text, not to the block boxes: a block's box
 * contains its own margins, so neighbouring boxes touch and their edges cannot
 * be told apart.
 *
 * A point that ends a drag is not a click, and asks for no caret — see the
 * header.
 */
export function placeCaretFromPointer(
  context: EditorContext,
  clientX: number,
  clientY: number
): boolean {
  if (endedADrag(clientX, clientY)) {
    return false;
  }
  const root = proseRoot(context);
  if (!root) {
    return false;
  }
  let nearest: { offset: number; distance: number } | null = null;
  for (const element of root.querySelectorAll<HTMLElement>('.markdown-block')) {
    const block = context.state.getBlockAtLine(Number(element.dataset.lineStart));
    if (!block) {
      continue;
    }
    const first = firstTextNodeIn(element);
    const last = lastTextNodeIn(element);
    const candidates = [
      { offset: block.charStart, distance: Math.abs(clientY - lineTop(first, element)) },
      { offset: block.charEnd, distance: Math.abs(clientY - lineBottom(last, element)) }
    ];
    for (const candidate of candidates) {
      if (!nearest || candidate.distance < nearest.distance) {
        nearest = candidate;
      }
    }
  }
  return nearest ? restoreCaret(context, nearest.offset) : false;
}
