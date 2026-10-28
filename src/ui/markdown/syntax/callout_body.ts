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

import type { CalloutSource } from './callouts';
import type { QuoteEdit } from './quote_edits';

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
    const replacement = typed.replace(/\n/g, '\n');
    return {
      edit: { from: at, to: at, replacement },
      caret: at + replacement.length
    };
  }

  const replacement = `${typed}\n`;
  return {
    edit: { from: at, to: at, replacement },
    caret: at + typed.length
  };
}

