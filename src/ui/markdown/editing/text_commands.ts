/**
 * Text-editing commands: typing, deleting, splitting lines and task markers.
 *
 * All of them are expressed as raw-document edits so they behave the same
 * wherever the caret sits, including in blocks that had to be re-rendered.
 *
 * May import: the editing context, the pure line and list rules beside it
 * (`./blank_lines`, `./blank_item`), the table's cell rules and the block model.
 * Upholds: the document text is the only source of truth — typing, deleting and
 * splitting are all one range replacement.
 */

import { deleteBlankItem } from './blank_item';
import {
  characterRemoval,
  continueListItem,
  deleteEmptyParagraph,
  exitBlankItem,
  materializeInsertion,
  splitParagraph,
  startEmptyParagraphAbove,
  startEmptyParagraph
} from './blank_lines';
import {
  applyEdit,
  caretOffset,
  editorSelection,
  placeCaret,
  rangeOffsets,
  restoreCaret,
  type EditorContext
} from './context';
import { isFenced, isRawRendered } from '../document/blocks';
import { blankItemLineAt, lineSpanAt } from '../syntax/lines';
import { caretInTableCell, tableDeleteIsNoop } from './table';
import { pairAround, pairingFor, skipClosingFor } from '../syntax/brackets';
import { fenceTypedWrite, fenceNewlineWrite } from '../syntax/fence_edits';

/** Inserts typed text at the caret, replacing any selection. */
export function insertText(context: EditorContext, text: string): boolean {
  return insertAt(context, text, true);
}

/**
 * Inserts a word the system committed — an input method, dictation, the emoji panel.
 *
 * The block's own rules are the ones typing follows: an empty paragraph materializes
 * its line, a display formula's content gets a line of its own. What it does not do is
 * pair a bracket: the characters are the author's own text, and a `]` the app added
 * around them would be a second editor's opinion. And its edit is not `typing`, which
 * is what makes one undo take the whole word (`history.ts`: a multi-character
 * insertion is a step of its own).
 */
export function insertCommitted(context: EditorContext, text: string): boolean {
  return insertAt(context, text, false);
}

/** The one text path: the block's rules first, then a bracket's pair or the text. */
function insertAt(context: EditorContext, text: string, brackets: boolean): boolean {
  const range = editorSelection(context, true);
  if (!range) {
    return false;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return false;
  }
  const block = context.state.getBlockAtOffset(offsets.from);
  if (block?.kind === 'blank' && offsets.from === offsets.to) {
    return materializeInsertion(context, offsets, text);
  }
  // A character typed at the end of a fenced block's body belongs *in* the body: written where the
  // caret is, it would land on the closing delimiter's own line, which the parser reads as part of
  // the delimiter (see `syntax/fence_edits.ts`).
  if (block && isFenced(block.kind) && offsets.from === offsets.to) {
    const write = fenceTypedWrite(block.text, offsets.from - block.charStart, text);
    if (write) {
      applyEdit(
        context,
        block.charStart + write.from,
        block.charStart + write.to,
        write.replacement,
        block.charStart + write.caret,
        brackets ? 'typing' : 'other'
      );
      return true;
    }
  }
  // A bracket writes its pair where prose is being written — not inside a code block or a
  // formula, where the characters are the author's own source (`syntax/brackets.ts`).
  if (brackets && offsets.from === offsets.to) {
    const literal = block?.kind === 'fencedCode' || block?.kind === 'displayMath';
    const source = context.state.getText();
    if (skipClosingFor(source, offsets.from, text, literal)) {
      // The author typed the bracket they can see: they move past it rather than writing another.
      placeCaret(context, offsets.from + 1);
      return true;
    }
    const pair = pairingFor(source, offsets.from, text, literal);
    if (pair) {
      applyEdit(context, pair.from, pair.to, pair.insert, pair.caret, 'typing');
      return true;
    }
  }
  applyEdit(context, offsets.from, offsets.to, text, undefined, brackets ? 'typing' : 'other');
  return true;
}

