/**
 * Reading a raw line as a list item marker.
 *
 * A line holding nothing but a list marker (`- `, `  - `, `1. `, `- [ ] `)
 * is an empty list item to the author, but it is easy to mistake it for text:
 * the trailing space is the marker's own delimiter, and markdown reads such a
 * line as a setext heading underline when a paragraph precedes it. Both the
 * parse-input rewrite (`trailing_spaces.ts`) and the editing commands need to
 * recognise the shape, so they read it here.
 */

/** A bare bullet, ordered or task marker — `[ ]`/`[x]` is part of it. */
const LIST_ITEM_MARKER = /^\s*(?:[-+*]|\d+[.)])(?:\s+\[[ xX]\])?$/;

/** Whether a raw line is an empty list item, trailing spaces included. */
export function isBlankItemLine(line: string): boolean {
  return LIST_ITEM_MARKER.test(line.trimEnd());
}

/** The bounds of the line an offset sits on. */
export function lineSpanAt(text: string, offset: number): { start: number; end: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const lineBreak = text.indexOf('\n', clamped);
  return {
    start: text.lastIndexOf('\n', clamped - 1) + 1,
    end: lineBreak < 0 ? text.length : lineBreak
  };
}

/**
 * The line an offset sits on when that line is an empty item, or null when
 * the offset is not inside one.
 */
export function blankItemLineAt(
  text: string,
  offset: number
): { start: number; end: number } | null {
  const line = lineSpanAt(text, offset);
  return isBlankItemLine(text.slice(line.start, line.end)) ? line : null;
}
