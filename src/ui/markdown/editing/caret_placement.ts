/**
 * Deciding, placing and preserving the editor's caret and selection.
 *
 * Example: after an edit changes a link's shape, this module shows the link's source, places the
 * caret at the same document offset, and restores the reader's previous scroll if it is visible.
 *
 * May import: caret scheduling, DOM offset mapping, source mode/ranges, selection helpers and the
 * editing-context port. Upholds: a caret is placed by document offset, never by a stale DOM node.
 */

import {
  getCaretRange,
  getSelectionRange,
  scheduleCaret,
  scheduleNativeSelection,
  setSelectionRange
} from '../caret/caret';
import { documentOffsetAt } from '../caret/offsets';
import { domPositionAtOffset } from '../caret/dom_position';
import { setShownRange, shownSourceHeld } from '../source_mode';
import { editorSelection, proseRoot } from './selection';
import type { EditMark } from '../document/history';
import type { EditorContext } from './context';
import { sourceRangeAt } from './source_range';

/**
 * The document offset of the active caret, or null when there is none.
 *
 * Example: a caret at the third document character returns `2`; an unmappable selection returns
 * null.
 */
export function caretOffset(context: EditorContext): number | null {
  const range = editorSelection(context, true);
  if (!range) {
    return null;
  }
  const start = documentOffsetAt(
    context.state,
    range.startContainer,
    range.startOffset,
    context.host.citations.renderedLength
  );
  return start ? start.offset : null;
}

/**
 * Shows the source belonging to `offset`, or no source for null.
 *
 * Example: moving the caret into a link rebuilds that block in link-source shape and places the
 * caret back at the same offset; entering plain prose removes any previously shown source. An
 * explicit `selecting` value lets history replay use the edit's restored mark rather than the
 * transient native focus state a context menu may have changed.
 */
export function showSourceAt(
  context: EditorContext,
  offset: number | null,
  selecting = getSelectionRange() !== null
): void {
  if (shownSourceHeld()) {
    return;
  }
  const range = offset === null ? null : sourceRangeAt(context.state, offset, selecting);
  if (!setShownRange(range)) {
    return;
  }
  context.renderer.renderChanged();
  if (offset !== null) {
    placeCaret(context, offset);
  }
}

/**
 * Puts the scroll position back after an edit when the caret remains visible there.
 *
 * Example: a line inserted above a visible caret keeps the old scroll; an edit that moves the
 * caret below the viewport leaves the browser's scroll in place so the caret is brought into view.
 */
export function keepScroll(context: EditorContext, anchor: number): void {
  const scroller = context.contentView;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (Math.abs(scroller.scrollTop - anchor) < 1) {
        return;
      }
      const caret = getCaretRange();
      const box = scroller.getBoundingClientRect();
      if (!caret || !caret.startContainer.isConnected) {
        scroller.scrollTop = anchor;
        return;
      }
      const caretInContent = caret.getBoundingClientRect().top - box.top + scroller.scrollTop;
      const viewportY = caretInContent - anchor + box.top;
      if (viewportY >= box.top + 8 && viewportY <= box.bottom - 24) {
        scroller.scrollTop = anchor;
      }
    });
  });
}

/**
 * Places the caret at a document offset inside the mounted rendered window.
 *
 * Example: `restoreCaret(context, 120)` puts the caret at offset 120 and reports false if that
 * offset's block is unmounted, allowing the caller to retry when the block returns.
 */
export function restoreCaret(context: EditorContext, offset: number, scroll = true): boolean {
  const clamped = context.state.nearestTextOffset(offset);
  showSourceAt(context, clamped);
  return placeCaret(context, clamped, scroll);
}

/**
 * Restores a caret or selection recorded by an edit.
 *
 * Example: `{ from: 4, to: 9 }` selects those five characters again so typing replaces them;
 * `{ from: 4, to: 4 }` restores a collapsed caret.
 */
export function restoreMark(context: EditorContext, mark: EditMark, scroll = true): boolean {
  if (mark.from === mark.to) {
    return restoreCaret(context, mark.from, scroll);
  }
  return (
    restoreSelection(context, mark.from, mark.to, scroll) ||
    restoreCaret(context, mark.to, scroll)
  );
}

/**
 * Selects a document range and anchors the caret at its end.
 *
 * Example: selecting `alpha` at `[0, 5)` leaves offset 5 as the active caret end while the
 * visible highlight is scheduled for the next frame.
 */
export function restoreSelection(
  context: EditorContext,
  from: number,
  to: number,
  scroll = true
): boolean {
  const root = proseRoot(context);
  if (!root) {
    return false;
  }
  const citations = context.host.citations.renderedLength;
  const start = domPositionAtOffset(context.state, root, from, citations);
  const end = domPositionAtOffset(context.state, root, to, citations);
  if (!start || !end) {
    return false;
  }
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const caret = document.createRange();
  caret.setStart(end.node, end.offset);
  caret.collapse(true);
  setSelectionRange(range);
  scheduleCaret(caret, scroll);
  scheduleNativeSelection(range);
  return true;
}

/**
 * Places the caret at a document offset without deciding which source belongs to it.
 *
 * Example: placing at offset 8 inside an unmounted block clears the DOM selection and returns
 * false rather than putting the caret on an unrelated block.
 */
export function placeCaret(context: EditorContext, offset: number, scroll = true): boolean {
  const root = proseRoot(context);
  if (!root) {
    setSelectionRange(null);
    window.getSelection()?.removeAllRanges();
    return false;
  }
  const clamped = context.state.nearestTextOffset(offset);
  const position = domPositionAtOffset(
    context.state,
    root,
    clamped,
    context.host.citations.renderedLength
  );
  if (!position) {
    setSelectionRange(null);
    window.getSelection()?.removeAllRanges();
    return false;
  }
  const caret = document.createRange();
  caret.setStart(position.node, position.offset);
  caret.collapse(true);
  setSelectionRange(null);
  window.getSelection()?.removeAllRanges();
  context.focusText();
  scheduleCaret(caret, scroll);
  return true;
}
