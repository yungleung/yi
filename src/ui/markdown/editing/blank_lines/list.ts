/**
 * Empty-line behavior that belongs to list items.
 *
 * Example: Enter after `- Parent` inserts `\n- ` after the item subtree; Enter on that empty item
 * removes its marker and returns to an ordinary blank line.
 *
 * May import: list-line rules and the editing context. Upholds: list continuation and exit operate
 * on complete item subtrees and never take ownership from quote, table, code or equation rules.
 */

import { hasChildBlock, itemContinuation, itemSubtreeEnd } from '../../syntax/lines';
import { applyEdit, type EditorContext } from '../context';

/** Enter inside a list item: start a new item of the same kind below. */
export function continueListItem(
  context: EditorContext,
  line: { start: number; end: number },
  offsets: { from: number; to: number }
): boolean {
  const text = context.state.getText();
  const insertion = itemContinuation(text.slice(line.start, line.end));
  if (insertion === null) {
    return false;
  }
  const afterSubtree = offsets.from === line.end && hasChildBlock(text, line);
  const from = afterSubtree ? itemSubtreeEnd(text, line) : offsets.from;
  applyEdit(context, from, offsets.to, insertion);
  return true;
}

/** Enter on a blank list item: remove its marker and leave an empty paragraph. */
export function exitBlankItem(
  context: EditorContext,
  line: { start: number; end: number }
): boolean {
  const text = context.state.getText();
  const cleared = `${text.slice(0, line.start)}${text.slice(line.end)}`;
  const replacement = contentFollowsTheLine(cleared, line.start) ? '\n' : '';
  applyEdit(context, line.start, line.end, replacement, (state) => {
    return state.firstEmptyParagraphAfter(line.start) ?? line.start;
  });
  return true;
}

function contentFollowsTheLine(text: string, offset: number): boolean {
  const lineBreak = text.indexOf('\n', offset);
  if (lineBreak < 0) {
    return false;
  }
  const nextStart = lineBreak + 1;
  const nextBreak = text.indexOf('\n', nextStart);
  return text.slice(nextStart, nextBreak < 0 ? text.length : nextBreak).trim() !== '';
}
