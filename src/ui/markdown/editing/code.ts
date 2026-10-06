/**
 * Tab inside a fenced block: one `Tab` is two spaces, so a multi-line code
 * block or formula lines up the way the text around it does.
 *
 * The rule itself is pure (`code_edits.ts`); this module is the part that
 * knows where the caret is and applies the edit. Anywhere else in the document
 * this command declines, so the browser keeps its own Tab.
 *
 * May import: the block model, the pure code rules (`syntax/code_edits.ts`) and
 * the editing context. Upholds: the document text is the only source of truth —
 * the rule is a pure function of the text, and this module only decides whether
 * the caret is somewhere it applies.
 */

import { isFenced } from '../document/block_kinds';;
import { codeIndentEdit } from '../syntax/code_edits';
import { shiftOffset } from '../syntax/edit_range';
import { applyEdit, caretOffset, editorSelection, rangeOffsets, type EditorContext } from './context';

/**
 * Whether the Tab key was handled. True whenever the caret is inside a fenced
 * block — even when the edit itself is a no-op, like Shift+Tab at the start of
 * a line — so the key never moves focus out of the text being typed.
 */
export function applyCodeIndent(context: EditorContext, outdent: boolean): boolean {
  const range = editorSelection(context, true);
  if (!range) {
    return false;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return false;
  }
  const block = context.state.getBlockAtOffset(offsets.from);
  // All three are literal text — nothing in them is parsed — so indenting a line can only mean
  // "move this line".
  if (!block || !isFenced(block.kind)) {
    return false;
  }
  const edit = codeIndentEdit(context.state.getText(), offsets.from, offsets.to, outdent);
  if (!edit) {
    return true;
  }
  const caret = caretOffset(context) ?? edit.from;
  // Two spaces typed at the caret leave it after them; a line that moves takes
  // the caret with it.
  const next =
    edit.from === edit.to && caret <= edit.from
      ? edit.from + edit.replacement.length
      : shiftOffset(caret, edit);
  applyEdit(context, edit.from, edit.to, edit.replacement, next);
  return true;
}
