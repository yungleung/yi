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

/**
 * Copies the raw selection for a command-triggered context-menu action.
 *
 * Example: selecting text across two virtualized blocks and choosing Copy puts
 * their complete Markdown on the clipboard even though only one is mounted.
 */
export async function copySelectedMarkdown(context: EditorContext): Promise<boolean> {
  const selected = selectedRawRange(context);
  if (!selected) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(selected.text);
    return true;
  } catch (error) {
    console.error('Failed to copy the selection to the clipboard:', error);
    return false;
  }
}

/** Copies the selection to the system clipboard and removes it. */
export async function cutSelection(context: EditorContext): Promise<void> {
  const range = selectedRawRange(context);
  if (!range || !(await copySelectedMarkdown(context))) {
    return;
  }
  applyEdit(context, range.from, range.to, '', range.from);
}

/** Inserts plain text at the selection or caret, giving multi-block text its separators. */
export function insertPastedText(context: EditorContext, replacement: string): boolean {
  const range = editorSelection(context, true);
  if (!range) {
    return false;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return false;
  }
  const block = context.state.getBlockAtOffset(offsets.from);
  if (block?.kind === 'blank' && offsets.from === offsets.to) {
    materializeInsertion(context, offsets, replacement);
    return true;
  }
  // Blocks pasted where they were not alone get the blank lines they need at the
  // seam, and the caret lands at the end of what was pasted; one line, or one
  // paragraph broken across lines, is spliced where the caret is.
  const text = context.state.getText();
  const insertion = pasteInsertion(text, offsets.from, offsets.to, replacement);
  applyEdit(context, offsets.from, offsets.to, insertion.replacement, insertion.caret);
  return true;
}

/** Inserts text from the browser's paste event at the selection or caret. */
export function pasteText(context: EditorContext, event: ClipboardEvent): void {
  const replacement = event.clipboardData?.getData('text/plain');
  if (replacement !== undefined && insertPastedText(context, replacement)) {
    event.preventDefault();
  }
}

/** Reads the platform clipboard and inserts its text for the context menu. */
export async function pasteClipboard(context: EditorContext): Promise<boolean> {
  const replacement = await context.host.clipboard.readText();
  return replacement === null ? false : insertPastedText(context, replacement);
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
