/**
 * Reading the selection: where in the document the reader's range or caret is.
 *
 * The one way from a live DOM range or the logical caret back to document offsets, with the
 * boundary cases a range can carry: a selection anchored to a block element rather than to text, a
 * boundary at a block's edge, a click on a cell's placeholder. Anything that acts on what the reader
 * has chosen asks here; nothing here changes the document.
 *
 * May import: the caret's range and offsets, and the editing context (as a type). Upholds: one
 * reading of "where the reader is", so a command and the caret cannot disagree about it.
 */

import { getCaretRange } from '../caret/caret';
import { documentOffsetAt } from '../caret/offsets';
import type { EditorContext } from './context';

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
    if (isDocumentRange(context, range) && (allowCollapsed || !range.collapsed)) {
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
 * Whether a range is the reader's place *in the document*: a selection inside the rendered
 * prose. Anything else is not one, however it got there — the editor's own chrome, and the
 * system's input seam that lives beside the prose (`composition_input.ts`), which a focused
 * textarea makes the browser report a selection for. Reading that as the caret is what would
 * put the next keystroke at an offset nobody chose.
 */
export function isDocumentRange(context: EditorContext, range: Range): boolean {
  const root = proseRoot(context);
  return root !== null && root.contains(range.commonAncestorContainer);
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
  // A boundary anchored to an element *inside* a block is a text position like
  // any other: the caret beside a widget (a link, an image, a formula) is
  // anchored to the paragraph that holds it, and maps through the block's own
  // model like a caret in its text. Only a boundary on the block element
  // itself — a drag that anchored to it, Select All — means the block's edge.
  if (!element.matches('.markdown-block')) {
    const location = documentOffsetAt(context.state, container, offset);
    if (location) {
      return location.offset;
    }
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
