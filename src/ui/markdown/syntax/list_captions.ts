/**
 * Attaches the shared colon caption line to a Markdown list.
 *
 * A list caption follows the complete list directly or after one blank line,
 * at the list's own base indentation. Two blank lines, different indentation,
 * or a non-caption line leave the association undone.
 *
 * May import: the shared caption grammar. Upholds: only a line immediately
 * following a list can become its caption, and its source range remains exact.
 */

import { captionLine, type CaptionLineData } from './caption_lines';

/** One caption line and the optional blank source line before it. */
export interface ListCaptionAttachment {
  caption: ListCaptionData;
  separatorFrom: number | null;
  separatorTo: number | null;
}

/** The shared caption data specialized to a list owner. */
export interface ListCaptionData extends CaptionLineData {}

/** The caption after a list spanning `[listFrom, listEnd)`, when one attaches. */
export function listCaptionAfterList(
  markdown: string,
  listFrom: number,
  listEnd: number
): ListCaptionAttachment | null {
  if (listFrom < 0 || listEnd < listFrom || listEnd > markdown.length) {
    return null;
  }
  const baseLine = sourceLineAt(markdown, listFrom);
  const first = sourceLineAfter(markdown, listEnd);
  if (baseLine === null || first === null) {
    return null;
  }
  const baseIndent = leadingWhitespace(baseLine.text);
  const direct = captionOnLine(first, baseIndent);
  if (direct !== null) {
    return { caption: direct, separatorFrom: null, separatorTo: null };
  }
  if (first.text.trim() !== '') {
    return null;
  }
  const separated = sourceLineAfter(markdown, first.end);
  const caption = separated === null ? null : captionOnLine(separated, baseIndent);
  return caption === null
    ? null
    : {
        caption,
        separatorFrom: first.start,
        separatorTo: first.end
      };
}

/** The caption data on one de-indented line, or null when it is not one. */
export function listCaptionLine(line: string, from: number): ListCaptionData | null {
  return captionLine(line, from);
}

/** One caption line at the list's exact base indentation. */
function captionOnLine(
  line: SourceLine,
  baseIndent: string
): ListCaptionData | null {
  const indent = leadingWhitespace(line.text);
  if (indent !== baseIndent) {
    return null;
  }
  return listCaptionLine(line.text.slice(indent.length), line.start + indent.length);
}

/** One source line wholly containing `offset`. */
function sourceLineAt(markdown: string, offset: number): SourceLine | null {
  if (offset < 0 || offset > markdown.length) {
    return null;
  }
  const start = markdown.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  return sourceLineFrom(markdown, start);
}

/** The source line after `offset` when `offset` is at a line ending. */
function sourceLineAfter(markdown: string, offset: number): SourceLine | null {
  if (markdown[offset] === '\r' && markdown[offset + 1] === '\n') {
    return sourceLineFrom(markdown, offset + 2);
  }
  if (markdown[offset] === '\n') {
    return sourceLineFrom(markdown, offset + 1);
  }
  return null;
}

/** One full source line starting at `start`, or null past the document. */
function sourceLineFrom(markdown: string, start: number): SourceLine | null {
  if (start > markdown.length || (start === markdown.length && markdown.length > 0)) {
    return null;
  }
  const breakAt = markdown.indexOf('\n', start);
  const end = breakAt < 0 ? markdown.length : breakAt;
  return { start, end, text: markdown.slice(start, end).replace(/\r$/, '') };
}

/** Leading spaces or tabs on a line. */
function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? '';
}

interface SourceLine {
  start: number;
  end: number;
  text: string;
}
