/**
 * Line-level editing rules for empty lines.
 *
 * `Enter` at the end of a block only adds the newline the author asked for:
 * one, which makes the blank run after the block long enough to hold an empty
 * paragraph. Typing on an empty line needs one newline on the side where the
 * next block begins, because markdown keeps two paragraphs apart only when a
 * blank line sits on both sides.
 */

import type { MarkdownBlock } from '../blocks';
import { applyEdit, type EditorContext } from './context';

/** The newlines `Enter` inserts to make a paragraph break at `offset`. */
export function paragraphBreak(text: string, offset: number): string {
  const following = /^\n+/.exec(text.slice(offset))?.[0].length ?? 0;
  return '\n'.repeat(Math.max(0, 2 - following));
}

/** The insert that turns the empty line at `offset` into a paragraph. */
export function emptyLineInsertion(text: string, offset: number, inserted: string): string {
  const lineEnd = text.indexOf('\n', offset);
  const followedByBlock = text.slice(lineEnd < 0 ? text.length : lineEnd + 1).trim() !== '';
  return followedByBlock ? `${inserted}\n` : inserted;
}

/** `Enter` at the end of a block: add a line and move the caret onto it. */
export function startEmptyParagraph(
  context: EditorContext,
  block: MarkdownBlock,
  offsets: { from: number; to: number }
): boolean {
  applyEdit(context, offsets.from, offsets.to, '\n', (state) => {
    return state.firstEmptyParagraphAfter(block.charEnd) ?? block.charEnd;
  });
  return true;
}

/** `Enter` inside a block: split it into two paragraphs. */
export function splitParagraph(
  context: EditorContext,
  offsets: { from: number; to: number }
): boolean {
  const breakText = paragraphBreak(context.state.getText(), offsets.from);
  applyEdit(context, offsets.from, offsets.to, breakText, offsets.from + 2);
  return true;
}

/**
 * `Enter` on a blank list item: the item's marker goes, and an empty paragraph
 * takes its place, which also ends the list there (a run that carries an empty
 * paragraph is a block boundary).
 */
export function exitBlankItem(
  context: EditorContext,
  line: { start: number; end: number }
): boolean {
  const text = context.state.getText();
  const cleared = `${text.slice(0, line.start)}${text.slice(line.end)}`;
  const runFrom = blankRunStart(cleared, line.start);
  const runTo = blankRunEnd(cleared, line.start);
  const betweenBlocks =
    cleared.slice(0, runFrom).trim() !== '' && cleared.slice(runTo).trim() !== '';
  // One blank line is a separator; a second one is the paragraph the author
  // asked for.
  const replacement = betweenBlocks ? '\n' : '';
  applyEdit(context, line.start, line.end, replacement, (state) => {
    return state.firstEmptyParagraphAfter(line.start) ?? line.start;
  });
  return true;
}

/** The start of the blank run the line at `offset` belongs to. */
function blankRunStart(text: string, offset: number): number {
  let start = offset;
  while (start > 0) {
    const previousBreak = text.lastIndexOf('\n', start - 2);
    if (previousBreak < 0 || text.slice(previousBreak + 1, start - 1).trim() !== '') {
      break;
    }
    start = previousBreak + 1;
  }
  return start;
}

/** The end of the blank run the line at `offset` belongs to. */
function blankRunEnd(text: string, offset: number): number {
  let end = offset;
  while (end < text.length) {
    const nextBreak = text.indexOf('\n', end);
    if (nextBreak < 0) {
      break;
    }
    if (text.slice(end, nextBreak).trim() !== '') {
      break;
    }
    end = nextBreak + 1;
  }
  return end;
}
