/**
 * Runs of blank lines and the empty paragraphs they carry.
 *
 * One blank line between two blocks is markdown's separator and renders as a
 * margin, not as a line. Every further blank line is something the author
 * added on purpose, so it renders as a real empty paragraph the caret can sit
 * on. At the top and the bottom of a file no separator is needed, so every
 * blank line there becomes an empty paragraph.
 */

/** Whether a raw line holds no content at all. */
export function isEmptyParagraphLine(line: string): boolean {
  return line.trim() === '';
}

/**
 * The indexes, inside a run of blank lines, that become empty paragraphs.
 * `separator` is true when the run sits between two blocks, in which case the
 * first blank line is the separator.
 */
export function emptyParagraphIndexes(blankLineCount: number, separator: boolean): number[] {
  const indexes: number[] = [];
  for (let index = separator ? 1 : 0; index < blankLineCount; index += 1) {
    indexes.push(index);
  }
  return indexes;
}
