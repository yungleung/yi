/**
 * Loading the one bibliography file the app uses.
 *
 * The editor formats citations from it and a native-BibTeX export filters it, so both sides must
 * agree on what its keys are. CSL-JSON uses `citation-key` when present and its item id otherwise;
 * BibTeX already carries its entry key.
 *
 * May import: citation-js and its BibTeX/CSL plugins. Upholds: one parsed library and one key
 * rule for formatting, completion, previews and exported source packages.
 */

import { Cite, type CiteInstance } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';

export interface CitationLibraryItem {
  key: string;
  value: Record<string, unknown>;
}

export interface LoadedCitationLibrary {
  cite: CiteInstance;
  items: CitationLibraryItem[];
}

/**
 * Parses BibTeX or CSL-JSON into the library consumers format citations from.
 *
 * Example: a JSON array containing `{ id: 'smith2020', title: '...' }` produces one
 * item with key `'smith2020'`; an empty string or malformed source returns null.
 */
export function loadCitationLibrary(content: string): LoadedCitationLibrary | null {
  const trimmed = content.trim();
  if (trimmed === '') {
    return null;
  }
  try {
    const input = trimmed.startsWith('[')
      ? normalizeJsonItems(JSON.parse(trimmed) as unknown)
      : (content as never);
    const cite = new Cite(input as never);
    const data = Array.isArray(cite.data) ? cite.data : [];
    const items = data.flatMap((value) => {
      if (!isRecord(value)) {
        return [];
      }
      const raw = value['citation-key'] ?? value.id;
      const key = typeof raw === 'string' ? raw.trim() : '';
      return key === '' ? [] : [{ key, value }];
    });
    return { cite, items };
  } catch {
    return null;
  }
}

/** CSL-JSON export from Zotero: `citation-key` is the key the author writes in Markdown. */
function normalizeJsonItems(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error('a CSL-JSON bibliography must be an array');
  }
  return value.filter(isRecord).map((item) => ({
    ...item,
    id: item['citation-key'] ?? item.id,
    'citation-key': item['citation-key'] ?? item.id
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
