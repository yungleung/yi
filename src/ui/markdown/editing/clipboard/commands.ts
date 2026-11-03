/**
 * Clipboard commands: copy, cut, paste and select-all.
 *
 * Everything works on raw document offsets rather than the rendered DOM, so
 * the clipboard still round-trips correctly when most of the document is
 * virtualized away.
 *
 * May import: the editing context and the pure rules it needs (`../context`,
 * `../blank_lines`). Upholds: the document text is the only source of truth —
 * copy and cut read raw offsets and paste is one range replacement, so what the
 * clipboard carries never depends on which blocks happen to be mounted.
 */

import { applyEdit, type EditorContext } from '../context';
import { editorSelection, rangeOffsets, proseRoot } from '../selection';
import { materializeInsertion, pasteInsertion } from '../blank_lines';

/** The selected raw range and its text, or null when nothing is selected. */
function selectedRawRange(
  context: EditorContext
): { from: number; to: number; text: string } | null {
  const range = editorSelection(context, false);
  if (!range) {
    return null;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets || offsets.from === offsets.to) {
    return null;
  }
  return {
    from: offsets.from,
    to: offsets.to,
    text: context.state.getText().slice(offsets.from, offsets.to)
  };
}

/** Copies the selection as plain markdown. */
export function copySelection(context: EditorContext, event: ClipboardEvent): void {
  const selected = selectedRawRange(context);
  if (!selected) {
    return;
  }
  event.preventDefault();
  event.clipboardData?.setData('text/plain', selected.text);
}

/** Copies the selection to the system clipboard and removes it. */
export async function cutSelection(context: EditorContext): Promise<void> {
  const selected = selectedRawRange(context);
  if (!selected) {
    return;
  }
  try {
    await navigator.clipboard.writeText(selected.text);
  } catch (error) {
    console.error('Failed to copy the cut selection to the clipboard:', error);
    return;
  }
  applyEdit(context, selected.from, selected.to, '', selected.from);
}

/** Inserts pasted text at the selection or caret. */
export function pasteText(context: EditorContext, event: ClipboardEvent): void {
  const replacement = event.clipboardData?.getData('text/plain');
  if (replacement === undefined) {
    return;
  }
  const range = editorSelection(context, true);
  if (!range) {
    return;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return;
  }
  event.preventDefault();
  const block = context.state.getBlockAtOffset(offsets.from);
  if (block?.kind === 'blank' && offsets.from === offsets.to) {
    materializeInsertion(context, offsets, replacement);
    return;
  }
  // Blocks pasted where they were not alone get the blank lines they need at the
  // seam, and the caret lands at the end of what was pasted; one line, or one
  // paragraph broken across lines, is spliced where the caret is.
  const text = context.state.getText();
  const insertion = pasteInsertion(text, offsets.from, offsets.to, replacement);
  applyEdit(context, offsets.from, offsets.to, insertion.replacement, insertion.caret);
}

/**
 * Selects the whole document. The range is anchored to the prose root; the
 * command layer maps such a range to the full document range, so Select All
 * followed by Copy yields the entire markdown source even when only part of
 * it is rendered.
 */
export function selectAll(context: EditorContext): void {
  const root = proseRoot(context);
  const selection = window.getSelection();
  if (!root || !selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  // The keyboard first, then the selection: the editor's own seam holds it
  // (`context.ts: EditorContext.focusText`), and moving the keyboard to it *after*
  // making the selection is what would drop the selection — a control that had the
  // keyboard (the find bar's field) loses it to the seam, which is a focus change.
  context.focusText();
  selection.removeAllRanges();
  selection.addRange(range);
}
