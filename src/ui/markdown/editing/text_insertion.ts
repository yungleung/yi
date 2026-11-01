/**
 * Inserts typed characters and committed input-method words through the text
 * path.
 *
 * Example: typing `(` after `[title]` replaces the caret with the paired `()`
 * and places the caret between them; a committed Chinese word is inserted as
 * one undo step.
 *
 * May import: the edit context, the block/container rules and the pure bracket,
 * fence and callout edits. Upholds: every insertion is a raw-document edit and
 * the block's own materialisation rule runs before a generic replacement.
 */

import { materializeInsertion } from './blank_lines';
import { applyEdit, placeCaret, type EditorContext } from './context';
import { editorSelection, rangeOffsets } from './selection';
import {
  isFenced,
  isQuoteLike,
  isRawRendered
} from '../document/block_kinds';
import {
  isOpeningBracket,
  pairingFor,
  skipClosingFor,
  type BracketEdit
} from '../syntax/brackets';
import {
  calloutBodyInsertion,
  calloutHasBody,
  materializeCalloutBody,
  materializeFencedDivBody,
  readCallout
} from '../syntax/callout';
import {
  emptyQuoteTyping,
  fenceTypedWrite,
  fencedDivAtOffset
} from '../syntax/container';
import { rangeInSourceText } from '../source_text';
import { insertFenceOpen } from './fence_open';
import { blockAtCaret } from './text_command_context';

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
    const relative = block === null ? 0 : offsets.from - block.charStart;
    const inPandocDiv =
      block !== null && fencedDivAtOffset(block.text, relative) !== null;
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
    pair = pairingFor(source, offsets.from, text, literal, !inPandocDiv);
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
    const div = fencedDivAtOffset(block.text, relative);
    if (
      callout === null &&
      div !== null &&
      div.bodyFrom === div.bodyTo &&
      relative === div.bodyFrom
    ) {
      const body = materializeFencedDivBody(
        block.text,
        relative,
        div,
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
  // the delimiter (see `syntax/container/fence_edits.ts`).
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
    // A closer can create a node the old text node cannot represent —
    // `[title](` becomes a link source as soon as `()` is paired. Rebuild the
    // block so source mode is decided from the inserted construct.
    applyEdit(context, pair.from, pair.to, pair.insert, pair.caret, kind, false);
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
  applyEdit(context, offsets.from, offsets.to, text, undefined, kind);
  return true;
}
