/**
 * Implements Enter through the text path by following the current block's line,
 * list, quote and container rule.
 *
 * Example: Enter after a list item continues its marker; Enter on an empty item
 * removes the marker, while Enter in a quote preserves the quote carrier.
 *
 * May import: the edit context, blank-line/list rules, quote and fenced-Div
 * rules, table-cell rule and the visible block resolver. Upholds: the resulting
 * document edit and caret are decided by the caret's block before the rebuild.
 */

import {
  continueListItem,
  exitBlankItem,
  startEmptyParagraphAbove,
  startEmptyParagraph,
  splitParagraph
} from './blank_lines';
import { applyEdit, quoteContextAt, type EditorContext } from './context';
import { editorSelection, rangeOffsets } from './selection';
import {
  isFenced,
  isQuoteLike,
  isRawRendered
} from '../document/block_kinds';
import {
  blankItemLineAt,
  hasChildBlock,
  itemContinuation,
  itemSubtreeEnd,
  lineSpanAt
} from '../syntax/lines';
import {
  enterInQuote,
  fenceNewlineWrite,
  fencedDivNewline,
  projectQuoteSource,
  quoteLineAt
} from '../syntax/container';
import { emptyCalloutNewline } from '../syntax/callout';
import { caretInTableCell } from './table';
import { blockAtCaret } from './text_command_context';

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
    // delimiter line takes the next character (see `syntax/container/fence_edits.ts`).
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
    if (block.kind === 'fencedDiv') {
      applyEdit(context, item.start, item.end, '', item.start);
      return true;
    }
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
