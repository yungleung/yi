/**
 * Reads blockquote carriers on source lines.
 *
 * Example: `quoteLineAt('> > note', 0)` returns depth `2`, a four-character prefix and `note`
 * content; the canonical carrier for that depth is `'> >'`.
 *
 * May import: shared line spans. Upholds: quote depth comes from the source's `>` characters,
 * optional delimiter spaces remain source, and one parser serves quote, callout and Div code.
 */

import { lineSpanAt } from '../../lines';

/** The parsed carrier shape at the start of one physical line. */
export interface QuotePrefix {
  depth: number;
  /** Offset just past the carrier, relative to the line start. */
  prefixEnd: number;
  content: string;
}

/** One source line and the quote carrier before its content. */
export interface QuoteLine {
  start: number;
  end: number;
  depth: number;
  prefixEnd: number;
  content: string;
}

/**
 * Read the quote carrier at the start of one physical line.
 *
 * Example: `'  > > note'` has depth `2`, with `'  > > '` as the source prefix.
 */
export function quotePrefix(source: string): QuotePrefix | null {
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
    depth,
    prefixEnd: index,
    content: source.slice(index)
  };
}

/**
 * The line before the caret, its depth, and content after the quote carriers.
 * Offsets at a newline belong to the line they end.
 */
export function quoteLineAt(text: string, offset: number): QuoteLine | null {
  const span = lineSpanAt(text, offset);
  const prefix = quotePrefix(text.slice(span.start, span.end));
  if (prefix === null) {
    return null;
  }
  return {
    ...span,
    depth: prefix.depth,
    prefixEnd: span.start + prefix.prefixEnd,
    content: prefix.content
  };
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
