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
 * Whether the quote position at `offset` needs its exact block source.
 *
 * A rendered quote has no caret target for a quoted empty line, and code/math
 * children hide the delimiter lines an Enter at their boundary must target.
 * Ordinary prose positions remain rendered.
 */
export function quoteNeedsSourceAt(text: string, offset: number): boolean {
  const current = quoteLineAt(text, offset);
  if (current === null) {
    return false;
  }
  if (current.content.trim() === '') {
    return true;
  }

  let fence: string | null = null;
  let displayMath = false;
  let at = 0;
  for (const sourceLine of text.split('\n')) {
    const quoted = quoteLineAt(text, at);
    const content = quoted?.content ?? sourceLine;
    if (at === current.start) {
      return (
        fence !== null ||
        displayMath ||
        openingFence(content) !== null ||
        content.trimStart().startsWith('$$')
      );
    }
    if (fence !== null) {
      if (content.trimStart().startsWith(fence[0])) {
        fence = null;
      }
    } else {
      const opened = openingFence(content);
      if (opened !== null) {
        fence = opened;
      } else if (displayMath) {
        if (content.trimEnd().endsWith('$$')) {
          displayMath = false;
        }
      } else if (content.trimStart().startsWith('$$')) {
        const open = content.indexOf('$$');
        displayMath = !(
          content.indexOf('$$', open + 2) >= 0 &&
          content.trimEnd().endsWith('$$')
        );
      }
    }
    at += sourceLine.length + 1;
  }
  return false;
}

/** A quote document with its carrier prefixes removed, plus offset maps both ways. */
export interface QuoteProjection {
  text: string;
  /** Source offset for every projected offset, including the end. */
  sourceOffsets: number[];
  /** Projected offset for every source offset, including the end. */
  projectedOffsets: number[];
}

/** Remove every blockquote carrier while preserving a two-way offset map. */
export function projectQuoteSource(source: string): QuoteProjection {
  const sourceOffsets = new Array<number>(source.length + 1);
  const projectedOffsets = new Array<number>(source.length + 1);
  let projected = '';
  let at = 0;
  for (const sourceLine of source.split('\n')) {
    const quoted = quoteLineAt(source, at);
    const contentStart = quoted?.prefixEnd ?? at;
    for (let index = at; index < contentStart; index += 1) {
      projectedOffsets[index] = projected.length;
    }
    const content = source.slice(contentStart, at + sourceLine.length);
    for (let index = 0; index < content.length; index += 1) {
      sourceOffsets[projected.length] = contentStart + index;
      projectedOffsets[contentStart + index] = projected.length;
      projected += content[index];
    }
    sourceOffsets[projected.length] = at + sourceLine.length;
    projectedOffsets[at + sourceLine.length] = projected.length;
    if (at + sourceLine.length < source.length) {
      projected += '\n';
    }
    at += sourceLine.length + 1;
  }
  sourceOffsets[projected.length] = source.length;
  projectedOffsets[source.length] = projected.length;
  return { text: projected, sourceOffsets, projectedOffsets };
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

