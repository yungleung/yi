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
  rangeOffsets,
  restoreCaret,
  type EditorContext
} from './context';
import { isRawRendered } from '../blocks';
import { blankItemLineAt, lineSpanAt } from '../syntax/lines';
import { caretInTableCell, tableDeleteIsNoop } from './table';

/** Inserts typed text at the caret, replacing any selection. */
export function insertText(context: EditorContext, text: string): boolean {
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
  applyEdit(context, offsets.from, offsets.to, text);
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
  applyEdit(context, removal.from, removal.to, '', from);
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
