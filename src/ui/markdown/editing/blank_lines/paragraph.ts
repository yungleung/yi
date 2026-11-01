/**
 * Paragraph and whitespace editing around blank lines.
 *
 * Example: pressing Enter in `one|two` inserts the two-newline paragraph break and leaves the
 * caret on the new empty line; pasting two paragraphs adds only the missing separators.
 *
 * May import: block kinds, pure line rules and the editing context. Upholds: every paragraph edit
 * is one source replacement whose blank-line count follows the blocks on both sides.
 */

import type { EditKind } from '../../document/history';
import type { MarkdownBlock } from '../../document/blocks';
import { isEmptyParagraphLine } from '../../syntax/blank_lines';
import { lineSpanAt } from '../../syntax/lines';
import { applyEdit, restoreCaret, type EditorContext } from '../context';

function newlinesBefore(text: string, offset: number): number {
  return /(\n+)$/.exec(text.slice(0, offset))?.[1].length ?? 0;
}

function newlinesAfter(text: string, offset: number): number {
  return /^\n+/.exec(text.slice(offset))?.[0].length ?? 0;
}

const PARAGRAPH_BREAK = 2;

/**
 * The newlines `Enter` inserts inside a block and the caret after the complete break.
 *
 * Example: `paragraphSplit('one|two', 3)` inserts `\n\n`; if one newline already surrounds the
 * caret, only the missing half is inserted.
 */
export function paragraphSplit(
  text: string,
  offset: number
): { insert: string; caret: number } {
  const before = newlinesBefore(text, offset);
  const after = newlinesAfter(text, offset);
  const insert = '\n'.repeat(Math.max(0, PARAGRAPH_BREAK - before - after));
  return { insert, caret: offset + insert.length + after };
}

/** The blank lines a standalone block needs on each side of an offset. */
export function blockPadding(
  text: string,
  offset: number
): { leading: string; trailing: string } {
  return {
    leading:
      offset === 0
        ? ''
        : '\n'.repeat(Math.max(0, PARAGRAPH_BREAK - newlinesBefore(text, offset))),
    trailing: '\n'.repeat(Math.max(0, PARAGRAPH_BREAK - newlinesAfter(text, offset)))
  };
}

/** The edit Enter makes at the start of a block. */
export function paragraphStart(
  text: string,
  offset: number,
  hasBlockBefore: boolean
): { insert: string; caret: number } {
  const before = newlinesBefore(text, offset);
  const needed = hasBlockBefore ? PARAGRAPH_BREAK + 1 : 1;
  const insert = '\n'.repeat(Math.max(0, needed - before));
  return { insert, caret: Math.max(0, offset + insert.length - 1) };
}

/** Enter at the start of a block: add an empty paragraph above it. */
export function startEmptyParagraphAbove(
  context: EditorContext,
  block: MarkdownBlock,
  offsets: { from: number; to: number }
): boolean {
  const hasBlockBefore = context.state.getBlocks().indexOf(block) > 0;
  const start = paragraphStart(context.state.getText(), offsets.from, hasBlockBefore);
  if (start.insert.length === 0) {
    restoreCaret(context, start.caret);
    return true;
  }
  applyEdit(context, offsets.from, offsets.to, start.insert, start.caret);
  return true;
}

/** What typing on an empty paragraph turns it into. */
export function emptyLineInsertion(
  text: string,
  offset: number,
  inserted: string
): { replacement: string; caret: number } {
  const lineEnd = text.indexOf('\n', offset);
  const followedByBlock = text.slice(lineEnd < 0 ? text.length : lineEnd + 1).trim() !== '';
  if (followedByBlock) {
    return { replacement: `${inserted}\n`, caret: offset + inserted.length };
  }
  if (blockAbove(text, offset)) {
    return { replacement: `\n${inserted}`, caret: offset + 1 + inserted.length };
  }
  return { replacement: inserted, caret: offset + inserted.length };
}

function blockAbove(text: string, offset: number): boolean {
  if (offset === 0) {
    return false;
  }
  const above = lineSpanAt(text, offset - 1);
  return !isEmptyParagraphLine(text.slice(above.start, above.end));
}

/** What a paste replaces its range with, including block separators when it contains blocks. */
export function pasteInsertion(
  text: string,
  from: number,
  to: number,
  pasted: string
): { replacement: string; caret: number } {
  if (!/\n[ \t]*\n/.test(pasted)) {
    return { replacement: pasted, caret: from + pasted.length };
  }
  const { leading } = blockPadding(text, from);
  const { trailing } = blockPadding(text, to);
  return {
    replacement: `${leading}${pasted}${trailing}`,
    caret: from + leading.length + pasted.length
  };
}

/** Enter at the end of a block: add a line and move the caret onto it. */
export function startEmptyParagraph(
  context: EditorContext,
  block: MarkdownBlock,
  offsets: { from: number; to: number }
): boolean {
  const blockEnd = block.charEnd;
  applyEdit(context, offsets.from, offsets.to, '\n', (state) => {
    return state.firstEmptyParagraphAfter(blockEnd) ?? blockEnd;
  });
  return true;
}

/** Enter inside a block: split it into two paragraphs. */
export function splitParagraph(
  context: EditorContext,
  offsets: { from: number; to: number }
): boolean {
  const split = paragraphSplit(context.state.getText(), offsets.from);
  applyEdit(context, offsets.from, offsets.to, split.insert, split.caret);
  return true;
}

/** Typing or pasting on an empty paragraph gives the text its own line. */
export function materializeInsertion(
  context: EditorContext,
  offsets: { from: number; to: number },
  inserted: string,
  caretWithin = inserted.length,
  kind: EditKind = 'other'
): boolean {
  const insertion = emptyLineInsertion(context.state.getText(), offsets.from, inserted);
  applyEdit(
    context,
    offsets.from,
    offsets.to,
    insertion.replacement,
    insertion.caret - inserted.length + Math.min(caretWithin, inserted.length),
    kind,
    false
  );
  return true;
}
