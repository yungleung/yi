/**
 * Turning a pointer position into a caret.
 *
 * Clicks that land on a markdown node are handled by the node itself, which
 * maps the pointer through the rendered text. Clicks that land on the margin
 * between two blocks, or on the space below the last line, have no node to map
 * through: they go to the nearest line edge, which is the line the reader is
 * pointing at.
 *
 * May import: the editing context and the caret's DOM helpers (`caret/dom.ts`).
 * Upholds: the caret is a document offset — this resolves a pointer to the
 * nearest line edge and hands that to `restoreCaret`, which maps it through the
 * offsets model.
 */

import { proseRoot, restoreCaret, type EditorContext } from './context';
import { firstTextNodeIn, lastTextNodeIn } from '../caret/dom';

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
  // An empty text node (a placeholder) has no box of its own: use the line it
  // sits on.
  const parent = node.parentElement?.getBoundingClientRect();
  return parent ? { top: parent.top, bottom: parent.bottom } : { top: rect.top, bottom: rect.bottom };
}

/**
 * Places the caret at the line edge nearest to a pointer position. Distances
 * are measured to the text, not to the block boxes: a block's box contains its
 * own margins, so neighbouring boxes touch and their edges cannot be told
 * apart.
 */
export function placeCaretFromPointer(context: EditorContext, clientY: number): boolean {
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
