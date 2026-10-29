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
  itemContinuation,
  materializeInsertion,
  splitParagraph,
  startEmptyParagraphAbove,
  startEmptyParagraph
} from './blank_lines';
import {
  applyEdit,
  caretOffset,
  placeCaret,
  quoteContextAt,
  restoreCaret,
  type EditorContext
} from './context';
import { editorSelection, rangeOffsets } from './selection';
import { isFenced, isQuoteLike, isRawRendered } from '../document/block_kinds';
import { blankItemLineAt, hasChildBlock, itemSubtreeEnd, lineSpanAt } from '../syntax/lines';
import { caretInTableCell, tableDeleteIsNoop } from './table';
import {
  isOpeningBracket,
  pairAround,
  pairingFor,
  skipClosingFor,
  type BracketEdit
} from '../syntax/brackets';
import { fenceTypedWrite, fenceNewlineWrite } from '../syntax/fence_edits';
import { insertFenceOpen } from './fence_open';
import { rangeInSourceText } from '../source_text';
import {
  calloutHasBody,
  calloutBodyInsertion,
  readCallout
} from '../syntax/callouts';
import { emptyCalloutNewline, materializeCalloutBody } from '../syntax/callout_body';
import {
  deleteBlankQuoteLine,
  emptyQuoteTyping,
  enterInQuote,
  fencedDivNewline,
  projectQuoteSource,
  quoteLineAt
} from '../syntax/quote_edits';

/**
 * The block holding the rendered caret.
 *
 * At a shared character boundary a blank block and the block before it can
 * carry the same offset. The DOM names the line the caret is visibly on, so
 * the text path uses that before falling back to an offset lookup.
 */
function blockAtCaret(
  context: EditorContext,
  range: Range,
  offset: number
) {
  const start = range.startContainer;
  const element =
    start.nodeType === Node.ELEMENT_NODE
      ? (start as Element)
      : start.parentElement;
  const blockElement = element?.closest<HTMLElement>('.markdown-block') ?? null;
  const lineStart = Number(blockElement?.dataset.lineStart);
  const block = Number.isFinite(lineStart)
    ? context.state.getBlockAtLine(lineStart)
    : null;
  return block ?? context.state.getBlockAtOffset(offset);
}

/** Inserts typed text at the caret, replacing any selection. */
export function insertText(context: EditorContext, text: string): boolean {
  return insertAt(context, text, 'typing');
}

/**
 * Inserts a word the system committed — an input method, dictation, the emoji panel.
 *
 * The block's own rules are the ones typing follows: an empty paragraph materializes
 * its line, a display formula's content gets a line of its own. A single committed
 * bracket follows the same pairing rule as the key path; a committed word is still
 * inserted literally. Its edit is not `typing`, which is what makes one undo take the
 * whole word (`history.ts`: a multi-character insertion is a step of its own).
 */
export function insertCommitted(context: EditorContext, text: string): boolean {
  return insertAt(context, text, 'commit');
}

