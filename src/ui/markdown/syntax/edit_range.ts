/**
 * A raw-text edit, and where an offset ends up once it is applied.
 *
 * Both the table commands and the list commands express what they do as one
 * replacement of a range of the document, so this is where that shape lives —
 * and where the rule for keeping the caret attached to the text it sat in is
 * written once.
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
