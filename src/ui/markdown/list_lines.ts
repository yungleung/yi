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

/** A block start that is indented deeper than the item: one of its children. */
const CHILD_BLOCK = /^[ \t]+(?:[-+*]|\d+[.)])\s|^[ \t]+(?:>|```|~~~|\$\$)/;

/**
 * Whether a child block follows the item's line. An indented line of plain
 * text is the item's own continuation, not a child, so Enter at the end of a
 * soft-broken line still splits the item's text where the caret is.
 */
export function hasChildBlock(text: string, line: { start: number; end: number }): boolean {
  const next = text.slice(line.end + 1).split('\n')[0] ?? '';
  return CHILD_BLOCK.test(next);
}

/**
 * The offset just past the last line of the item that starts at `line`,
 * including its own indented children (and blank lines inside them). A line at
 * the same or a shallower indentation ends the item.
 */
export function itemSubtreeEnd(text: string, line: { start: number; end: number }): number {
  const indent = /^[ \t]*/.exec(text.slice(line.start, line.end))![0].length;
  const deeper = (candidate: string): boolean =>
    candidate.trim() !== '' && /^[ \t]*/.exec(candidate)![0].length > indent;
  let end = line.end;
  while (end < text.length) {
    const breakAt = text.indexOf('\n', end + 1);
    const lineEnd = breakAt < 0 ? text.length : breakAt;
    const next = text.slice(end + 1, lineEnd);
    if (deeper(next)) {
      end = lineEnd;
      continue;
    }
    // A blank line belongs to the item only when a deeper line follows it.
    if (next.trim() === '' && deeper(text.slice(lineEnd + 1).split('\n')[0] ?? '')) {
      end = lineEnd;
      continue;
    }
    break;
  }
  return end;
}
