/**
 * Writing inside a display formula: the `$$` fences keep their own lines.
 *
 * A `$$` line delimits a formula only while it is the fence and nothing else, so
 * a character written onto the opening fence's line is dropped by the parser, and
 * one written onto the closing fence's line becomes part of the content:
 * `$$Q\n$$` reads as an empty formula, `$$\nQ$$` as the content `Q$$`. A write at
 * either edge of the content therefore goes *in* the content — onto the start of
 * its first line, or the end of its last — and a formula with no content yet takes
 * it as a line of its own between the two fences.
 *
 * May import: the line rules (`./lines`). Upholds: one fact about markdown syntax
 * has one home — where a display formula's content begins and ends is decided here
 * and nowhere else, and every rule here is a pure function of the formula's text.
 */

import { lineSpanAt } from './lines';

/** What a write inside a display formula does, in the formula's own offsets. */
export interface MathWrite {
  /** The range of the formula's text to replace. */
  from: number;
  to: number;
  replacement: string;
  /** Where the caret lands. */
  caret: number;
}

/**
 * What typing `typed` at `at` inside the display formula `text` writes, or null
 * when the caret is not at an edge of the content and an ordinary insert is right.
 */
export function mathTypedWrite(text: string, at: number, typed: string): MathWrite | null {
  const content = formulaContent(text);
  if (!content || (at !== content.opening && at !== content.closing)) {
    return null;
  }
  if (content.lastLine === null) {
    return lineOfItsOwn(content, typed);
  }
  const target = at === content.opening ? content.firstLine : content.lastLine;
  return { from: target, to: target, replacement: typed, caret: target + typed.length };
}

/**
 * What `Enter` at `at` inside the display formula `text` writes, or null for the
 * ordinary newline.
 *
 * A formula with no content yet takes the newline as its first content line: there
 * the plain insert would leave the caret between the fence lines it had just split,
 * and the next character would land on the closing fence's own line.
 */
export function mathNewlineWrite(text: string, at: number): MathWrite | null {
  const content = formulaContent(text);
  if (!content || content.lastLine !== null || at < content.opening || at > content.closing) {
    return null;
  }
  return lineOfItsOwn(content, '');
}

/** The write that gives a formula with no content line one holding `line`. */
function lineOfItsOwn(content: FormulaContent, line: string): MathWrite {
  return {
    from: content.opening,
    to: content.closing,
    replacement: `\n${line}\n`,
    caret: content.opening + 1 + line.length
  };
}

/** Where a display formula's content sits, in the formula's own offsets. */
interface FormulaContent {
  /** The offset just past the `$$` that opens the formula. */
  opening: number;
  /** The offset of the `$$` that closes it, or of the text's end when it has none. */
  closing: number;
  /** The offset the content's first line starts at. */
  firstLine: number;
  /** The offset the content's last line ends at, or null when it holds no line. */
  lastLine: number | null;
}

/** The content between a display formula's fences, or null when `text` is not one. */
function formulaContent(text: string): FormulaContent | null {
  const opening = openingPairEnd(text);
  if (opening === null) {
    return null;
  }
  const closing = closingPairStart(text, opening) ?? text.length;
  const content = text.slice(opening, closing);
  // The newline that ends a fence's line belongs to that line, not to the content:
  // the content's own first and last lines begin and end inside them. Fences with
  // nothing between them but their own line endings hold no content line at all —
  // the shape a write has to make one for.
  const firstLine = text[opening] === '\n' ? opening + 1 : opening;
  const end = closing - (text[closing - 1] === '\n' ? 1 : 0);
  return {
    opening,
    closing,
    firstLine,
    lastLine: content.length > 0 && firstLine <= end ? end : null
  };
}

/** The offset just past the `$$` that opens the block, or null when it opens none. */
function openingPairEnd(text: string): number | null {
  const match = /^ {0,3}\$\$/.exec(text);
  return match ? match[0].length : null;
}

/**
 * The offset of the `$$` that closes the formula, or null when its last line closes
 * nothing. A formula written on one line ends with the second pair of `$$`; one
 * written over several ends with the fence its last line starts or ends with.
 */
function closingPairStart(text: string, opening: number): number | null {
  const line = lineSpanAt(text, Math.max(0, text.length - 1));
  const raw = text.slice(line.start, line.end);
  const trimmed = raw.trimStart();
  if (line.start === 0) {
    // The opening line is the last one: the closer is the `$$` it ends with.
    const at = line.end - 2;
    return at >= opening && raw.endsWith('$$') ? at : null;
  }
  if (trimmed.startsWith('$$')) {
    const at = line.start + (raw.length - trimmed.length);
    return at > opening ? at : null;
  }
  const at = line.end - 2;
  return at > opening && trimmed.endsWith('$$') ? at : null;
}
