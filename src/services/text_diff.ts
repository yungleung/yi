/**
 * Two texts, as one line stream for a reader: the whole document, with what changed marked.
 *
 * The equal first and last lines are trimmed only to *compute* the change — they come back as `same`
 * lines — and the differing middle is walked for its longest common subsequence, removals before
 * additions at each change, the way git's own diff reads. When that middle is past the cap the rule
 * stops being clever and names the change instead ("N lines replaced"), so a 300 KB note cannot make
 * a sheet chew.
 *
 * The project has no diff library (measured: none among its dependencies) and this is rule-shaped
 * work, so it is ours, with a check beside it.
 *
 * May import: nothing. Upholds: what it answers holds every line of both texts, in order, and never
 * drops an unchanged one.
 */

export type DiffKind = 'same' | 'removed' | 'added';

/** One line of the stream: what it says, and what became of it. */
export interface DiffLine {
  kind: DiffKind;
  text: string;
  /**
   * How many lines a change past the cap stood for, instead of the text: the *words* for that
   * belong to the catalogue, not to a pure rule that may import nothing.
   */
  replaced?: number;
}

/** A text's lines. A trailing newline does not make an empty last line; no text makes no lines. */
function linesOf(text: string): string[] {
  if (text === '') {
    return [];
  }
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') {
    parts.pop();
  }
  return parts;
}

/** The differing middle, line by line: a longest common subsequence, removals before additions. */
function middleDiff(before: string[], after: string[]): DiffLine[] {
  const length: number[][] = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0)
  );
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      length[i][j] =
        before[i] === after[j]
          ? length[i + 1][j + 1] + 1
          : Math.max(length[i + 1][j], length[i][j + 1]);
    }
  }
  const stream: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      stream.push({ kind: 'same', text: before[i] });
      i += 1;
      j += 1;
    } else if (length[i + 1][j] >= length[i][j + 1]) {
      stream.push({ kind: 'removed', text: before[i] });
      i += 1;
    } else {
      stream.push({ kind: 'added', text: after[j] });
      j += 1;
    }
  }
  for (; i < before.length; i += 1) {
    stream.push({ kind: 'removed', text: before[i] });
  }
  for (; j < after.length; j += 1) {
    stream.push({ kind: 'added', text: after[j] });
  }
  return stream;
}

/**
 * The whole document as one stream, `cap` being how many differing lines the rule will look at
 * before it names the change instead of diffing it.
 *
 * Example: `textDiff('one\ntwo\nthree', 'one\nTWO\nthree', 10)` keeps `one` and `three` as
 * `same`, and marks `two` removed before `TWO` added.
 */
export function textDiff(before: string, after: string, cap: number): DiffLine[] {
  const oldLines = linesOf(before);
  const newLines = linesOf(after);
  let head = 0;
  while (head < oldLines.length && head < newLines.length && oldLines[head] === newLines[head]) {
    head += 1;
  }
  let tail = 0;
  while (
    tail < oldLines.length - head &&
    tail < newLines.length - head &&
    oldLines[oldLines.length - 1 - tail] === newLines[newLines.length - 1 - tail]
  ) {
    tail += 1;
  }
  const oldMiddle = oldLines.slice(head, oldLines.length - tail);
  const newMiddle = newLines.slice(head, newLines.length - tail);
  const stream: DiffLine[] = oldLines.slice(0, head).map((text) => ({ kind: 'same', text }));
  if (oldMiddle.length + newMiddle.length > cap) {
    stream.push({ kind: 'removed', text: '', replaced: oldMiddle.length });
    stream.push({ kind: 'added', text: '', replaced: newMiddle.length });
  } else {
    stream.push(...middleDiff(oldMiddle, newMiddle));
  }
  for (const text of oldLines.slice(oldLines.length - tail)) {
    stream.push({ kind: 'same', text });
  }
  return stream;
}
