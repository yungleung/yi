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
 *
 * May import: the line helpers and the edit shape beside it (`./lines`,
 * `./edit_range`). Upholds: one fact about markdown syntax has one home, and this
 * is the home of the list markers a line is written with.
 */

import { lineSpanAt, itemSubtreeEnd, touchedLines } from '../lines';
import type { TextEdit } from '../edit_range';

/** The kinds of list a command can make a line into. */
export const LIST_KINDS = ['ordered', 'bullet', 'task'] as const;

/** One of the list kinds above. */
export type ListKind = (typeof LIST_KINDS)[number];

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
  /**
   * The column the item's content starts in, inside its own line: the
   * indentation plus the bullet and the space after it. A child list has to
   * reach this column to nest, so this — not a fixed step — is how far an
   * indent has to move an item. The task checkbox is *content* to markdown,
   * so it is not counted here.
   */
  column: number;
}

/** `- item`, `  * item`, `1) item`, `- [x] item` … */
const MARKER = /^([ \t]*)([-+*]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/;

/** The marker of a line, or null when the line is not a list item. */
export function readMarker(line: string): Marker | null {
  const match = MARKER.exec(line);
  if (!match) {
    return null;
  }
  const [, indent, bullet, spaces, checkbox] = match;
  const ordered = /\d/.test(bullet);
  return {
    indent,
    bullet,
    kind: ordered ? 'ordered' : checkbox ? 'task' : 'bullet',
    number: ordered ? Number.parseInt(bullet, 10) : null,
    length: match[0].length,
    column: indent.length + bullet.length + spaces.length
  };
}

/** The marker text a kind is written with: the project's canonical spelling. */
function markerText(kind: ListKind, number: number): string {
  if (kind === 'ordered') return `${number}. `;
  if (kind === 'task') return '- [ ] ';
  return '- ';
}

/**
 * The number an ordered item written on this line should carry: it continues
 * the nearest ordered item above it at the same indentation, and starts at 1
 * when there is none. Anything else would either restart a nested list in the
 * middle of itself or, worse, write a nested list that markdown does not read
 * as a list at all — a nested ordered list has to begin at 1.
 */
function orderedStart(text: string, lineStart: number, indent: string): number {
  if (lineStart === 0) {
    return 1;
  }
  const above = itemAbove(
    text,
    lineStart,
    (marker) => marker.kind === 'ordered' && marker.indent === indent
  );
  return above ? (above.marker.number ?? 0) + 1 : 1;
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

/** The item nearest above `offset` whose marker satisfies `accept`. */
function itemAbove(
  text: string,
  offset: number,
  accept: (marker: Marker) => boolean
): { marker: Marker; start: number } | null {
  let line = lineSpanAt(text, Math.max(0, offset - 1));
  for (;;) {
    const marker = readMarker(text.slice(line.start, line.end));
    if (marker && accept(marker)) {
      return { marker, start: line.start };
    }
    if (line.start === 0) {
      return null;
    }
    line = lineSpanAt(text, line.start - 1);
  }
}

/** Moves every line of a subtree `delta` columns sideways. */
function shiftBlock(block: string, delta: number): string {
  return block
    .split('\n')
    .map((line) => {
      if (line.trim() === '') {
        return line;
      }
      if (delta > 0) {
        return `${' '.repeat(delta)}${line}`;
      }
      let removed = 0;
      while (removed < -delta && line[removed] === ' ') {
        removed += 1;
      }
      return line.slice(removed);
    })
    .join('\n');
}

/**
 * The indent button's edit: move every item the range touches one level in or
 * out, children included. Returns null when nothing would move — there is no
 * item in the range, or outdenting items that are not indented.
 *
 * A level is not a fixed number of spaces. Markdown nests a child list only
 * when it reaches the column the parent's *content* starts in — two columns
 * under `- `, three under `1. `, four under `10. ` — so the step is measured
 * from the item above, and each subtree moves by its own amount. An ordered
 * item that moves is renumbered for the level it lands on: a nested ordered
 * list that does not start at 1 does not nest at all, it is read as the text
 * of the item above.
 */
export function indentEdit(text: string, from: number, to: number, outdent: boolean): TextEdit | null {
  const lines = touchedLines(text, from, to);
  const plans: Array<{ start: number; end: number; delta: number }> = [];
  let covered = -1;
  for (const line of lines) {
    if (line.start < covered) {
      // Already inside the subtree of an item picked up above: one step is one
      // step, however deep the selection reaches.
      continue;
    }
    const raw = text.slice(line.start, line.end);
    const marker = readMarker(raw);
    if (!marker) {
      continue;
    }
    const end = itemSubtreeEnd(text, line);
    const own = marker.indent.length;
    let target: number;
    if (outdent) {
      const parent = itemAbove(text, line.start, (candidate) => candidate.indent.length < own);
      target = parent ? parent.marker.indent.length : 0;
    } else {
      const above = itemAbove(text, line.start, (candidate) => candidate.indent.length <= own);
      // A sibling above becomes the parent: reach into its content. With no
      // sibling, the item steps in by its own marker's width.
      target =
        above && above.marker.indent.length === own
          ? above.marker.column
          : own + (marker.column - own);
    }
    if (target !== own) {
      plans.push({ start: line.start, end, delta: target - own });
    }
    covered = end;
  }
  if (plans.length === 0) {
    return null;
  }

  const first = plans[0].start;
  const close = plans[plans.length - 1].end;
  let replacement = '';
  let cursor = first;
  let running: { indent: string; number: number } | null = null;
  for (const plan of plans) {
    replacement += text.slice(cursor, plan.start);
    replacement += shiftItem(text, plan, running);
    const moved = readMarker(replacement.slice(replacement.lastIndexOf('\n') + 1));
    running =
      moved?.kind === 'ordered'
        ? { indent: moved.indent, number: moved.number ?? 1 }
        : null;
    cursor = plan.end;
  }
  replacement += text.slice(cursor, close);
  if (replacement === text.slice(first, close)) {
    return null;
  }
  return { from: first, to: close, replacement };
}

/**
 * One item's subtree, moved sideways, with its marker renumbered when it is an
 * ordered item. `running` is the ordered run the item joins — the item above
 * it at its new level, if that item is part of this same edit.
 */
function shiftItem(
  text: string,
  plan: { start: number; end: number; delta: number },
  running: { indent: string; number: number } | null
): string {
  const shifted = shiftBlock(text.slice(plan.start, plan.end), plan.delta);
  const firstBreak = shifted.indexOf('\n');
  const head = firstBreak < 0 ? shifted : shifted.slice(0, firstBreak);
  const marker = readMarker(head);
  if (marker?.kind !== 'ordered') {
    return shifted;
  }
  const number =
    running && running.indent === marker.indent
      ? running.number + 1
      : orderedStart(text, plan.start, marker.indent);
  const rewritten = `${marker.indent}${number}. ${head.slice(marker.length)}`;
  return firstBreak < 0 ? rewritten : `${rewritten}${shifted.slice(firstBreak)}`;
}
