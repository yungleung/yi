/**
 * Pure line edits inside blockquotes, GitHub-style callouts and Pandoc Divs.
 *
 * The active quote depth is supplied by the editor. Paragraph breaks use the
 * full prefix chain, a second Enter removes exactly one level, and completed
 * child blocks need one prefixed separator. Blank carriers are deleted as
 * physical lines, and typing preserves exactly the delimiter space in source.
 * List, table, code and equation contexts are declined so their own editing
 * rules stay authoritative.
 *
 * May import: text-edit shapes, shared line rules, the quote-line model and fenced-Div ranges.
 * Upholds: every result is one raw-text replacement, and prefixes are read from source rather
 * than invented by the UI.
 */

import type { TextEdit } from '../../edit_range';
import { fencedDivAtOffset } from '../divs';
import { isBlankItemLine, itemContinuation, lineSpanAt } from '../../lines';
import { quoteCarrier, quoteLineAt, type QuoteLine } from './lines';

/** One quote edit and the caret position after it. */
export interface QuoteEdit {
  edit: TextEdit;
  caret: number;
}

/** The child block that owns Enter before the quote layer wraps its output. */
export type QuoteChildContext =
  | 'paragraph'
  | 'completed-child'
  | 'list'
  | 'table'
  | 'code'
  | 'equation';

/** The Enter edit for one quote context, or null when the child block owns it. */
export function enterInQuote(
  text: string,
  offset: number,
  depth: number,
  context: QuoteChildContext
): QuoteEdit | null {
  if (
    context === 'list' ||
    context === 'table' ||
    context === 'code' ||
    context === 'equation'
  ) {
    return null;
  }

  const activeDepth = Math.max(1, Math.floor(depth));
  const prefix = quoteCarrier(activeDepth);
  const current = quoteLineAt(text, offset);

  const emptyRun = current === null ? null : emptyQuoteRunBeforeCursor(text, current, offset);
  if (emptyRun !== null) {
    const remaining = quoteCarrier(activeDepth - 1);
    const replacement = Array.from(
      { length: emptyRun.count },
      () => `\n${remaining}`
    ).join('');
    return {
      edit: {
        from: emptyRun.from,
        to: offset,
        replacement
      },
      caret: emptyRun.from + replacement.length
    };
  }

  const tail = current === null ? '' : text.slice(offset, current.end);
  const separator = tail === '' || /^\s/.test(tail) ? '' : ' ';
  const replacement = `\n${prefix}\n${prefix}${separator}`;
  return {
    edit: { from: offset, to: offset, replacement },
    caret: offset + replacement.length
  };
}

/**
 * Typing the first text on an empty quoted line.
 *
 * The delimiter space is source, not UI chrome. A line written as `>` gains
 * exactly the typed character; a line written as `> ` keeps its visible space.
 */
export function emptyQuoteTyping(
  text: string,
  offset: number,
  typed: string
): QuoteEdit | null {
  const current = quoteLineAt(text, offset);
  if (
    current === null ||
    current.content !== '' ||
    offset !== current.end ||
    typed === ''
  ) {
    return null;
  }
  const prefix = text.slice(current.start, current.prefixEnd);
  const replacement = typed.replace(/\n/g, `\n${prefix}`);
  return {
    edit: { from: offset, to: offset, replacement },
    caret: offset + replacement.length
  };
}

/**
 * Removing a blank quote line as one physical line.
 *
 * A blank carrier such as `>` is the line, not a character the reader should
 * have to erase one key at a time. Its newline goes with it; when it is the
 * final line, the preceding newline goes instead.
 */
export function deleteBlankQuoteLine(text: string, offset: number): QuoteEdit | null {
  const line = quoteLineAt(text, offset);
  if (line === null || line.content.trim() !== '') {
    return null;
  }
  const followsLine = line.end < text.length;
  const from = followsLine ? line.start : Math.max(0, line.start - 1);
  const to = followsLine ? line.end + 1 : line.end;
  return {
    edit: { from, to, replacement: '' },
    caret: from
  };
}

/**
 * Enter in a fenced-Div callout body: one newline, wherever the caret is.
 *
 * Unlike a paragraph split, a Div accepts any number of consecutive blank
 * lines. A quoted Div also keeps the exact quote carrier visible on its line.
 */
export function fencedDivNewline(text: string, offset: number): QuoteEdit | null {
  const div = fencedDivAtOffset(text, offset);
  if (
    div === null ||
    offset < div.bodyFrom ||
    offset > div.bodyTo
  ) {
    return null;
  }
  const current = quoteLineAt(text, offset);
  const plainLine = lineSpanAt(text, offset);
  const content = current?.content ?? text.slice(plainLine.start, plainLine.end);
  if (
    isBlankItemLine(content) ||
    itemContinuation(content) !== null
  ) {
    return null;
  }
  const prefix =
    current === null ? '' : text.slice(current.start, current.prefixEnd);
  const replacement = `\n${prefix}`;
  return {
    edit: { from: offset, to: offset, replacement },
    caret: offset + replacement.length
  };
}

/** Add a full quote prefix to every physical line produced by a child edit. */
export function prefixInsertedLines(prefix: string, inserted: string): string {
  if (inserted === '') {
    return '';
  }
  const linePrefix = prefix.endsWith(' ') ? prefix : `${prefix} `;
  return inserted
    .split('\n')
    .map((line) => `${linePrefix}${line}`)
    .join('\n');
}

/**
 * Prefix every new physical line after a line break in an insertion.
 *
 * Unlike {@link prefixInsertedLines}, this leaves the text before the first
 * newline alone: it is being inserted at the caret on the current line.
 */
export function prefixInsertedBreaks(
  prefix: string,
  inserted: string,
  caret: number
): { replacement: string; caret: number } {
  const linePrefix = prefix.endsWith(' ') ? prefix : `${prefix} `;
  const replacement = inserted.replace(/\n/g, `\n${linePrefix}`);
  const breaksBeforeCaret = inserted
    .slice(0, Math.max(0, Math.min(caret, inserted.length)))
    .split('\n').length - 1;
  return {
    replacement,
    caret: caret + breaksBeforeCaret * linePrefix.length
  };
}

/**
 * The contiguous empty quote lines ending at the caret. The edit starts at the
 * previous content line's end so each empty carrier is replaced as one run.
 */
function emptyQuoteRunBeforeCursor(
  text: string,
  current: QuoteLine,
  offset: number
): { from: number; count: number } | null {
  if (offset < current.start || offset > current.end || current.content.trim() !== '') {
    return null;
  }

  const first = current;
  let count = 1;
  let previousEnd = first.start;
  let contentEnd = Math.max(0, current.start - 1);
  while (previousEnd > 0 && count < 2) {
    const previousBreak = text.lastIndexOf('\n', previousEnd - 2);
    const previousStart = previousBreak + 1;
    const previousStop = previousEnd - 1;
    const previous = quoteLineAt(text, previousStart);
    if (
      previous === null ||
      previous.end !== previousStop ||
      previous.depth !== first.depth ||
      previous.content.trim() !== ''
    ) {
      break;
    }
    count += 1;
    previousEnd = previousStart;
    contentEnd = previousStart - 1;
  }

  return { from: contentEnd, count };
}

