/**
 * The offset-preserving input remark receives for Yi's labeled equations.
 *
 * Example: `[$$\nx\n$$]{#eq:x}` becomes ` $$\nx\n$$        `, so remark sees ordinary
 * display math while every later source offset remains unchanged.
 *
 * May import: shared marker grammar and the equation opening/closing predicates. Upholds: parser
 * input has the same length and line structure as the note, and syntax inside fenced, display-math,
 * frontmatter, or terminating HTML blocks is never changed.
 */

import {
  closingFence,
  closesFrontmatter,
  frontmatterDelimiter,
  htmlBlockTerminator,
  openingFence
} from './markers';
import { closesEquation, isEquationOpening } from './equation_blocks';

export function equationsForParsers(markdown: string): string {
  const lines = sourceLines(markdown);
  const masks: Array<{ from: number; to: number }> = [];
  let index = 0;

  if (lines[0] && frontmatterDelimiter(lines[0].text)) {
    const close = lines.findIndex(
      (line, at) => at > 0 && closesFrontmatter(line.text)
    );
    if (close >= 0) {
      index = close + 1;
    }
  }

  while (index < lines.length) {
    const line = lines[index];
    const fence = openingFence(line.text);
    if (fence !== null) {
      index += 1;
      while (index < lines.length && !closingFence(lines[index].text, fence)) {
        index += 1;
      }
      index += 1;
      continue;
    }

    if (isEquationOpening(line.text)) {
      const close = lines.findIndex(
        (candidate, at) => at > index && closesEquation(candidate.text)
      );
      if (close >= 0) {
        const openingAt = line.start + leadingSpace(line.text);
        const closing = lines[close];
        const closingAt = closing.start + leadingSpace(closing.text);
        const closingEnd = closing.start + closing.text.trimEnd().length;
        masks.push({ from: openingAt, to: openingAt + 1 });
        masks.push({ from: closingAt + 2, to: closingEnd });
        index = close + 1;
        continue;
      }
    }

    const displayOpen = line.text.indexOf('$$');
    if (line.text.trimStart().startsWith('$$')) {
      const closesOnLine =
        line.text.indexOf('$$', displayOpen + 2) >= 0 &&
        line.text.trimEnd().endsWith('$$');
      if (!closesOnLine) {
        index += 1;
        while (index < lines.length) {
          const candidate = lines[index].text.trim();
          index += 1;
          if (candidate.startsWith('$$') || candidate.endsWith('$$')) {
            break;
          }
        }
        continue;
      }
    }

    const terminator = htmlBlockTerminator(line.text);
    if (terminator !== null) {
      index += 1;
      while (index < lines.length && !terminator.test(lines[index].text)) {
        index += 1;
      }
      index += 1;
      continue;
    }

    index += 1;
  }

  if (masks.length === 0) {
    return markdown;
  }
  const parts: string[] = [];
  let copied = 0;
  for (const { from, to } of masks) {
    parts.push(markdown.slice(copied, from), ' '.repeat(to - from));
    copied = to;
  }
  parts.push(markdown.slice(copied));
  return parts.join('');
}

/** One source line, with the offset it begins at. */
function sourceLines(source: string): Array<{ start: number; text: string }> {
  const lines: Array<{ start: number; text: string }> = [];
  let start = 0;
  for (;;) {
    const newline = source.indexOf('\n', start);
    const end = newline < 0 ? source.length : newline;
    lines.push({ start, text: source.slice(start, end) });
    if (newline < 0) {
      return lines;
    }
    start = newline + 1;
  }
}

/** The indentation before a line's first non-whitespace character. */
function leadingSpace(line: string): number {
  return line.length - line.trimStart().length;
}
