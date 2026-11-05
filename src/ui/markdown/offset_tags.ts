/**
 * The tags that carry document offsets, spelled once.
 *
 * Every element that stands for a run of the document's own characters says where that run starts —
 * `data-text-from` on a text span, `data-source-from` on a revealed source, `data-format-from` on a
 * formatted unit, the block's own `data-line-start`/`data-char-start` — and the caret reads them
 * back (the mapping is `caret/offsets.ts`, the way out is `caret/dom_position.ts`). Thirteen
 * modules write or read them, and a typo in one — `dataset.textFrom` where the renderer wrote
 * `data-text-from`, or the other way round — is an offset that silently stops lining up. The names
 * live here so that cannot happen, and so the set is visible in one place.
 *
 * A `data-*` name that is *not* an offset — a cell's `data-table-cell` (`row:column`), a footnote's
 * `data-footnote-ref` label — is not here: those are names, not positions, and they are read where
 * they are used.
 *
 * May import: nothing. Upholds: one home for the attribute names, so the renderer that writes a tag
 * and the caret that reads it cannot disagree about what it is called.
 */

/** The offset a rendered text span starts at. */
export const TEXT_FROM = 'text-from';
/** The offset a revealed source starts at, when what is shown is not the node's own text. */
export const SOURCE_FROM = 'source-from';
/** The raw range a formatted unit (bold, italic, …) covers, markers included. */
export const FORMAT_FROM = 'format-from';
export const FORMAT_TO = 'format-to';
/** The content inside a revealed source's markers, for a boundary that has to skip them. */
export const CONTENT_START = 'content-start';
export const CONTENT_END = 'content-end';
/** Where a task item's source begins, for the checkbox's click to map back exactly. */
export const TASK_SOURCE_FROM = 'task-source-from';
/** Where a table row's source begins. */
export const TABLE_ROW_START = 'table-row-start';
/** Where an empty callout body accepts its first character. */
export const CALLOUT_BODY_ANCHOR = 'callout-body-anchor';
/** Where an empty theorem body accepts its first character. */
export const THEOREM_BODY_ANCHOR = 'theorem-body-anchor';
/** A block's own positions: its first character, and its first and last line. */
export const CHAR_START = 'char-start';
export const LINE_START = 'line-start';
export const LINE_END = 'line-end';

/** Every tag above. */
export const OFFSET_TAGS = [
  TEXT_FROM,
  SOURCE_FROM,
  FORMAT_FROM,
  FORMAT_TO,
  CONTENT_START,
  CONTENT_END,
  TASK_SOURCE_FROM,
  TABLE_ROW_START,
  CALLOUT_BODY_ANCHOR,
  THEOREM_BODY_ANCHOR,
  CHAR_START,
  LINE_START,
  LINE_END
] as const;

/** One of the tag names above. */
export type OffsetTag = (typeof OFFSET_TAGS)[number];

/** The selector that finds the elements carrying any of `tags`. */
export function tagSelector(...tags: readonly OffsetTag[]): string {
  return tags.map((tag) => `[data-${tag}]`).join(', ');
}

/**
 * The offset `element` carries under `tag`, or `NaN` when it carries none.
 *
 * `NaN` rather than `null` because that is what every reader already guards with
 * (`Number.isFinite`), and this is the same read those readers used to spell themselves
 * (`Number(element.dataset.textFrom)`): the tag's *name* is what this module is for, not a new
 * meaning for a missing one.
 */
export function offsetOf(element: Element, tag: OffsetTag): number {
  const raw = element.getAttribute(`data-${tag}`);
  return raw === null ? Number.NaN : Number(raw);
}

/** Writes `value` under `tag` on `element`. */
export function setOffset(element: HTMLElement, tag: OffsetTag, value: number): void {
  element.setAttribute(`data-${tag}`, String(value));
}
