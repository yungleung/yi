/**
 * List commands: make the selection a list of a kind, take the list away
 * again, and move items in or out one level.
 *
 * Each command is one `applyEdit`, so a list change is one undo step and only
 * the block it changed is re-rendered. The rules themselves are pure and live
 * in `list_edits.ts`; this module is the part that knows about the editor.
 *
 * May import: the block model, the pure list rules (`syntax/list_edits.ts`,
 * `syntax/edit_range.ts`) and the editing context. Upholds: the document text is
 * the only source of truth — every command is one `applyEdit`, so a list change
 * is one undo step.
 */

import { isRawRendered } from '../document/block_kinds';;
import { shiftOffset, type TextEdit } from '../syntax/edit_range';
import { LIST_KINDS, indentEdit, listEdit } from '../syntax/list_edits';
import { applyEdit, caretOffset, editorSelection, rangeOffsets, type EditorContext } from './context';

/**
 * What a list trigger asks for: make the line a list of a kind, or move the
 * item in or out one level. Tab and Shift+Tab ask for the last two directly,
 * as the text path; the buttons ask for theirs by command id.
 */
export const LIST_COMMANDS = [...LIST_KINDS, 'indent', 'outdent'] as const;

/** One of the list commands above. */
export type ListCommand = (typeof LIST_COMMANDS)[number];

/**
 * The edit a list command would make here, or null when there is nothing to do
 * — inside code, math or another raw block, where a line is literal text and not
 * a list. Split from applying it so a trigger can ask whether the command
 * applies without running it (see `commands/editor_commands.ts`), which is what
 * lets Tab fall through to the code block's own Tab.
 */
export function listCommandEdit(context: EditorContext, command: ListCommand): TextEdit | null {
  const range = editorSelection(context, true);
  if (!range) {
    return null;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return null;
  }
  const block = context.state.getBlockAtOffset(offsets.from);
  if (!block || isRawRendered(block.kind)) {
    return null;
  }
  const text = context.state.getText();
  return command === 'indent'
    ? indentEdit(text, offsets.from, offsets.to, false)
    : command === 'outdent'
      ? indentEdit(text, offsets.from, offsets.to, true)
      : listEdit(text, offsets.from, offsets.to, command);
}

/**
 * Applies a list command to the caret's line or to every line the selection
 * touches. Returns false when there is nothing to do.
 */
export function applyListCommand(context: EditorContext, command: ListCommand): boolean {
  const edit = listCommandEdit(context, command);
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
