/**
 * Pure Enter edits inside blockquotes and GitHub-style callouts.
 *
 * The active quote depth is supplied by the editor. Paragraph breaks use the
 * full prefix chain, a second Enter removes exactly one level, and completed
 * child blocks need one prefixed separator. List, table, code and equation
 * contexts are declined so their own editing rules stay authoritative.
 *
 * May import: the text-edit shape only. Upholds: every result is one raw-text
 * replacement, and quote prefixes are derived from depth rather than folded
 * into child-command logic.
 */

import type { TextEdit } from './edit_range';
import { openingFence } from './markers';

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

/** One source line and the quote carrier before its content. */
export interface QuoteLine {
  start: number;
  end: number;
  depth: number;
  prefixEnd: number;
  content: string;
}

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
  if (context === 'completed-child') {
    const tail = current === null ? '' : text.slice(offset, current.end);
    const replacement = `\n${prefix}${tail === '' || /^\s/.test(tail) ? '' : ' '}`;
    return {
      edit: { from: offset, to: offset, replacement },
      caret: offset + replacement.length
    };
  }

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

/** The canonical source prefix for a quote depth, without a trailing space. */
export function quoteCarrier(depth: number): string {
  return '> '.repeat(Math.max(0, Math.floor(depth))).trimEnd();
}

/** The quote depth and canonical prefix on the line at `offset`, or null outside a quote. */
export function quotePrefixAt(
  text: string,
  offset: number
): { depth: number; prefix: string } | null {
  const line = quoteLineAt(text, offset);
  return line === null ? null : { depth: line.depth, prefix: quoteCarrier(line.depth) };
}

/**
 * Whether a quote needs its exact source surface while edited.
 *
 * Prism queries cannot paint a quoted empty line, and code/math children hide
 * the fence lines an Enter at their boundary must target. Ordinary prose
 * quotes remain rendered.
 */
export function quoteNeedsSource(text: string): boolean {
  let offset = 0;
  for (const line of text.split('\n')) {
    const quoted = quoteLineAt(text, offset);
    if (quoted !== null) {
      const content = quoted.content.trimEnd();
      if (
        content.trim() === '' ||
        content.trimStart().startsWith('$$') ||
        openingFence(content)
      ) {
        return true;
      }
    }
    offset += line.length + 1;
  }
  return false;
}

/**
 * The line before the caret, its depth, and content after the quote carriers.
 * Offsets at a newline belong to the line they end.
 */
export function quoteLineAt(text: string, offset: number): QuoteLine | null {
  const at = Math.min(Math.max(0, offset), text.length);
  const start = text.lastIndexOf('\n', Math.max(0, at - 1)) + 1;
  const newline = text.indexOf('\n', at);
  const end = newline < 0 ? text.length : newline;
  const source = text.slice(start, end);

  let index = 0;
  while (index < Math.min(3, source.length) && source[index] === ' ') {
    index += 1;
  }
  if (source[index] !== '>') {
    return null;
  }

  let depth = 0;
  while (source[index] === '>') {
    depth += 1;
    index += 1;
    if (source[index] === ' ') {
      index += 1;
    }
  }
  return {
    start,
    end,
    depth,
    prefixEnd: start + index,
    content: text.slice(start + index, end)
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

  let first = current;
  let count = 1;
  let previousEnd = first.start;
  let contentEnd = Math.max(0, current.start - 1);
  while (previousEnd > 0 && count < 2) {
    const previousBreak = text.lastIndexOf('\n', previousEnd - 2);
    const previousStart = previousBreak + 1;
    const previousStop = previousEnd - 1;
    const previousSource = text.slice(previousStart, previousStop);
    let index = 0;
    while (index < Math.min(3, previousSource.length) && previousSource[index] === ' ') {
      index += 1;
    }
    if (previousSource[index] !== '>') {
      break;
    }
    let depth = 0;
    while (previousSource[index] === '>') {
      depth += 1;
      index += 1;
      if (previousSource[index] === ' ') {
        index += 1;
      }
    }
    if (depth !== first.depth || previousSource.slice(index).trim() !== '') {
      break;
    }
    count += 1;
    previousEnd = previousStart;
    contentEnd = previousStart - 1;
  }

  return { from: contentEnd, count };
}

