/**
 * Adds the resolved theorem declarations to the temporary source handed to
 * Pandoc, without changing the reader's document.
 *
 * Example: a note with a default `.Theorem` and no frontmatter gains the full
 * `amsthm` declaration block before export; a note with a custom style keeps
 * that style while gaining the built-in environments it did not repeat.
 *
 * May import: the Markdown parser, frontmatter markers, theorem vocabulary and
 * YAML. Upholds: no theorem means no source change, and malformed frontmatter is
 * left for the existing parser/export failure path.
 */

import { parseDocument } from 'yaml';
import { frontmatterRange } from '../../markdown/syntax/markers';
import { parseMarkdown } from '../../markdown/syntax/parser';
import {
  defaultTheoremTitle,
  theoremVocabularyFromFrontmatter,
  type TheoremType,
  type TheoremVocabulary
} from '../../markdown/syntax/theorem';

/** Materialize the app defaults and note declarations in temporary frontmatter. */
export function materializeTheoremMetadata(markdown: string): string {
  if (!containsTheorem(parseMarkdown(markdown))) {
    return markdown;
  }
  const range = frontmatterRange(markdown);
  const vocabulary = theoremVocabularyFromFrontmatter(range?.text ?? null);
  let document;
  try {
    document = parseDocument(range?.text ?? '');
  } catch {
    return markdown;
  }
  if (document.errors.length > 0) {
    return markdown;
  }
  const parsed = document.toJS() ?? {};
  if (!isRecord(parsed)) {
    return markdown;
  }
  const existing = isRecord(parsed.amsthm) ? parsed.amsthm : {};
  document.set('amsthm', exportMetadata(vocabulary, existing));
  const block = `---\n${String(document).trimEnd()}\n---`;
  if (range === null) {
    return `${block}\n\n${markdown}`;
  }
  return `${markdown.slice(0, range.from)}${block}${markdown.slice(range.to)}`;
}

/** The metadata object the upstream filter reads for this document. */
export function exportMetadata(
  vocabulary: TheoremVocabulary,
  existing: Record<string, unknown> = {}
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...existing };
  const styles = new Set(
    vocabulary.types
      .map((type) => type.style)
      .filter((style) => style !== 'proof')
  );
  for (const style of styles) {
    metadata[style] = declarationsFor(style, vocabulary.types);
  }
  const names = isRecord(existing.name_to_text)
    ? { ...existing.name_to_text }
    : {};
  const parentCounters = isRecord(existing.parent_counter)
    ? { ...existing.parent_counter }
    : {};
  for (const type of vocabulary.types) {
    if (type.style === 'proof') continue;
    if (type.displayName !== defaultTheoremTitle(type.className)) {
      names[type.className] = type.displayName;
    }
    if (type.parentCounter !== null) {
      parentCounters[type.className] = type.parentCounter;
    }
  }
  metadata.name_to_text = names;
  if (Object.keys(parentCounters).length > 0) {
    metadata.parent_counter = parentCounters;
  }
  return metadata;
}

function declarationsFor(style: string, types: readonly TheoremType[]): unknown[] {
  const grouped = new Map<string, TheoremType[]>();
  for (const type of types.filter((candidate) => candidate.style === style)) {
    const group = grouped.get(type.counter) ?? [];
    group.push(type);
    grouped.set(type.counter, group);
  }
  return [...grouped.values()].map((group) => {
    const parent = group.find((type) => type.className === type.counter) ?? group[0];
    const parentName = declarationName(parent);
    const children = group.filter((type) => type !== parent).map(declarationName);
    return children.length === 0 ? parentName : { [parentName]: children };
  });
}

function declarationName(type: TheoremType): string {
  return `${type.className}${type.numbered ? '' : '*'}`;
}

function containsTheorem(tree: { children?: unknown[] }): boolean {
  for (const child of tree.children ?? []) {
    if (!isRecord(child)) continue;
    if (child.type === 'theorem' || containsTheorem(child)) return true;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