/** Deletes one character before (backspace) or after (delete) the caret. */
export function deleteText(context: EditorContext, forward: boolean): boolean {
  const range = editorSelection(context, true);
  if (!range) {
    return false;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return false;
  }
  let { from, to } = offsets;
  if (from === to) {
    // A pair the app wrote goes whole: a mistyped `[` should not leave its `]` behind.
    const pair = forward ? null : pairAround(context.state.getText(), from);
    if (pair) {
      applyEdit(context, pair.from, pair.to, '', pair.from, 'typing');
      return true;
    }
    // A caret in a table cell deletes inside its own cell only: at the cell's
    // edges there is nothing left to delete that belongs to the cell, and
    // eating a pipe or the neighbouring cell is never what the author meant.
    if (tableDeleteIsNoop(context, forward)) {
      return true;
    }
    // An empty list item is a whole line, not a character to nibble at.
    if (deleteBlankItem(context, from)) {
      return true;
    }
    if (deleteEmptyParagraph(context, from)) {
      return true;
    }
    if (forward) {
      to = Math.min(context.state.getText().length, to + 1);
    } else {
      from = Math.max(0, from - 1);
    }
  }
  if (from === to) {
    return false;
  }
  const removal = characterRemoval(context.state.getText(), from, to);
  applyEdit(context, removal.from, removal.to, '', from, 'deleting');
  return true;
}

/** Splits the current line, following the rule for each kind of block. */
export function insertNewline(context: EditorContext): boolean {
  const range = editorSelection(context, true);
  if (!range) {
    return false;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return false;
  }
  // Enter in a table cell would split the row and shred the table: a cell holds
  // text, not lines.
  if (caretInTableCell(context)) {
    return true;
  }
  const block = context.state.getBlockAtOffset(offsets.from);
  if (!block) {
    return false;
  }
  // Code, math and other raw-rendered blocks keep their own line structure.
  if (isRawRendered(block.kind) || block.kind === 'displayMath') {
    // `Enter` in a fenced block with no content yet makes the body's first line, so neither
    // delimiter line takes the next character (see `syntax/fence_edits.ts`).
    const write = isFenced(block.kind)
      ? fenceNewlineWrite(block.text, offsets.from - block.charStart)
      : null;
    if (write) {
      applyEdit(
        context,
        block.charStart + write.from,
        block.charStart + write.to,
        write.replacement,
        block.charStart + write.caret
      );
      return true;
    }
    applyEdit(context, offsets.from, offsets.to, '\n');
    return true;
  }
  // An empty paragraph splits in two: the author asked for another line.
  if (block.kind === 'blank') {
    applyEdit(context, offsets.from, offsets.to, '\n');
    return true;
  }
  const source = context.state.getText();
  const item = blankItemLineAt(source, offsets.from);
  if (item) {
    return exitBlankItem(context, item);
  }
  if (continueListItem(context, lineSpanAt(source, offsets.from), offsets)) {
    return true;
  }
  // The start of a block gets an empty paragraph above it, the mirror of the
  // end of a block getting one below.
  if (offsets.from === block.charStart) {
    return startEmptyParagraphAbove(context, block, offsets);
  }
  if (offsets.from >= block.charEnd) {
    return startEmptyParagraph(context, block, offsets);
  }
  return splitParagraph(context, offsets);
}

/**
 * Toggles a task-list item's checkbox by rewriting its `[ ]`/`[x]` marker,
 * keeping the caret where the user left it.
 */
export function toggleTask(context: EditorContext, checkbox: HTMLInputElement): boolean {
  const item = checkbox.closest<HTMLElement>('[data-task-source-from]');
  const blockElement = item?.closest<HTMLElement>('.markdown-block');
  const relativeStart = Number(item?.dataset.taskSourceFrom);
  if (!item || !blockElement || !Number.isFinite(relativeStart)) {
    return false;
  }
  const block = context.state.getBlockAtLine(Number(blockElement.dataset.lineStart));
  if (!block) {
    return false;
  }
  const source = context.state.getText();
  const lineStart = block.charStart + relativeStart;
  const lineEnd = source.indexOf('\n', lineStart);
  const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
  const marker = /^(\s*(?:[-+*]|\d+[.)])\s+)\[([ xX])\]/.exec(line);
  if (!marker) {
    return false;
  }
  const markerOffset = lineStart + marker[1].length;
  const previousCaret = caretOffset(context);
  context.state.replaceRange(markerOffset + 1, markerOffset + 2, marker[2].toLowerCase() === 'x' ? ' ' : 'x');
  context.renderer.renderChanged();
  if (previousCaret !== null) {
    restoreCaret(context, previousCaret > markerOffset ? previousCaret : markerOffset + 3);
  }
  return true;
}
