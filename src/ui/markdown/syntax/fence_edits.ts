/**
 * Writing inside a fenced block: the delimiter lines keep their own lines.
 *
 * A delimiter line delimits a block only while it is the delimiter and nothing else, so a
 * character written onto the *closing* delimiter's line is read as part of it: ` ```\nx\n``` ` is
 * the code `x` and a fence, while ` ```\nx\nx``` ` is the code `x\nx`, and a display formula reads
 * the same way. A write at the body's *end* therefore goes onto the end of the body's last line
 * instead, which is what `fenceBody` names (`syntax/markers.ts`), and a body with no content line
 * takes the write as a line of its own between the delimiters.
 *
 * May import: the marker rules (`./markers`). Upholds: one fact about markdown syntax has one home
 * — where a fenced block's body begins and ends is decided there, and every rule here is a pure
 * function of the block's text.
 */

import { fenceBody, openingFence } from './markers';
import { lineSpanAt } from './lines';
import type { TextEdit } from './edit_range';

/** What a write inside a fenced block does, in the block's own offsets. */
export interface FenceWrite {
  /** The range of the block's text to replace. */
  from: number;
  to: number;
  replacement: string;
  /** Where the caret lands. */
  caret: number;
}

/**
 * What typing `typed` at `at` inside the fenced block `text` writes, or null when the caret is not
 * at the body's end and an ordinary insert is right.
 */
export function fenceTypedWrite(text: string, at: number, typed: string): FenceWrite | null {
  const body = fenceBody(text);
  // An unclosed block has no closing delimiter for a line to be kept off, and its body runs to the
  // text's end: an ordinary insert already lands on a line of its own.
  if (at !== body.end || body.end === 0 || body.end >= text.length) {
    return null;
  }
  if (body.start === body.end) {
    return lineOfItsOwn(text, body, typed);
  }
  // The body carries its last line's newline, so one before its end is the end of that line.
  const target = body.end - 1;
  return { from: target, to: target, replacement: typed, caret: target + typed.length };
}

/**
 * What `Enter` at `at` inside the fenced block `text` writes, or null for the ordinary newline.
 *
 * A body with no content line yet takes the newline as its first one: there the plain insert would
 * leave the caret between the delimiter lines it had just split, and the next character would land
 * on the closing delimiter's own line.
 */
export function fenceNewlineWrite(text: string, at: number): FenceWrite | null {
  const body = fenceBody(text);
  if (
    body.start !== body.end ||
    body.end >= text.length ||
    at < body.start ||
    at > body.end
  ) {
    return null;
  }
  return lineOfItsOwn(text, body, '');
}

/** The write that gives a body with no content line one holding `line`. */
function lineOfItsOwn(text: string, body: { start: number; end: number }, line: string): FenceWrite {
  // A body that begins a line of its own only needs the text and its newline; one that begins
  // *inside* a delimiter's line — a formula written `$$x$$` — needs that line ended first, or the
  // text would join the delimiter and stop being a fence at all.
  const ownLine = body.start === 0 || text[body.start - 1] === '\n';
  const replacement = `${ownLine ? '' : '\n'}${line}\n`;
  return {
    from: body.start,
    to: body.end,
    replacement,
    caret: body.start + replacement.length - 1
  };
}

/**
 * What choosing a language writes: the opening fence's own line, with its info string replaced.
 *
 * Only the fence's line: the body is the author's text and is left exactly as it stands. The
 * separator the author wrote — one space, or none at all, both of which markdown reads as the info
 * string (`syntax/markers.ts: fenceLanguage`) — is kept as they wrote it.
 */
export function fenceLanguageEdit(text: string, language: string): TextEdit | null {
  const line = lineSpanAt(text, 0);
  const raw = text.slice(line.start, line.end);
  const fence = openingFence(raw);
  if (fence === null) {
    return null;
  }
  const after = raw.indexOf(fence) + fence.length;
  const separated = raw.slice(after).startsWith(' ') || raw.slice(after).startsWith('\t');
  return {
    from: line.start + after,
    to: line.end,
    replacement: language === '' ? '' : `${separated ? ' ' : ''}${language}`
  };
}
