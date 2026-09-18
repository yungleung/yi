/**
 * The list commands, expressed as one replacement of a range of the document.
 *
 * A list marker is a line's leading `- `, `1. ` or `- [ ] `, with the
 * indentation that puts the item where it sits. Writing one, rewriting one and
 * taking one away is all these commands do; the caller applies the result.
 *
 * Two rules keep the commands predictable:
 *
 * - a blank line is never given a marker, so toggling a selection that spans
 *   two paragraphs cannot turn the blank line between them into an item;
 * - indentation moves a whole item, its children included, so a nested list
 *   stays nested in the item it belongs to.
 */

import { lineSpanAt, itemSubtreeEnd } from './list_lines';
import type { TextEdit } from './edit_range';

export type ListKind = 'ordered' | 'bullet' | 'task';

/** The characters an indent step adds or takes away. */
const INDENT = '  ';

/** A line's list marker, read apart. */
interface Marker {
  /** The leading whitespace before the marker. */
  indent: string;
  /** `-`, `+`, `*`, `1.`, `2)` … */
  bullet: string;
  kind: ListKind;
  /** The number of an ordered marker, or null. */
  number: number | null;
  /** How many characters the marker occupies, content excluded. */
  length: number;
}

/** `- item`, `  * item`, `1) item`, `- [x] item` … */
const MARKER = /^([ \t]*)([-+*]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/;

/** The marker of a line, or null when the line is not a list item. */
export function readMarker(line: string): Marker | null {
  const match = MARKER.exec(line);
  if (!match) {
    return null;
  }
  const [, indent, bullet, , checkbox] = match;
  const ordered = /\d/.test(bullet);
  return {
    indent,
    bullet,
    kind: ordered ? 'ordered' : checkbox ? 'task' : 'bullet',
    number: ordered ? Number.parseInt(bullet, 10) : null,
    length: match[0].length
  };
}

/** The marker text a kind is written with: the project's canonical spelling. */
function markerText(kind: ListKind, number: number): string {
  if (kind === 'ordered') return `${number}. `;
  if (kind === 'task') return '- [ ] ';
  return '- ';
}

/** The lines a document range touches, in order. */
function touchedLines(text: string, from: number, to: number): Array<{ start: number; end: number }> {
  const lines: Array<{ start: number; end: number }> = [];
  const start = Math.max(0, Math.min(from, text.length));
  const end = Math.max(0, Math.min(to, text.length));
  // A selection that stops where a line starts does not touch that line: the
  // newline it ends on belongs to the line above.
  const last = Math.max(start, end > start && text[end - 1] === '\n' ? end - 1 : end);
  let offset = start;
  for (;;) {
    const line = lineSpanAt(text, offset);
    lines.push(line);
    if (line.end >= last || line.end >= text.length) {
      return lines;
    }
    offset = line.end + 1;
  }
}

/**
 * The number an ordered item written on this line should carry: it continues
 * the ordered item directly above when there is one at the same indentation,
 * and starts at 1 otherwise.
 */
function orderedStart(text: string, lineStart: number, indent: string): number {
  if (lineStart === 0) {
    return 1;
  }
  const above = lineSpanAt(text, lineStart - 1);
  const marker = readMarker(text.slice(above.start, above.end));
  return marker?.kind === 'ordered' && marker.indent === indent ? (marker.number ?? 0) + 1 : 1;
}

/**
 * The list button's edit: every line the range touches becomes `kind`, or —
 * when they are all already that kind — stops being a list at all. Lines that
 * are not list items and hold no text are left alone.
 */
export function listEdit(text: string, from: number, to: number, kind: ListKind): TextEdit | null {
  const lines = touchedLines(text, from, to);
  const entries = lines.map((line) => ({
    line,
    raw: text.slice(line.start, line.end),
    marker: readMarker(text.slice(line.start, line.end))
  }));
  const items = entries.filter((entry) => entry.raw.trim() !== '' || entry.marker !== null);
  if (items.length === 0) {
    return null;
  }
  const remove = items.every((entry) => entry.marker?.kind === kind);
  const indent = items[0].marker?.indent ?? /^[ \t]*/.exec(items[0].raw)?.[0] ?? '';
  let number = orderedStart(text, items[0].line.start, indent);

  const replacement = entries
    .map((entry) => {
      if (entry.raw.trim() === '' && entry.marker === null) {
        return entry.raw;
      }
      if (remove) {
        return entry.marker ? entry.raw.slice(entry.marker.length) : entry.raw;
      }
      const own = entry.marker?.indent ?? /^[ \t]*/.exec(entry.raw)?.[0] ?? '';
      const content = entry.marker ? entry.raw.slice(entry.marker.length) : entry.raw.trimStart();
      const written = markerText(kind, number);
      number += 1;
      return `${own}${written}${content}`;
    })
    .join('\n');

  return { from: lines[0].start, to: lines[lines.length - 1].end, replacement };
}

/** One indent step over a block of lines: whole lines, blank ones untouched. */
function shiftIndent(block: string, outdent: boolean): string {
  return block
    .split('\n')
    .map((line) => {
      if (line.trim() === '') {
        return line;
      }
      if (outdent) {
        return line.replace(/^ {1,2}/, '');
      }
      return `${INDENT}${line}`;
    })
    .join('\n');
}

/**
 * The indent button's edit: move every item the range touches one level in or
 * out, children included. Returns null when nothing would move — there is no
 * item in the range, or outdenting items that are not indented.
 */
export function indentEdit(text: string, from: number, to: number, outdent: boolean): TextEdit | null {
  const lines = touchedLines(text, from, to);
  const items: Array<{ start: number; end: number }> = [];
  let covered = -1;
  for (const line of lines) {
    if (line.start < covered) {
      // Already inside the subtree of an item picked up above: one step is one
      // step, however deep the selection reaches.
      continue;
    }
    const raw = text.slice(line.start, line.end);
    if (!readMarker(raw)) {
      continue;
    }
    const end = itemSubtreeEnd(text, line);
    items.push({ start: line.start, end });
    covered = end;
  }
  if (items.length === 0) {
    return null;
  }

  const first = items[0].start;
  const close = items[items.length - 1].end;
  let replacement = '';
  let cursor = first;
  for (const item of items) {
    replacement += text.slice(cursor, item.start);
    replacement += shiftIndent(text.slice(item.start, item.end), outdent);
    cursor = item.end;
  }
  replacement += text.slice(cursor, close);
  if (replacement === text.slice(first, close)) {
    return null;
  }
  return { from: first, to: close, replacement };
}
