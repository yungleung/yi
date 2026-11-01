/**
 * The raw-text edit made by the footnote button.
 *
 * Example: `footnoteInsertEdit('Body', 4, '1')` puts `[^1]` at the caret and appends
 * `\n\n[^1]: ` so the marker and its empty note are one undoable replacement.
 *
 * May import: the shared edit shape and the footnote model. Upholds: an open notes run gains the
 * definition directly, while a new run starts after one blank line.
 */

import type { TextEdit } from '../edit_range';
import { containsFootnoteDefinition } from './model';

/**
 * The one edit the footnote button makes: the marker at the caret, and the
 * definition line at the end of the document.
 *
 * The first definition is separated by a blank line; later definitions join the open notes run.
 * Existing trailing newlines stay put, and the new definition always ends with one.
 */
export function footnoteInsertEdit(text: string, caret: number, label: string): TextEdit {
  const tail = text.slice(caret);
  const trailingNewlines = /(\n*)$/.exec(tail)?.[1].length ?? 0;
  const separator = notesAreOpen(text, trailingNewlines)
    ? trailingNewlines >= 1
      ? ''
      : '\n'
    : '\n'.repeat(Math.max(0, 2 - trailingNewlines));
  return {
    from: caret,
    to: text.length,
    replacement: `[^${label}]${tail}${separator}[^${label}]: \n`
  };
}

/**
 * Whether the document already ends inside the notes, in which case the new
 * definition joins them instead of starting them.
 */
function notesAreOpen(text: string, trailingNewlines: number): boolean {
  const before = text.slice(0, text.length - trailingNewlines);
  const lines = before.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.trim() === '') {
      return false;
    }
    if (containsFootnoteDefinition(line)) {
      return true;
    }
  }
  return false;
}
