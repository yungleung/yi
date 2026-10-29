/**
 * First-text materialisation for an empty callout body.
 *
 * Navigation may place a logical caret at an empty callout's body insertion
 * point without changing the source. The first typed character creates the
 * needed quoted line or Div body line in the same edit that inserts the text.
 *
 * May import: the callout source model and the shared quote-edit result.
 * Upholds: empty navigation is read-only, and the first source edit is a valid
 * callout body in either authoring form.
 */

import { calloutAtOffset, type CalloutSource } from './callouts';
import type { QuoteEdit } from './quote_edits';

/**
 * Enter on an empty callout's opening marker.
 *
 * GitHub alerts and fenced Divs both need one quoted body line between their
 * marker and the next source line. The ordinary paragraph rule would add a
 * second separator for an alert, or leave the caret against a Div's closing
 * fence.
 */
export function emptyCalloutNewline(text: string, offset: number): QuoteEdit | null {
  const callout = calloutAtOffset(text, offset);
  if (callout === null || callout.bodyFrom !== callout.bodyTo) {
    return null;
  }
  const openingEnd = callout.form === 'alert' ? callout.bodyFrom : callout.markerTo;
  if (offset !== openingEnd && !(callout.form === 'div' && offset === callout.bodyFrom)) {
    return null;
  }
  const at = callout.form === 'alert' ? callout.bodyFrom : callout.markerTo;
  const replacement = `\n${callout.quotePrefix}`;
  return {
    edit: { from: at, to: at, replacement },
    caret: at + replacement.length
  };
}

/** The edit that materialises a callout body and writes the first text. */
export function materializeCalloutBody(
  text: string,
  offset: number,
  callout: CalloutSource | null,
  typed: string
): QuoteEdit | null {
  if (callout === null || typed === '') {
    return null;
  }

  if (callout.form === 'alert') {
    const prefix = callout.quotePrefix;
    const body = typed.replace(/\n/g, `\n${prefix}`);
    const replacement = `\n${prefix}${body}`;
    return {
      edit: { from: offset, to: offset, replacement },
      caret: offset + replacement.length
    };
  }

  let at = offset;
  if (
    callout.quoteDepth > 0 &&
    text.slice(at, at + callout.quotePrefix.length) === callout.quotePrefix
  ) {
    at += callout.quotePrefix.length;
  }
  const lineEndAt = text.indexOf('\n', at);
  const lineEnd = lineEndAt < 0 ? text.length : lineEndAt;
  const line = text.slice(at, lineEnd);
  if (line.trim() === '' && lineEndAt >= 0) {
    const replacement = typed.replace(/\n/g, `\n${callout.quotePrefix}`);
    return {
      edit: { from: at, to: at, replacement },
      caret: at + replacement.length
    };
  }

  const body = typed.replace(/\n/g, `\n${callout.quotePrefix}`);
  const replacement = `${body}\n`;
  return {
    edit: { from: at, to: at, replacement },
    caret: at + body.length
  };
}

