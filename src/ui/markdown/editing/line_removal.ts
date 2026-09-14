/**
 * Removing a whole line from the raw text.
 *
 * The line leaves with the newline before it, so the lines above and below it
 * join where it was and the caret takes that place — the end of the line
 * above. The first line of the file has no newline before it, so it takes the
 * one after instead.
 */
export function lineRemoval(
  text: string,
  line: { start: number; end: number }
): { from: number; to: number; caret: number } {
  if (line.start > 0) {
    return { from: line.start - 1, to: line.end, caret: line.start - 1 };
  }
  return { from: line.start, to: Math.min(text.length, line.end + 1), caret: line.start };
}
