/**
 * Shared plumbing for the editor's editing commands.
 *
 * Every command (clipboard, typing, find/replace, formatting) needs the same
 * three things: the document state, the block renderer and the scroll
 * container that hosts the prose root. Passing that context explicitly keeps
 * the commands free of editor internals and lets them live in their own
 * modules. The helpers here also centralise range→offset mapping, so any
 * command works the same whether its range is a text selection, a boundary
 * inside a block, or a Select-All range anchored to the prose root.
 */

import { getCaretRange, scheduleCaret, setSelectionRange } from '../caret/caret';
import { documentOffsetAt, domPositionAtOffset } from '../position';
import {
  resumeEditingSourceIn,
  setEditingSourceCaret,
  setRestoringCaretOffset,
  shiftEditingSource
} from '../nodes/revealable_node';
import type { MarkdownEditorState } from '../state';
import type { VirtualBlockRenderer } from '../virtual_block_renderer';

/** What every editing command needs to read and change the document. */
export interface EditorContext {
  readonly state: MarkdownEditorState;
  readonly renderer: VirtualBlockRenderer;
  readonly contentView: HTMLElement;
}

/** The rendered prose root, or null while the editor is not mounted. */
export function proseRoot(context: EditorContext): HTMLElement | null {
  return context.contentView.querySelector('.prose');
}

/**
 * The range an edit acts on: the browser selection when it is inside the
 * editor, otherwise (for caret-only commands) the logical caret. A collapsed
 * native selection is ignored because the editor hides it while its own caret
 * is shown.
 */
export function editorSelection(context: EditorContext, allowCollapsed: boolean): Range | null {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (
      context.contentView.contains(range.commonAncestorContainer) &&
      (allowCollapsed || !range.collapsed)
    ) {
      return range;
    }
  }
  if (allowCollapsed) {
    const caret = getCaretRange();
    if (caret && context.contentView.contains(caret.commonAncestorContainer)) {
      return caret;
    }
  }
  return null;
}

/**
 * The document offsets a DOM range covers, or null when it cannot be mapped.
 *
 * Boundaries that are not text positions (Select All anchors to the prose
 * root, a drag can anchor to a block element) are resolved to the first/last
 * document offset of the block they touch, so a multi-block selection maps to
 * exactly the blocks it spans instead of collapsing to the whole document.
 */
export function rangeOffsets(
  context: EditorContext,
  range: Range
): { from: number; to: number } | null {
  const start = boundaryOffset(context, range.startContainer, range.startOffset, 'start');
  const end = boundaryOffset(context, range.endContainer, range.endOffset, 'end');
  if (start === null || end === null) {
    return null;
  }
  return { from: Math.min(start, end), to: Math.max(start, end) };
}

/** The document offset of one range boundary. */
function boundaryOffset(
  context: EditorContext,
  container: Node,
  offset: number,
  side: 'start' | 'end'
): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const location = documentOffsetAt(context.state, container, offset);
    return location ? location.offset : null;
  }
  const root = proseRoot(context);
  const element = container as Element;
  if (!root || element === root || !root.contains(element)) {
    return rootBoundaryOffset(context, root, offset, side);
  }
  return blockEdgeOffset(context, element, side);
}

/** A boundary anchored to the prose root: resolve it against its child blocks. */
function rootBoundaryOffset(
  context: EditorContext,
  root: HTMLElement | null,
  offset: number,
  side: 'start' | 'end'
): number | null {
  if (!root) {
    return null;
  }
  const children = [...root.children];
  const documentLength = context.state.getText().length;
  if (side === 'start') {
    // A boundary before the first child means "from the document start" —
    // this is what Select All produces, including the blocks that are not
    // mounted at the moment.
    if (offset <= 0) {
      return 0;
    }
    for (let index = Math.min(offset, children.length - 1); index < children.length; index += 1) {
      const block = blockWithin(children[index]);
      if (block) {
        return blockEdgeOffset(context, block, 'start');
      }
    }
    return documentLength;
  }
  // Likewise, a boundary past the last child means "to the document end".
  if (offset >= children.length) {
    return documentLength;
  }
  for (let index = offset - 1; index >= 0; index -= 1) {
    const block = blockWithin(children[index]);
    if (block) {
      return blockEdgeOffset(context, block, 'end');
    }
  }
  return documentLength;
}

