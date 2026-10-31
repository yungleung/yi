/**
 * Applies a picker choice to one block-opening line while keeping the caret at
 * the same logical source position.
 *
 * Example: choosing `python` for an opening fence replaces only the language
 * token; a caret later in the document moves by the length difference, while a
 * caret inside the replaced token stays at the edit's resulting selection.
 *
 * May import: the edit context and the shared `TextEdit` value. Upholds: a
 * missing block or inapplicable edit changes nothing, and the target offset is
 * computed from the edit before the document rebuilds.
 */

import { applyEdit, caretOffset, type EditorContext } from './context';
import type { TextEdit } from '../syntax/edit_range';

/**
 * Makes one opening-line edit from a pure rule.
 *
 * `caretAtEnd` distinguishes a token whose end is inside the choice (callout
 * kinds) from a prefix whose end is a valid insertion edge (fence language).
 */
export function applyBlockOpeningEdit(
  context: EditorContext,
  lineStart: number,
  makeEdit: (blockText: string, relativeCaret: number) => TextEdit | null,
  caretAtEnd: boolean
): void {
  const block = context.state.getBlockAtLine(lineStart);
  const caret = caretOffset(context);
  const relative =
    block === null || caret === null
      ? 0
      : Math.min(Math.max(0, caret - block.charStart), block.text.length);
  const edit = block ? makeEdit(block.text, relative) : null;
  if (block === null || edit === null) {
    return;
  }
  const from = block.charStart + edit.from;
  const to = block.charStart + edit.to;
  const delta = edit.replacement.length - (edit.to - edit.from);
  const caretIsInside =
    caret !== null &&
    caret >= from &&
    (caret < to || (caretAtEnd && caret === to));
  const target =
    caret === null || caretIsInside
      ? undefined
      : caret > to
        ? caret + delta
        : caret;
  applyEdit(context, from, to, edit.replacement, target);
}
