/**
 * Keeps the document's footnote-label set current after an edit.
 *
 * Example: typing `[^2]: ` on a line adds `2`; an edit that cannot create, remove or move a
 * definition line returns the original set without scanning the document again.
 *
 * May import: shared line spans and the footnote model. Upholds: whenever an edit might change a
 * definition line, the result is exactly the set a full scan of the new text would find.
 */

import { lineSpanAt } from '../lines';
import { containsFootnoteDefinition, footnoteLabels } from './model';

/**
 * A replacement of a range of raw text.
 *
 * This mirrors the edit history's `DocumentEdit`; the syntax layer repeats the structural shape
 * because it may not depend upward on the document layer.
 */
export interface TextReplacement {
  from: number;
  to: number;
  removed: string;
  inserted: string;
}

/**
 * The labels the document defines after `edit`, given the labels it had.
 *
 * Example: inserting `\n\n[^2]: note` changes `{1}` to `{1, 2}`. A plain character inside a
 * paragraph keeps the same set object without a scan.
 *
 * A definition is a whole line and may start or stop being one when text, indentation or a line
 * boundary changes. Those cases rescan the document; everything else reuses the set, because a
 * missing label would silently turn a reference back into ordinary characters.
 */
export function labelsAfterEdit(
  labels: ReadonlySet<string>,
  text: string,
  edit: TextReplacement
): ReadonlySet<string> {
  if (
    containsFootnoteDefinition(edit.removed) ||
    containsFootnoteDefinition(edit.inserted) ||
    movesALine(edit)
  ) {
    return footnoteLabels(text);
  }
  const line = lineSpanAt(text, edit.from + edit.inserted.length);
  if (
    containsFootnoteDefinition(text.slice(line.start, line.end)) ||
    containsFootnoteDefinition(lineBefore(text, line, edit))
  ) {
    return footnoteLabels(text);
  }
  return labels;
}

/** Whether the edit removes or adds a line ending, which moves every line below. */
function movesALine(edit: TextReplacement): boolean {
  return edit.removed.includes('\n') || edit.inserted.includes('\n');
}

/**
 * The line the edit landed on as it was before the edit: what it inserted
 * swapped back for what it removed.
 */
function lineBefore(
  text: string,
  line: { start: number; end: number },
  edit: TextReplacement
): string {
  const at = Math.max(0, edit.from - line.start);
  const lineText = text.slice(line.start, line.end);
  return `${lineText.slice(0, at)}${edit.removed}${lineText.slice(at + edit.inserted.length)}`;
}
