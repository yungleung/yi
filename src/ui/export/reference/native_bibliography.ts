/**
 * The portable bibliography a native-BibTeX LaTeX package receives.
 *
 * A package opts in through its Pandoc defaults, where a filter list without citeproc keeps TeX
 * citations and `bibliography: references.bib` names the relative file its template cites. This
 * module reads the citation keys the Markdown parser actually found, filters the reader's selected
 * BibTeX or CSL-JSON library to those works, and writes deterministic BibTeX for the output source.
 *
 * May import: the Markdown parser and citation rule, the citation library, and a YAML parser.
 * Upholds: the reader's selected library is authoritative, an uncited work never reaches the
 * output `.bib`, and a JSON citation key remains the key the exported TeX cites.
 */

import { Cite } from '@citation-js/core';
import { parse as parseYaml } from 'yaml';
import { loadCitationLibrary } from '../../../citations/library';
import { parseCitation } from '../../../citations/parse';
import type { AstCitation } from '../../markdown/ast';
import { parseMarkdown } from '../../markdown/syntax/parser';
import { spansOfType, type Walkable } from '../pipeline/node_spans';

/** The relative `.bib` file a package's defaults ask the app to generate, or null for citeproc. */
export function nativeBibliographyTarget(defaultsText: string): string | null {
  let defaults: unknown;
  try {
    defaults = parseYaml(defaultsText);
  } catch {
    return null;
  }
  if (!isRecord(defaults)) {
    return null;
  }
  const filters = defaults.filters;
  if (!Array.isArray(filters) || filters.some(isCiteproc)) {
    return null;
  }
  const bibliography = defaults.bibliography;
  const first = Array.isArray(bibliography) ? bibliography[0] : bibliography;
  return typeof first === 'string' && safeBibtexTarget(first.trim()) ? first.trim() : null;
}

/** The citation keys the editor's own Markdown parser found, once each in first-citation order. */
export function citedKeys(markdown: string): string[] {
  const tree = parseMarkdown(markdown) as unknown as Walkable;
  const keys: string[] = [];
  for (const span of spansOfType(tree, 'citation')) {
    for (const item of parseCitation((span.node as AstCitation).value).items) {
      if (!keys.includes(item.id)) {
        keys.push(item.id);
      }
    }
  }
  return keys;
}

/** The cited entries from one selected library, as BibTeX, plus keys that library does not hold. */
export function packageCitedBibliography(
  source: string,
  keys: readonly string[]
): { text: string; missing: string[] } {
  if (keys.length === 0) {
    return { text: '', missing: [] };
  }
  const library = loadCitationLibrary(source);
  const byKey = new Map((library?.items ?? []).map((item) => [item.key, item.value]));
  const selected: Record<string, unknown>[] = [];
  const missing: string[] = [];
  for (const key of [...new Set(keys)]) {
    const item = byKey.get(key);
    if (item === undefined) {
      missing.push(key);
    } else {
      selected.push(item);
    }
  }
  if (selected.length === 0) {
    return { text: '', missing };
  }
  const text = new Cite(selected as never).format('bibtex').trimEnd();
  return { text: text === '' ? '' : `${text}\n`, missing };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCiteproc(filter: unknown): boolean {
  return (
    filter === 'citeproc' ||
    (isRecord(filter) && String(filter.type ?? '').toLowerCase() === 'citeproc')
  );
}

function safeBibtexTarget(path: string): boolean {
  return (
    path.toLowerCase().endsWith('.bib') &&
    !path.startsWith('/') &&
    !path.includes(':') &&
    !path.includes('\\') &&
    !path.split('/').includes('..') &&
    path
      .split('/')
      .every((part) => part !== '' && part !== '.')
  );
}
