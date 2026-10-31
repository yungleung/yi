/**
 * Deletes a character, paired marker, blank item or blank quote line through the
 * text path.
 *
 * Example: Backspace beside an app-created `[]` removes both characters; Delete
 * at the right edge of a table cell leaves the cell and its pipe untouched.
 *
 * May import: the edit context, blank-item/line rules, table-cell rules, bracket
 * pairing and quote deletion. Upholds: a deletion is one raw-document edit and
 * no structural marker outside the intended target is consumed.
 */

import { deleteBlankItem } from './blank_item';
import {
  characterRemoval,
  deleteEmptyParagraph
} from './blank_lines';
import { applyEdit, type EditorContext } from './context';
import { editorSelection, rangeOffsets } from './selection';
import { isQuoteLike } from '../document/block_kinds';
import { pairAround } from '../syntax/brackets';
import { deleteBlankQuoteLine } from '../syntax/quote_edits';
import { tableDeleteIsNoop } from './table';
import { blockAtCaret } from './text_command_context';

/** Deletes one character before (backspace) or after (delete) the caret. */
export function deleteText(context: EditorContext, forward: boolean): boolean {
  const range = editorSelection(context, true);
  if (!range) {
    return false;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return false;
  }
  let { from, to } = offsets;
  if (from === to) {
    const block = blockAtCaret(context, range, from);
    if (block !== null && isQuoteLike(block.kind)) {
      const deletion = deleteBlankQuoteLine(
        block.text,
        Math.min(from - block.charStart, block.text.length)
      );
      if (deletion !== null) {
        applyEdit(
          context,
          block.charStart + deletion.edit.from,
          block.charStart + deletion.edit.to,
          '',
          block.charStart + deletion.caret,
          'deleting'
        );
        return true;
      }
    }
    // A pair the app wrote goes whole: a mistyped `[` should not leave its `]` behind.
    const pair = forward ? null : pairAround(context.state.getText(), from);
    if (pair) {
      applyEdit(context, pair.from, pair.to, '', pair.from, 'typing');
      return true;
    }
    // A caret in a table cell deletes inside its own cell only: at the cell's
    // edges there is nothing left to delete that belongs to the cell, and
    // eating a pipe or the neighbouring cell is never what the author meant.
    if (tableDeleteIsNoop(context, forward)) {
      return true;
    }
    // An empty list item is a whole line, not a character to nibble at.
    if (deleteBlankItem(context, from)) {
      return true;
    }
    if (deleteEmptyParagraph(context, from)) {
      return true;
    }
    if (forward) {
      to = Math.min(context.state.getText().length, to + 1);
    } else {
      from = Math.max(0, from - 1);
    }
  }
  if (from === to) {
    return false;
  }
  const removal = characterRemoval(context.state.getText(), from, to);
  applyEdit(context, removal.from, removal.to, '', from, 'deleting');
  return true;
}
