/**
 * The window box a floating editing surface should point at.
 *
 * Example: a non-collapsed range in the prose returns its own rectangle; with no
 * selection, the logical caret is used; with neither, there is no anchor.
 *
 * May import: the floating `Box` shape. Upholds: selection, native-menu table
 * and stack surfaces share one geometric answer without reading editor state.
 */

import type { Box } from '../floating';

function box(rect: DOMRect): Box | null {
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** The reader's non-collapsed selection inside the rendered document, if any. */
export function documentSelectionBox(scroller: HTMLElement): Box | null {
  const selection = window.getSelection();
  const prose = scroller.querySelector('.prose');
  if (!selection || selection.rangeCount === 0 || !prose) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (range.collapsed || !prose.contains(range.commonAncestorContainer)) {
    return null;
  }
  return box(range.getBoundingClientRect());
}

/** The visible caret inside the document, if the editor is drawing one. */
export function documentCaretBox(scroller: HTMLElement): Box | null {
  const caret = scroller.querySelector('.markdown-caret');
  return caret ? box(caret.getBoundingClientRect()) : null;
}

/** A menu action anchors to selected text first and to the caret otherwise. */
export function editorActionAnchor(scroller: HTMLElement): () => Box | null {
  return () => documentSelectionBox(scroller) ?? documentCaretBox(scroller);
}
