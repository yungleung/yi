/**
 * Pure line edits inside blockquotes, GitHub-style callouts and callout Divs.
 *
 * The active quote depth is supplied by the editor. Paragraph breaks use the
 * full prefix chain, a second Enter removes exactly one level, and completed
 * child blocks need one prefixed separator. Blank carriers are deleted as
 * physical lines, and typing preserves exactly the delimiter space in source.
 * List, table, code and equation contexts are declined so their own editing
 * rules stay authoritative.
 *
 * May import: text-edit shapes and the callout source model. Upholds: every
 * result is one raw-text replacement, and prefixes are read from source rather
 * than invented by the UI.
 */

import type { TextEdit } from './edit_range';
import { readCallout } from './callouts';

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
  const callout = readCallout(text);
  if (
    callout?.form !== 'div' ||
    offset < callout.bodyFrom ||
    offset > callout.bodyTo
  ) {
    return null;
  }
  const current = quoteLineAt(text, offset);
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
 * An ordinary quote is an editable container, just like a callout. Its
 * complete source is the shape that exposes every carrier, escape marker,
 * empty line and child delimiter to the same one-to-one caret mapping.
 */
export function quoteNeedsSourceAt(text: string, offset: number): boolean {
  return quoteLineAt(text, offset) !== null;
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

