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
import { isEmptyParagraphLine } from '../blank_lines';
import { hasChildBlock, itemSubtreeEnd, lineSpanAt } from '../list_lines';
import { applyEdit, restoreCaret, type EditorContext } from './context';
import { lineRemoval } from './line_removal';

/** The newlines immediately before an offset. */
function newlinesBefore(text: string, offset: number): number {
  return /(\n+)$/.exec(text.slice(0, offset))?.[1].length ?? 0;
}

/** The newlines immediately after an offset. */
function newlinesAfter(text: string, offset: number): number {
  return /^\n+/.exec(text.slice(offset))?.[0].length ?? 0;
}

/**
 * The edit `Enter` makes inside a block: the newlines to insert, and where the
 * caret lands (after the whole break, at the text that follows it).
 *
 * A paragraph break is two newlines between the two halves. Both sides count:
 * a newline already sitting before the caret — the caret at the start of a
 * line — is half the break already, so only one is inserted, and a break that
 * is already there inserts nothing.
 */
export function paragraphSplit(
  text: string,
  offset: number
): { insert: string; caret: number } {
  const before = newlinesBefore(text, offset);
  const after = newlinesAfter(text, offset);
  const insert = '\n'.repeat(Math.max(0, 2 - before - after));
  return { insert, caret: offset + insert.length + after };
}

/**
 * The edit `Enter` makes at the start of a block: give it one empty paragraph
 * above, by growing the run in front of it just enough.
 *
 * A run between two blocks costs three newlines — the separator plus the
 * paragraph — so one newline is added when the separator is already there, two
 * when the block follows another block with no blank line between them (right
 * after a code fence, say), and none when the paragraph is already there. At
 * the top of a file no separator is needed, so a single newline is the
 * paragraph.
 *
 * The caret lands on the empty line adjacent to the paragraph — the line the
 * author is about to fill in.
 */
export function paragraphStart(
  text: string,
  offset: number,
  hasBlockBefore: boolean
): { insert: string; caret: number } {
  const before = newlinesBefore(text, offset);
  const needed = hasBlockBefore ? 3 : 1;
  const insert = '\n'.repeat(Math.max(0, needed - before));
  return { insert, caret: Math.max(0, offset + insert.length - 1) };
}

/** `Enter` at the start of a block: add an empty paragraph above it. */
export function startEmptyParagraphAbove(
  context: EditorContext,
  block: MarkdownBlock,
  offsets: { from: number; to: number }
): boolean {
  const hasBlockBefore = context.state.getBlocks().indexOf(block) > 0;
  const start = paragraphStart(context.state.getText(), offsets.from, hasBlockBefore);
  if (start.insert.length === 0) {
    // The paragraph above is already there: just move onto it.
    restoreCaret(context, start.caret);
    return true;
  }
  applyEdit(context, offsets.from, offsets.to, start.insert, start.caret);
  return true;
}

/** A list marker, its indentation, and an optional task marker. */
const ITEM_LINE = /^(\s*(?:[-+*]|\d+[.)])\s+)(?:(\[[ xX]\])\s+)?/;

/**
 * What `Enter` inserts to continue a list item, or null when the line is not
 * one. The new item keeps the marker and indentation of the item above it; a
 * task item continues unchecked, as every editor's list does.
 */
export function itemContinuation(lineText: string): string | null {
  const match = ITEM_LINE.exec(lineText);
  if (!match || lineText.slice(match[0].length).trim() === '') {
    // A blank item is handled by `exitBlankItem`: Enter there ends the list.
    return null;
  }
  return `\n${match[1]}${match[2] ? '[ ] ' : ''}`;
}

/** `Enter` inside a list item: start a new item of the same kind below. */
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
  // The new item is a sibling of this one, so it belongs after the item's own
  // subtree: markdown gives indented lines to the item directly above them, so
  // inserting before a nested list would move it under the new item.
  const afterSubtree = offsets.from === line.end && hasChildBlock(text, line);
  const from = afterSubtree ? itemSubtreeEnd(text, line) : offsets.from;
  applyEdit(context, from, offsets.to, insertion);
  return true;
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
  const split = paragraphSplit(context.state.getText(), offsets.from);
  applyEdit(context, offsets.from, offsets.to, split.insert, split.caret);
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
  // The emptied line's own newline is the first blank line; a second one is
  // the empty paragraph the author asked for, and one only has to be added
  // when a line of content follows. When a blank line is already there — the
  // usual case of a blank item above a heading — it is reused instead of
  // adding another.
  const replacement = contentFollowsTheLine(cleared, line.start) ? '\n' : '';
  applyEdit(context, line.start, line.end, replacement, (state) => {
    return state.firstEmptyParagraphAfter(line.start) ?? line.start;
  });
  return true;
}

/**
 * Whether a line of content follows the emptied line at `offset`. The emptied
 * line needs an extra newline only then; a blank line (or the end of the file)
 * already provides the paragraph.
 */
function contentFollowsTheLine(text: string, offset: number): boolean {
  const lineBreak = text.indexOf('\n', offset);
  if (lineBreak < 0) {
    return false;
  }
  const nextStart = lineBreak + 1;
  const nextBreak = text.indexOf('\n', nextStart);
  return text.slice(nextStart, nextBreak < 0 ? text.length : nextBreak).trim() !== '';
}

/** Typing (or pasting) on an empty paragraph: the text needs its own line. */
export function materializeInsertion(
  context: EditorContext,
  offsets: { from: number; to: number },
  inserted: string
): boolean {
  const replacement = emptyLineInsertion(context.state.getText(), offsets.from, inserted);
  applyEdit(context, offsets.from, offsets.to, replacement, offsets.from + inserted.length);
  return true;
}

/** Backspace/Delete on an empty paragraph: the line goes, like a blank item. */
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

/**
 * The range a character delete removes. When the deletion empties a line whose
 * blank run is longer than a separator (three newlines), the line takes the
 * newline materialisation added back with it, so typing a character on an
 * empty line and deleting it again leaves the document as it was.
 */
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
