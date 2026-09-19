/**
 * Indenting inside a fenced code block: one `Tab` is two spaces.
 *
 * A caret gets two spaces at its position, the way a code editor tab does. A
 * selection indents or out-indents the lines it touches without ever eating
 * the selected text, which is what makes Tab safe to press over a block of
 * code. The lines that *delimit* the block are never touched: two spaces in
 * front of a closing fence is a code block that no longer closes, and the same
 * goes for the `$$` around a display formula.
 */

import type { TextEdit } from './edit_range';
import { lineSpanAt, touchedLines } from './list_lines';

/** The two spaces one Tab stands for. */
const STEP = '  ';

/** A line that delimits a fenced code block or a display formula. */
function isDelimiter(line: string): boolean {
  return /^ {0,3}(?:`{3,}|~{3,})/.test(line) || /^ {0,3}\$\$\s*$/.test(line);
}

/** One edit covering the given line rewrites, with everything between them kept. */
function joinLineEdits(
  text: string,
  edited: Array<{ line: { start: number; end: number }; text: string }>
): TextEdit {
  let replacement = '';
  let cursor = edited[0].line.start;
  for (const entry of edited) {
    replacement += text.slice(cursor, entry.line.start) + entry.text;
    cursor = entry.line.end;
  }
  replacement += text.slice(cursor, edited[edited.length - 1].line.end);
  return {
    from: edited[0].line.start,
    to: edited[edited.length - 1].line.end,
    replacement
  };
}

/** The lines that may be indented: the delimiters around the block are not. */
function usableLines(
  text: string,
  lines: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  return lines.filter((line) => !isDelimiter(text.slice(line.start, line.end)));
}

/** Adds one step to each line that may take it. */
function indentLines(text: string, lines: Array<{ start: number; end: number }>): TextEdit | null {
  const edited = usableLines(text, lines).map((line) => {
    const raw = text.slice(line.start, line.end);
    // A blank line in the middle of the selection keeps its emptiness rather
    // than collecting trailing spaces.
    return { line, text: raw.trim() === '' ? raw : `${STEP}${raw}` };
  });
  return edited.length === 0 ? null : joinLineEdits(text, edited);
}

/** Takes one step away from each line that has one. */
function outdentLines(text: string, lines: Array<{ start: number; end: number }>): TextEdit | null {
  let changed = false;
  const edited = usableLines(text, lines).map((line) => {
    const raw = text.slice(line.start, line.end);
    let removed = 0;
    while (removed < STEP.length && raw[removed] === ' ') {
      removed += 1;
    }
    changed = changed || removed > 0;
    return { line, text: raw.slice(removed) };
  });
  return !changed || edited.length === 0 ? null : joinLineEdits(text, edited);
}

/**
 * The edit `Tab` (or `Shift+Tab`) makes inside a code block. A caret is one
 * insertion; a selection is one edit over the lines it touches.
 */
export function codeIndentEdit(
  text: string,
  from: number,
  to: number,
  outdent: boolean
): TextEdit | null {
  if (from === to) {
    const line = lineSpanAt(text, from);
    if (isDelimiter(text.slice(line.start, line.end))) {
      return null;
    }
    return outdent ? outdentLines(text, [line]) : { from, to, replacement: STEP };
  }
  const lines = touchedLines(text, from, to);
  return outdent ? outdentLines(text, lines) : indentLines(text, lines);
}
