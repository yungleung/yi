/**
 * Deleting empty lines without disturbing the blank-run shape around them.
 *
 * Example: Backspace on an empty paragraph removes the physical line; deleting the last character
 * typed onto a temporary blank line also removes the newline that materialization added.
 *
 * May import: pure blank/line rules, line removal and the editing context. Upholds: a delete is one
 * source replacement, and only the line whose deletion caused the change takes extra whitespace.
 */

import { isEmptyParagraphLine } from '../../syntax/blank_lines';
import { lineSpanAt } from '../../syntax/lines';
import { applyEdit, type EditorContext } from '../context';
import { lineRemoval } from '../line_removal';

/** Backspace or Delete on an empty paragraph removes the physical line. */
export function deleteEmptyParagraph(context: EditorContext, offset: number): boolean {
  const text = context.state.getText();
  const line = lineSpanAt(text, offset);
  if (!isEmptyParagraphLine(text.slice(line.start, line.end))) {
    return false;
  }
  const removal = lineRemoval(text, line);
  applyEdit(context, removal.from, removal.to, '', removal.caret);
  return true;
}

/** The range a character delete removes, including a materialized line break when needed. */
export function characterRemoval(
  text: string,
  from: number,
  to: number
): { from: number; to: number } {
  const after = `${text.slice(0, from)}${text.slice(to)}`;
  const line = lineSpanAt(after, from);
  if (after.slice(line.start, line.end).trim() !== '') {
    return { from, to };
  }
  let before = 0;
  while (line.start - before - 1 >= 0 && after[line.start - before - 1] === '\n') {
    before += 1;
  }
  const following = /^\n+/.exec(after.slice(line.start))?.[0].length ?? 0;
  if (before + following <= 3) {
    return { from, to };
  }
  return { from, to: Math.min(to + 1, text.length) };
}
