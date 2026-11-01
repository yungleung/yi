/**
 * The footnote model: marker grammar, document labels, numbering and positions.
 *
 * Example: `footnoteLabels('Text[^1].\n\n[^1]: note')` returns `{'1'}`, and
 * `markerShape('1')` describes `[^1]` as four characters whose label is `1`.
 *
 * A definition may sit behind markdown's container openers (`> [^1]: note`), but an indented
 * code block is not a definition. May import: nothing — every rule reads raw document text.
 * Upholds: one fact about footnote syntax has one home, including the shape of a marker.
 */

/**
 * What a definition line may sit behind: quote and list markers, repeated because containers
 * nest, plus up to three spaces at the line's content column.
 *
 * Example: `> - [^1]: note` is a definition. A definition four columns into a `10. ` item is
 * indistinguishable from indented code on one physical line, so the code-block reading wins.
 */
const CONTAINERS = '(?: {0,3}(?:>[ \\t]+|[-*+][ \\t]+|\\d+[.)][ \\t]+))* {0,3}';
const DEFINITION = new RegExp(`^${CONTAINERS}\\[\\^([^\\]\\n]+)\\]:`, 'gm');
const DEFINITION_LINE = new RegExp(`^${CONTAINERS}\\[\\^[^\\]\\n]+\\]:`, 'm');
const REFERENCE = /\[\^([^\]\n]+)\](?!:)/g;
const REFERENCE_SHAPE = /\[\^[^\]\n]+\](?!:)/;

/** The labels defined by the definition lines in a piece of text. */
export function footnoteDefinitionLabels(text: string): string[] {
  return [...text.matchAll(DEFINITION)].map((match) => match[1]);
}

/** The labels referenced by non-definition markers in a piece of text. */
export function footnoteReferenceLabels(text: string): string[] {
  return [...text.matchAll(REFERENCE)].map((match) => match[1]);
}

/** The labels of the definitions the document holds. */
export function footnoteLabels(text: string): Set<string> {
  return new Set(footnoteDefinitionLabels(text));
}

/** Whether a piece of text holds a marker a definition could turn into a reference. */
export function containsReference(text: string): boolean {
  return REFERENCE_SHAPE.test(text);
}

/** Whether a piece of text contains a line that defines a footnote. */
export function containsFootnoteDefinition(text: string): boolean {
  return DEFINITION_LINE.test(text);
}

/**
 * Whether two sets of labels hold the same labels.
 *
 * Example: `sameLabels(new Set(['1']), new Set(['1']))` returns `true`.
 */
export function sameLabels(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) {
    return true;
  }
  if (a.size !== b.size) {
    return false;
  }
  for (const label of a) {
    if (!b.has(label)) {
      return false;
    }
  }
  return true;
}

/**
 * The `[^label]` marker's length and the label's range inside it.
 *
 * Example: `markerShape('note')` returns `{ end: 7, label: { start: 2, end: 6 } }`.
 */
export function markerShape(label: string): {
  end: number;
  label: { start: number; end: number };
} {
  const end = label.length + 3;
  return { end, label: { start: 2, end: end - 1 } };
}

/**
 * The number a new footnote takes: one past the highest numbered label.
 *
 * Example: definitions for `1` and `3` make the next number `4`; labels such as `note` do not count.
 */
export function nextFootnoteNumber(text: string): number {
  let highest = 0;
  for (const label of footnoteLabels(text)) {
    if (/^\d+$/.test(label)) {
      highest = Math.max(highest, Number.parseInt(label, 10));
    }
  }
  return highest + 1;
}

function escapeLabel(label: string): string {
  return label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface FootnoteOffsets {
  /** Where the first reference to the label sits, or null. */
  reference: number | null;
  /** Just past that reference. */
  referenceEnd: number | null;
  /** Where the definition's own text starts, or null. */
  definitionBody: number | null;
}

/**
 * Where a label's reference and definition sit in the document.
 *
 * Example: in `Text[^1].\n\n[^1]: Note`, the reference starts at 4 and the definition body at 17.
 */
export function footnoteOffsets(text: string, label: string): FootnoteOffsets {
  const escaped = escapeLabel(label);
  const reference = new RegExp(`\\[\\^${escaped}\\](?!:)`, 'i').exec(text);
  const definition = new RegExp(`^${CONTAINERS}\\[\\^${escaped}\\]:[ \\t]*`, 'im').exec(text);
  return {
    reference: reference ? reference.index : null,
    referenceEnd: reference ? reference.index + reference[0].length : null,
    definitionBody: definition ? definition.index + definition[0].length : null
  };
}
