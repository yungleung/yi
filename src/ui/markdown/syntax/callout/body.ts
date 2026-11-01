/**
 * First-text materialisation for an empty GitHub alert or fenced Div body.
 *
 * Navigation may place a logical caret at an empty callout's body insertion
 * point without changing the source. The first typed character creates the
 * needed quoted line or Div body line in the same edit that inserts the text.
 *
 * May import: the callout source model and the shared quote-edit result.
 * Upholds: empty navigation is read-only, and the first source edit is a valid
 * body in either authoring form. A generic Pandoc Div uses the same Div path.
 */

import type { CalloutSource } from './model';
import {
  fencedDivAtOffset,
  type FencedDivSource
} from '../fenced_divs';
import type { QuoteEdit } from '../quote_edits';

/**
 * Enter on an empty fenced-Div callout's opening line.
 *
 * The ordinary paragraph rule would leave the caret against the closing fence.
 * GitHub alerts deliberately use that paragraph rule instead, so their first
 * Enter is the same two-line break as every other quoted paragraph.
 */
export function emptyCalloutNewline(text: string, offset: number): QuoteEdit | null {
  const div = fencedDivAtOffset(text, offset);
  if (
    div === null ||
    div.bodyFrom !== div.bodyTo
  ) {
    return null;
  }
  if (offset !== div.markerTo && offset !== div.bodyFrom) {
    return null;
  }
  const replacement = `\n${div.quotePrefix}`;
  return {
    edit: { from: div.markerTo, to: div.markerTo, replacement },
    caret: div.markerTo + replacement.length
  };
}

/** The edit that materialises a callout body and writes the first text. */
export function materializeCalloutBody(
  text: string,
  offset: number,
  callout: CalloutSource | null,
  typed: string,
  caretWithin = typed.length
): QuoteEdit | null {
  if (callout === null || typed === '') {
    return null;
  }
  const caretInBody = prefixedOffset(
    typed,
    Math.min(caretWithin, typed.length),
    callout.quotePrefix
  );

  if (callout.form === 'alert') {
    const prefix = callout.quotePrefix;
    const body = typed.replace(/\n/g, `\n${prefix}`);
    const replacement = `\n${prefix}${body}`;
    return {
      edit: { from: offset, to: offset, replacement },
      caret: offset + `\n${prefix}`.length + caretInBody
    };
  }

  return materializeFencedDivBody(text, offset, callout, typed, caretWithin);
}

/** The edit that writes the first text into an empty Div body. */
export function materializeFencedDivBody(
  text: string,
  offset: number,
  div: Pick<FencedDivSource, 'quoteDepth' | 'quotePrefix'> | null,
  typed: string,
  caretWithin = typed.length
): QuoteEdit | null {
  if (div === null || typed === '') {
    return null;
  }
  const caretInBody = prefixedOffset(
    typed,
    Math.min(caretWithin, typed.length),
    div.quotePrefix
  );
  let at = offset;
  if (
    div.quoteDepth > 0 &&
    text.slice(at, at + div.quotePrefix.length) === div.quotePrefix
  ) {
    at += div.quotePrefix.length;
  }
  const lineEndAt = text.indexOf('\n', at);
  const lineEnd = lineEndAt < 0 ? text.length : lineEndAt;
  const line = text.slice(at, lineEnd);
  if (line.trim() === '' && lineEndAt >= 0) {
    const replacement = typed.replace(/\n/g, `\n${div.quotePrefix}`);
    return {
      edit: { from: at, to: at, replacement },
      caret: at + caretInBody
    };
  }

  const body = typed.replace(/\n/g, `\n${div.quotePrefix}`);
  const replacement = `${body}\n`;
  return {
    edit: { from: at, to: at, replacement },
    caret: at + caretInBody
  };
}

/** A caret in `typed`, after every quote prefix the rewrite adds before it. */
function prefixedOffset(typed: string, caret: number, prefix: string): number {
  const beforeCaret = typed.slice(0, caret);
  const insertedPrefixes = beforeCaret.match(/\n/g)?.length ?? 0;
  return caret + insertedPrefixes * prefix.length;
}

