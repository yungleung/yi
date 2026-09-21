/**
 * Deleting the line of an empty list item.
 *
 * A blank item (`- `, `  - `, `1. [ ] `) is a line of its own, but deleting
 * one character at a time cannot express "remove this line": backspace eats
 * the marker's own space and leaves `-` glued to the text around it, and
 * delete eats the newline that separates the item from the next line. Either
 * key, pressed with the caret inside such an item, therefore removes the whole
 * line and puts the caret at the end of the item above it.
 */

import { isRawRendered } from '../blocks';
import { blankItemLineAt } from '../syntax/lines';
import { applyEdit, type EditorContext } from './context';
import { lineRemoval } from './line_removal';

/**
 * Removes the empty item line the caret sits on, if there is one. Returns
 * false when the caret is elsewhere, so the caller can delete a character.
 */
export function deleteBlankItem(context: EditorContext, offset: number): boolean {
  const block = context.state.getBlockAtOffset(offset);
  if (!block || isRawRendered(block.kind)) {
    return false;
  }
  const text = context.state.getText();
  const line = blankItemLineAt(text, offset);
  if (!line) {
    return false;
  }
  const removal = lineRemoval(text, line);
  applyEdit(context, removal.from, removal.to, '', removal.caret);
  return true;
}
