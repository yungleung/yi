/**
 * The inline styles, and the raw markdown each one wraps a range with.
 *
 * Which inline styles exist is a fact about markdown, not about the toolbar
 * that draws a button for each of them or the registry that names their
 * commands, so the list lives here and the type is read off it. The module is
 * pure — no DOM, no state — so a Node check can bundle it.
 *
 * May import: nothing. Upholds: one fact about markdown syntax has one home —
 * which inline styles exist, and the marker characters each one wraps a range
 * with.
 */

/** The inline styles a formatting command can apply, in the order they are offered. */
export const FORMATTING_STYLES = ['bold', 'italic', 'strikethrough', 'inlineCode'] as const;

/** One of the inline styles above. */
export type FormattingStyle = (typeof FORMATTING_STYLES)[number];

/** The raw markdown markers each formatting style wraps a range with. */
const MARKERS: Record<FormattingStyle, string> = {
  bold: '**',
  italic: '*',
  strikethrough: '~~',
  inlineCode: '`'
};

/** The marker characters one formatting style wraps its content with. */
export function formattingMarker(style: FormattingStyle): string {
  return MARKERS[style];
}

/** The raw text edit produced by a formatting command. */
export interface FormattingEdit {
  /** The updated document text. */
  text: string;
  /** The new raw selection start (the formatted content). */
  from: number;
  /** The new raw selection end (just past the formatted content). */
  to: number;
  /**
   * The raw range (in the pre-edit text) whose DOM content the edit wraps in
   * markers, or that contains the markers an unwrap removes.
   */
  wrapFrom: number;
  wrapTo: number;
  /**
   * The raw range (in the pre-edit text) of the rendered content the edit
   * affects — inside the markers for a wrap, between them for an unwrap.
   */
  contentFrom: number;
  contentTo: number;
  /** True when the edit removes markers instead of adding them. */
  unwrap: boolean;
}

/** A whole formatted unit (e.g. `***x***` or an inline code span). */
export interface FormatUnit {
  /** The raw range of the unit, including its markers. */
  from: number;
  to: number;
  /** The raw range of the unit's rendered text (its innermost leaves). */
  contentFrom: number;
  contentTo: number;
}

/**
 * Applies a formatting style to a raw range. When the range (or, when given,
 * the whole formatted unit around it) is already wrapped with the style's
 * markers, the markers are removed instead — a toggle. The unit lets a new
 * style wrap the entire formatted span (e.g. inline code around `***x***`)
 * and lets an old style be toggled off regardless of nesting order.
 */
export function formatRange(
  text: string,
  from: number,
  to: number,
  style: FormattingStyle,
  unit?: FormatUnit
): FormattingEdit {
  const marker = formattingMarker(style);
  const wrapped =
    wrappedEdges(text, from, to, marker) ??
    (unit ? wrappedEdges(text, unit.from, unit.to, marker) : null);
  if (wrapped) {
    return {
      text:
        text.slice(0, wrapped.start) +
        text.slice(wrapped.start + marker.length, wrapped.end) +
        text.slice(wrapped.end + marker.length),
      from: wrapped.start,
      to: wrapped.end - marker.length,
      wrapFrom: wrapped.start,
      // `wrapped.end` is the closing marker's start; the DOM tags use the
      // exclusive end (past the marker), so add the marker length.
      wrapTo: wrapped.end + marker.length,
      contentFrom: wrapped.start + marker.length,
      contentTo: wrapped.end,
      unwrap: true
    };
  }
  const wrapFrom = unit ? unit.from : from;
  const wrapTo = unit ? unit.to : to;
  const contentFrom = unit ? unit.contentFrom : from;
  const contentTo = unit ? unit.contentTo : to;
  return {
    text: text.slice(0, wrapFrom) + marker + text.slice(wrapFrom, wrapTo) + marker + text.slice(wrapTo),
    // Select the unit's rendered text inside the new markers, so the
    // re-rendered document re-tags it at exactly these offsets.
    from: contentFrom + marker.length,
    to: contentTo + marker.length,
    wrapFrom,
    wrapTo,
    contentFrom,
    contentTo,
    unwrap: false
  };
}

/**
 * The marker positions to remove when a range is already wrapped, or null.
 * Leading/trailing whitespace and stray marker characters at the range edges
 * (natural drags include them) are skipped, and the markers may sit just
 * outside the trimmed range (a text-only selection inside `**x**`) or just
 * inside it (a selection covering the whole `**x**` unit — needed to un-style
 * stacked formats in any order).
 */
function wrappedEdges(
  text: string,
  from: number,
  to: number,
  marker: string
): { start: number; end: number } | null {
  let start = from;
  let end = to;
  while (start < end && /\s/.test(text[start])) {
    start += 1;
  }
  while (end > start && /\s/.test(text[end - 1])) {
    end -= 1;
  }
  if (start === end) {
    return null;
  }
  if (marker === '*') {
    // Italic is a prefix of the bold marker: the single `*` delimiter sits
    // at the edge of an odd star run, either outside the range or inside it.
    const before = starRunBefore(text, start);
    const after = starRunAfter(text, end);
    if (before % 2 === 1 && after % 2 === 1) {
      return { start: start - 1, end };
    }
    const atStart = starRunAfter(text, start);
    const atEnd = starRunBefore(text, end);
    if (atStart % 2 === 1 && atEnd % 2 === 1) {
      return { start: start + atStart - 1, end: end - atEnd };
    }
    return null;
  }
  const open = markerAt(text, start - marker.length, marker) ?? markerAt(text, start, marker);
  const close = markerAt(text, end - marker.length, marker) ?? markerAt(text, end, marker);
  if (open === null || close === null) {
    return null;
  }
  return { start: open, end: close };
}

/** The index of the marker starting at `index`, or null when absent. */
function markerAt(text: string, index: number, marker: string): number | null {
  if (index < 0 || index + marker.length > text.length) {
    return null;
  }
  return text.slice(index, index + marker.length) === marker ? index : null;
}

/** The number of consecutive `*` characters immediately before `index`. */
function starRunBefore(text: string, index: number): number {
  let run = 0;
  while (index - run - 1 >= 0 && text[index - run - 1] === '*') {
    run += 1;
  }
  return run;
}

/** The number of consecutive `*` characters starting at `index`. */
function starRunAfter(text: string, index: number): number {
  let run = 0;
  while (text[index + run] === '*') {
    run += 1;
  }
  return run;
}
