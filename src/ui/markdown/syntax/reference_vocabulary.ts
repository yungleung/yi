/**
 * Reads the document's own words and literal prefixes for numbered references.
 *
 * The vocabulary lives in YAML frontmatter. It is not interface localization:
 * changing Yi's language must never change a note's references.
 *
 * May import: the YAML parser and mdast's tree type. Upholds: every metadata
 * failure falls back per key, so a malformed label cannot disable targets.
 */

import type { Root } from 'mdast';
import { parseDocument } from 'yaml';

/** The target kinds that carry a number. Headings display their own title. */
export type NumberedReferenceKind = 'figure' | 'listing' | 'table' | 'equation' | 'list';

/** One kind's visible word and literal number prefix. */
export interface ReferenceStyle {
  label: string;
  prefix: string;
}

/** Every numbered kind's document-owned presentation. */
export type ReferenceVocabulary = Record<NumberedReferenceKind, ReferenceStyle>;

const KINDS: readonly NumberedReferenceKind[] = [
  'figure',
  'listing',
  'table',
  'equation',
  'list'
];

/** The English words and empty prefixes used when the note says nothing. */
export const DEFAULT_REFERENCE_VOCABULARY: Readonly<ReferenceVocabulary> = {
  figure: { label: 'Figure', prefix: '' },
  listing: { label: 'Listing', prefix: '' },
  table: { label: 'Table', prefix: '' },
  equation: { label: 'Equation', prefix: '' },
  list: { label: 'List', prefix: '' }
};

/** Read the vocabulary from a parsed Markdown tree's leading YAML node. */
export function referenceVocabularyFromTree(tree: Root): ReferenceVocabulary {
  const frontmatter = tree.children.find((child) => child.type === 'yaml');
  return referenceVocabularyFromFrontmatter(
    frontmatter && 'value' in frontmatter ? String(frontmatter.value ?? '') : null
  );
}

/** Read both maps, falling back independently for every missing or invalid value. */
export function referenceVocabularyFromFrontmatter(
  frontmatter: string | null
): ReferenceVocabulary {
  const result = copyDefaults();
  if (frontmatter === null || frontmatter.trim() === '') {
    return result;
  }
  const document = parseDocument(frontmatter);
  if (document.errors.length > 0) {
    return result;
  }
  const root = document.toJS();
  if (!isRecord(root)) {
    return result;
  }
  const labels = isRecord(root['reference-labels']) ? root['reference-labels'] : {};
  const prefixes = isRecord(root['reference-number-prefixes'])
    ? root['reference-number-prefixes']
    : {};
  for (const kind of KINDS) {
    const label = labels[kind];
    if (typeof label === 'string' && label.trim() !== '') {
      result[kind].label = label.trim();
    }
    const prefix = prefixes[kind];
    if (typeof prefix === 'string' && prefix.trim() !== '') {
      result[kind].prefix = prefix;
    }
  }
  return result;
}

/** The visible phrase for one numbered target. */
export function referenceNumberText(
  kind: NumberedReferenceKind,
  number: number,
  vocabulary: ReferenceVocabulary
): string {
  return referenceKindText(kind, number, vocabulary[kind]);
}

/** The visible phrase for one kind's already-selected style. */
export function referenceKindText(
  kind: NumberedReferenceKind,
  number: number,
  style: ReferenceStyle
): string {
  const numbered = `${style.prefix}${number}`;
  return kind === 'equation'
    ? `${style.label} (${numbered})`
    : `${style.label} ${numbered}`;
}

/** Own copies keep an edit to one returned vocabulary from changing the default. */
function copyDefaults(): ReferenceVocabulary {
  return {
    figure: { ...DEFAULT_REFERENCE_VOCABULARY.figure },
    listing: { ...DEFAULT_REFERENCE_VOCABULARY.listing },
    table: { ...DEFAULT_REFERENCE_VOCABULARY.table },
    equation: { ...DEFAULT_REFERENCE_VOCABULARY.equation },
    list: { ...DEFAULT_REFERENCE_VOCABULARY.list }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