/** The first/last document offset of an element's block. */
function blockEdgeOffset(
  context: EditorContext,
  element: Element,
  side: 'start' | 'end'
): number | null {
  const blockElement = blockWithin(element);
  if (!blockElement) {
    return null;
  }
  const block = context.state
    .getBlocks()
    .find((candidate) => String(candidate.lineStart) === blockElement.dataset.lineStart);
  if (!block) {
    return null;
  }
  return side === 'start' ? block.charStart : block.charEnd;
}

/** The block element itself or the first one inside it. */
function blockWithin(node: Element | undefined): HTMLElement | null {
  if (!node) {
    return null;
  }
  if (node.matches('.markdown-block')) {
    return node as HTMLElement;
  }
  return node.querySelector<HTMLElement>('.markdown-block');
}

/** The document offset of the active caret, or null when there is none. */
export function caretOffset(context: EditorContext): number | null {
  const range = editorSelection(context, true);
  if (!range) {
    return null;
  }
  const start = documentOffsetAt(context.state, range.startContainer, range.startOffset);
  return start ? start.offset : null;
}

/** Where the caret goes after an edit: an offset, or one the new text decides. */
export type CaretTarget = number | ((state: MarkdownEditorState) => number);

/**
 * Applies a raw-text edit, re-syncs the rendered window and moves the caret.
 * Every command funnels through here so the change/render/caret sequence is
 * identical everywhere.
 */
export function applyEdit(
  context: EditorContext,
  from: number,
  to: number,
  replacement: string,
  caret: CaretTarget = from + replacement.length
): void {
  const anchor = context.contentView.scrollTop;
  context.state.replaceRange(from, to, replacement);
  // A source being edited keeps its range across the edit, and opens again
  // when the block is rebuilt — before the caret is restored, so the caret is
  // placed inside the source text rather than into a fresh rendering.
  shiftEditingSource(from, to, replacement);
  context.renderer.renderChanged();
  // Re-open the source in the block that was rebuilt, found through the block
  // itself: the component's element is not necessarily in the document yet.
  const editedBlock = context.state.getBlockAtOffset(from);
  const root = proseRoot(context);
  const blockElement =
    editedBlock && root
      ? root.querySelector<HTMLElement>(`.markdown-block[data-line-start="${editedBlock.lineStart}"]`)
      : null;
  if (editedBlock && blockElement) {
    resumeEditingSourceIn(blockElement, editedBlock.charStart);
  }
  const target = typeof caret === 'function' ? caret(context.state) : caret;
  setEditingSourceCaret(target);
  restoreCaret(context, target);
  keepScroll(context, anchor);
}

/**
 * Puts the scroll position back after an edit.
 *
 * Restoring the caret can make the browser scroll the focused element or the
 * synchronised selection into view — a scroll no seam in our code performs or
 * sees — and the reader ends up half a page away even though the document only
 * gained a line. The position is restored only when the caret is visible
 * there, so an edit that moves the caret out of the view still scrolls it in.
 */
export function keepScroll(context: EditorContext, anchor: number): void {
  const scroller = context.contentView;
  // Two frames: the caret is placed on the first, and the second is where the
  // browser has finished scrolling whatever it decided to scroll.
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
      // Where the caret would sit if the scroll went back to the anchor.
      const caretInContent = caret.getBoundingClientRect().top - box.top + scroller.scrollTop;
      const viewportY = caretInContent - anchor + box.top;
      if (viewportY >= box.top + 8 && viewportY <= box.bottom - 24) {
        scroller.scrollTop = anchor;
      }
    });
  });
}

/**
 * Places the caret at a document offset inside the rendered window. Returns
 * false when the offset lives in a block that is not mounted, so callers can
 * retry once that block comes back into the window. Offsets that fall between
 * blocks (the blank lines that separate them) snap to the nearest text, since
 * a separator has nothing to draw a caret on.
 */
export function restoreCaret(context: EditorContext, offset: number): boolean {
  const root = proseRoot(context);
  if (!root) {
    setSelectionRange(null);
    window.getSelection()?.removeAllRanges();
    return false;
  }
  const clamped = context.state.nearestTextOffset(offset);
  // Tell the nodes what offset is being restored, so one that opens its source
  // to hold the caret places it there exactly instead of reading the caret back
  // out of a rendering that has only just been rebuilt.
  setRestoringCaretOffset(clamped);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => setRestoringCaretOffset(null));
  });
  const position = domPositionAtOffset(context.state, root, clamped);
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
  root.focus({ preventScroll: true });
  scheduleCaret(caret);
  return true;
}
