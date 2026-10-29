/**
 * A raw-text edit, and where an offset ends up once it is applied.
 *
 * Both the table commands and the list commands express what they do as one
 * replacement of a range of the document, so this is where that shape lives —
 * and where the rule for keeping the caret attached to the text it sat in is
 * written once.
 *
 * May import: nothing — the text and the edit are passed in. Upholds: one fact
 * about markdown syntax has one home, and this is the home of the `TextEdit`
 * shape and of the rule that keeps an offset attached to the text it sat in.
 */

export interface TextEdit {
  from: number;
  to: number;
  replacement: string;
}

/** Where an offset ends up once `edit` is applied. */
export function shiftOffset(offset: number, edit: TextEdit): number {
  if (offset <= edit.from) return offset;
  if (offset >= edit.to) return offset + (edit.replacement.length - (edit.to - edit.from));
  return edit.from;
}

/**
 * Where a range's right endpoint ends after `edit`.
 *
 * Unlike a caret at the same boundary, an exclusive range end includes text
 * inserted at that boundary. This is what lets a source view's content and the
 * complete source range both grow as the author types at their visible end.
 */
export function shiftRangeEnd(offset: number, edit: TextEdit): number {
  if (offset < edit.from) return offset;
  if (offset > edit.to) return offset + (edit.replacement.length - (edit.to - edit.from));
  return edit.from + edit.replacement.length;
}
