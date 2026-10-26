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
import type { RootContent } from 'mdast';
import {
  closesFrontmatter,
  closingFence,
  frontmatterDelimiter,
  htmlBlockTerminator,
  listMarker,
  openingFence
} from './markers';

/** One caption line and the optional blank source line before it. */
export interface ListCaptionAttachment {
  caption: ListCaptionData;
  separatorFrom: number | null;
  separatorTo: number | null;
}

/** The shared caption data specialized to a list owner. */
export interface ListCaptionData extends CaptionLineData {}

/** The parsed list-caption node the renderer and export pipeline consume. */
export interface ListCaptionNode {
  type: 'listCaption';
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  children: RootContent[];
  source: string;
  captionData: ListCaptionData;
  /** The list's block-relative start: the key the shared index numbers it by. */
  listFrom: number;
  /** Block-relative start of the optional blank separator. */
  separatorFrom: number | null;
  separated: boolean;
  position: {
    start: { offset: number };
    end: { offset: number };
  };
}

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

/**
 * Mask direct list-caption lines for remark while preserving every offset.
 *
 * remark-deflist otherwise reads a directly adjacent `: Caption` as a
 * description-list paragraph lazily continued inside the final list item. The
 * original document supplies the caption through {@link listCaptionAfterList}.
 */
export function listCaptionsForParsers(markdown: string): string {
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
    if (line.text.trimStart().startsWith('$$')) {
      index += 1;
      while (index < lines.length && !lines[index].text.trim().endsWith('$$')) {
        index += 1;
      }
      index += 1;
      continue;
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
    const marker = listMarker(line.text);
    if (marker === null) {
      index += 1;
      continue;
    }
    const indent = ' '.repeat(marker.indent);
    let scan = index + 1;
    while (scan < lines.length) {
      const current = lines[scan];
      if (current.text.trim() === '') {
        const next = lines[scan + 1];
        if (
          next === undefined ||
          !next.text.startsWith(indent) ||
          (listMarker(next.text) === null && !/^\s{2,}/.test(next.text)) &&
            listCaptionLine(next.text.slice(indent.length), 0) === null
        ) {
          break;
        }
        scan += 1;
        continue;
      }
      if (
        current.text.startsWith(indent) &&
        listCaptionLine(current.text.slice(indent.length), 0) !== null
      ) {
        const from = current.start + indent.length;
        masks.push({ from, to: current.end });
        break;
      }
      scan += 1;
    }
    index = scan + 1;
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

/** The document's lines with their absolute starts, excluding a trailing phantom line. */
function sourceLines(markdown: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let cursor = 0;
  while (cursor < markdown.length) {
    const breakAt = markdown.indexOf('\n', cursor);
    const end = breakAt < 0 ? markdown.length : breakAt;
    lines.push({
      start: cursor,
      end,
      text: markdown.slice(cursor, end).replace(/\r$/, '')
    });
    if (breakAt < 0) {
      break;
    }
    cursor = breakAt + 1;
  }
  return lines;
}
