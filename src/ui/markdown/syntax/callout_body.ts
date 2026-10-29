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
 * Enter on an empty fenced-Div callout's opening line.
 *
 * The ordinary paragraph rule would leave the caret against the closing fence.
 * GitHub alerts deliberately use that paragraph rule instead, so their first
 * Enter is the same two-line break as every other quoted paragraph.
 */
export function emptyCalloutNewline(text: string, offset: number): QuoteEdit | null {
  const callout = calloutAtOffset(text, offset);
  if (
    callout?.form !== 'div' ||
    callout.bodyFrom !== callout.bodyTo
  ) {
    return null;
  }
  if (offset !== callout.markerTo && offset !== callout.bodyFrom) {
    return null;
  }
  const replacement = `\n${callout.quotePrefix}`;
  return {
    edit: { from: callout.markerTo, to: callout.markerTo, replacement },
    caret: callout.markerTo + replacement.length
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
      caret: at + caretInBody
    };
  }

  const body = typed.replace(/\n/g, `\n${callout.quotePrefix}`);
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

