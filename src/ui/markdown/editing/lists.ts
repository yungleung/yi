/**
 * List commands: make the selection a list of a kind, take the list away
 * again, and move items in or out one level.
 *
 * Each command is one `applyEdit`, so a list change is one undo step and only
 * the block it changed is re-rendered. The rules themselves are pure and live
 * in `list_edits.ts`; this module is the part that knows about the editor.
 */

import { isRawRendered } from '../blocks';
import { shiftOffset } from '../edit_range';
import { indentEdit, listEdit, type ListKind } from '../list_edits';
import { applyEdit, caretOffset, editorSelection, rangeOffsets, type EditorContext } from './context';

/** What a list button, or Tab, asks for. */
export type ListCommand = ListKind | 'indent' | 'outdent';

/**
 * Applies a list command to the caret's line or to every line the selection
 * touches. Returns false when there is nothing to do — inside code, math or
 * another raw block, where a line is literal text and not a list.
 */
export function applyListCommand(context: EditorContext, command: ListCommand): boolean {
  const range = editorSelection(context, true);
  if (!range) {
    return false;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return false;
  }
  const block = context.state.getBlockAtOffset(offsets.from);
  if (!block || isRawRendered(block.kind)) {
    return false;
  }
  const text = context.state.getText();
  const edit =
    command === 'indent'
      ? indentEdit(text, offsets.from, offsets.to, false)
      : command === 'outdent'
        ? indentEdit(text, offsets.from, offsets.to, true)
        : listEdit(text, offsets.from, offsets.to, command);
  if (!edit) {
    return false;
  }
  // The caret travels with the text it sat in: an indent above it pushes it
  // right, an outdent pulls it back.
  applyEdit(
    context,
    edit.from,
    edit.to,
    edit.replacement,
    shiftOffset(caretOffset(context) ?? edit.from, edit)
  );
  return true;
}
