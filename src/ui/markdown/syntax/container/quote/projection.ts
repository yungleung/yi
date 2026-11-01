/**
 * Projects quoted source into ordinary Markdown while preserving both offset maps.
 *
 * Example: `> - Parent\n>   - Child` projects to `- Parent\n  - Child`; moving a caret in either
 * string lands on the same source character in the other.
 *
 * May import: the quote-line model. Upholds: every source and projected offset, including the end,
 * has an inverse, and carrier removal never changes the child Markdown's indentation.
 */

import { quoteLineAt } from './lines';

/**
 * Whether the quote position at `offset` needs its exact block source.
 *
 * An ordinary quote is an editable container, just like a callout. Its complete source exposes
 * every carrier, escape marker, empty line and child delimiter to the same caret mapping.
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