/** The one text path: the block's rules first, then a bracket's pair or the text. */
function insertAt(
  context: EditorContext,
  text: string,
  kind: 'typing' | 'commit'
): boolean {
  const range = editorSelection(context, true);
  if (!range) {
    return false;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return false;
  }
  const block = blockAtCaret(context, range, offsets.from);
  const sourceText = rangeInSourceText(range);
  let pair: BracketEdit | null = null;
  if (offsets.from === offsets.to) {
    const containerSource = block?.kind === 'quote' || block?.kind === 'fencedDiv';
    const literal =
      (!containerSource && sourceText) ||
      block?.kind === 'fencedCode' ||
      block?.kind === 'displayMath' ||
      block?.kind === 'equation';
    const source = context.state.getText();
    if (skipClosingFor(source, offsets.from, text, literal)) {
      placeCaret(context, offsets.from + 1);
      return true;
    }
    pair = pairingFor(source, offsets.from, text, literal);
  }
  const materializedPair = isOpeningBracket(text) ? pair : null;
  const inserted = materializedPair?.insert ?? text;
  const caretWithin = materializedPair
    ? materializedPair.caret - offsets.from
    : text.length;
  if (block?.kind === 'blank' && offsets.from === offsets.to) {
    return materializeInsertion(context, offsets, inserted, caretWithin, kind);
  }
  if (block && offsets.from === offsets.to) {
    const callout = readCallout(block.text);
    const relative = Math.min(offsets.from - block.charStart, block.text.length);
    if (
      callout !== null &&
      !calloutHasBody(callout) &&
      callout.bodyFrom === callout.bodyTo &&
      relative === calloutBodyInsertion(callout)
    ) {
      const body = materializeCalloutBody(
        block.text,
        relative,
        callout,
        inserted,
        caretWithin
      );
      if (body !== null) {
        applyEdit(
          context,
          block.charStart + body.edit.from,
          block.charStart + body.edit.to,
          body.edit.replacement,
          block.charStart + body.caret,
          kind
        );
        return true;
      }
    }
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
        kind
      );
      return true;
    }
  }
  // A backtick on an empty quote line starts a possible fence. The first
  // character must stay literal, as it does on an empty paragraph; pairing it
  // immediately puts the caret inside the closer and prevents the next two
  // backticks from completing the delimiter line.
  if (
    block &&
    isQuoteLike(block.kind) &&
    offsets.from === offsets.to &&
    text === '`'
  ) {
    const relative = Math.min(offsets.from - block.charStart, block.text.length);
    const write = emptyQuoteTyping(block.text, relative, text);
    if (write !== null) {
      applyEdit(
        context,
        block.charStart + write.edit.from,
        block.charStart + write.edit.to,
        write.edit.replacement,
        block.charStart + write.caret,
        'typing'
      );
      return true;
    }
  }
  // What a delimiter line becomes when the write completes it: the fenced block it names, both
  // delimiter lines at once (`editing/fence_open.ts`). The pair a backtick writes counts — ` `` `
  // plus the pair is a fence's ` ``` ` — so the rule sees what would be written, not the key alone.
  if (
    block !== null &&
    !isRawRendered(block.kind) &&
    offsets.from === offsets.to &&
    insertFenceOpen(context, offsets.from, inserted, block)
  ) {
    return true;
  }
  if (pair) {
    applyEdit(context, pair.from, pair.to, pair.insert, pair.caret, kind);
    return true;
  }
  if (block && isQuoteLike(block.kind) && offsets.from === offsets.to) {
    const relative = Math.min(offsets.from - block.charStart, block.text.length);
    const write = emptyQuoteTyping(block.text, relative, text);
    if (write !== null) {
      applyEdit(
        context,
        block.charStart + write.edit.from,
        block.charStart + write.edit.to,
        write.edit.replacement,
        block.charStart + write.caret,
        kind
      );
      return true;
    }
  }
  applyEdit(
    context,
    offsets.from,
    offsets.to,
    text,
    undefined,
    kind
  );
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
    const block = blockAtCaret(context, range, from);
    if (block !== null && isQuoteLike(block.kind)) {
      const deletion = deleteBlankQuoteLine(
        block.text,
        Math.min(from - block.charStart, block.text.length)
      );
      if (deletion !== null) {
        applyEdit(
          context,
          block.charStart + deletion.edit.from,
          block.charStart + deletion.edit.to,
          '',
          block.charStart + deletion.caret,
          'deleting'
        );
        return true;
      }
    }
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
  const block = blockAtCaret(context, range, offsets.from);
  if (!block) {
    return false;
  }
  const relativeNewline = Math.min(offsets.from - block.charStart, block.text.length);
  if (offsets.from === offsets.to) {
    const emptyCallout = emptyCalloutNewline(block.text, relativeNewline);
    if (emptyCallout !== null) {
      applyEdit(
        context,
        block.charStart + emptyCallout.edit.from,
        block.charStart + emptyCallout.edit.to,
        emptyCallout.edit.replacement,
        block.charStart + emptyCallout.caret
      );
      return true;
    }
  }
  if (isQuoteLike(block.kind) && offsets.from === offsets.to) {
    const relative = relativeNewline;
    const div = fencedDivNewline(block.text, relative);
    if (div !== null) {
      applyEdit(
        context,
        block.charStart + div.edit.from,
        block.charStart + div.edit.to,
        div.edit.replacement,
        block.charStart + div.caret
      );
      return true;
    }
    const quote = quoteContextAt(context.state, block, offsets.from);
    const line = quoteLineAt(block.text, relative);
    if (quote !== null && line !== null) {
      const rawPrefix = block.text.slice(line.start, line.prefixEnd);
      const projected = projectQuoteSource(block.text);
      const projectedOffset =
        projected.projectedOffsets[relative] ?? projected.text.length;
      const projectedLine = lineSpanAt(projected.text, projectedOffset);
      const continuation = itemContinuation(
        projected.text.slice(projectedLine.start, projectedLine.end)
      );
      if (continuation !== null) {
        const afterSubtree =
          projectedOffset === projectedLine.end &&
          hasChildBlock(projected.text, projectedLine);
        const projectedFrom = afterSubtree
          ? itemSubtreeEnd(projected.text, projectedLine)
          : projectedOffset;
        const relativeFrom =
          projected.sourceOffsets[projectedFrom] ?? relative;
        const from = block.charStart + relativeFrom;
        const replacement = `\n${rawPrefix}${continuation.slice(1)}`;
        applyEdit(
          context,
          from,
          offsets.to,
          replacement,
          from + replacement.length
        );
        return true;
      }
      if (blankItemLineAt(projected.text, projectedOffset) !== null) {
        applyEdit(
          context,
          block.charStart + line.prefixEnd,
          block.charStart + line.end,
          '',
          block.charStart + line.prefixEnd
        );
        return true;
      } else if (quote.child === 'code' || quote.child === 'equation') {
        const tail = block.text.slice(relative, line.end);
        const replacement = `\n${rawPrefix}${tail}`;
        applyEdit(context, offsets.from, offsets.to, replacement);
        return true;
      } else {
        const edit = enterInQuote(
          block.text,
          relative,
          quote.depth,
          quote.child
        );
        if (edit !== null) {
          applyEdit(
            context,
            block.charStart + edit.edit.from,
            block.charStart + edit.edit.to,
            edit.edit.replacement,
            block.charStart + edit.caret
          );
          return true;
        }
      }
    }
  }
  if (block.kind === 'fencedDiv' && offsets.from === offsets.to) {
    const write = fencedDivNewline(
      block.text,
      relativeNewline
    );
    if (write !== null) {
      applyEdit(
        context,
        block.charStart + write.edit.from,
        block.charStart + write.edit.to,
        write.edit.replacement,
        block.charStart + write.caret
      );
      return true;
    }
  }
  // Code, math, frontmatter and the other raw-rendered blocks keep their own line structure.
  if (isRawRendered(block.kind)) {
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
    // `Enter` at the block's own end makes a line *after* it: the same newline, but the caret
    // belongs on the empty paragraph it made rather than on the separator line in front of it
    // (`blank_lines.ts: startEmptyParagraph` is the one rule for that).
    if (offsets.from >= block.charEnd) {
      return startEmptyParagraph(context, block, offsets);
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
