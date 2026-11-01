/**
 * Parses the raw source of a pandoc citation node into the pieces CSL needs.
 *
 * May import: nothing. Upholds: one reading of a citation's own characters — keys, prefix, suffix,
 * locator, suppression — so the formatter and the offset model see the same citation.
 */

/**
 * Parses the raw source of a pandoc citation node into the pieces CSL needs:
 * citation key(s), optional prefix/suffix, locator, and the suppression flag.
 * The source is exactly what the micromark plugin captured (`@key`,
 * `@key [p. 33]`, `[@smith2020, p. 45]`, `[see @smith2020; also @jones2019]`).
 */

export interface CitationItem {
  id: string;
  prefix?: string;
  suffix?: string;
  locator?: string;
  label?: string;
  suppressAuthor?: boolean;
}

export interface ParsedCitation {
  mode: 'narrative' | 'parenthetical';
  items: CitationItem[];
}

/** Pandoc locator labels mapped to the CSL label names citeproc understands. */
const LABEL_MAP: ReadonlyArray<readonly [string[], string]> = [
  [['p.', 'pp.'], 'page'],
  [['ch.', 'chap.', 'chapter'], 'chapter'],
  [['sec.', 'secs.', 'section'], 'section'],
  [['fig.', 'figs.', 'figure'], 'figure'],
  [['vol.', 'vols.', 'volume'], 'volume'],
  [['no.', 'nos.', 'issue'], 'issue'],
  [['para.', 'par.', 'paragraph'], 'paragraph'],
  [['pt.', 'pts.', 'part'], 'part'],
  [['line', 'lines'], 'line'],
  [['n.', 'note'], 'note'],
  [['col.', 'column'], 'column'],
  [['fol.', 'folio'], 'folio'],
  [['verse', 'v.'], 'verse'],
  [['book'], 'book'],
  [['opus'], 'opus'],
  [['s.v.', 'sub verbo'], 'sub-verbo']
];

/** Pandoc citation key characters (letters, digits, `_`, `:.#$%&-+?<>~/`). */
const KEY_CHARS = '[A-Za-z0-9_:#$%&+?<>~./-]+';

/**
 * Parses one Pandoc citation source into narrative or parenthetical items.
 *
 * Example: `parseCitation('[see @smith2020, p. 45; @jones2019]')` returns a
 * parenthetical citation whose first item has prefix `see`, id `smith2020`, and locator `45`.
 */
export function parseCitation(value: string): ParsedCitation {
  if (value.startsWith('[') && value.endsWith(']')) {
    return {
      mode: 'parenthetical',
      items: value
        .slice(1, -1)
        .split(';')
        .map((part) => parseCitationItem(part.trim()))
        .filter((item): item is CitationItem => item !== null)
    };
  }

  return {
    mode: 'narrative',
    items: [parseNarrative(value)].filter((item): item is CitationItem => item !== null)
  };
}

/**
 * Reads one parenthetical citation item.
 *
 * Example: `'see -@smith2020, p. 45, chapter 2'` returns id `smith2020`,
 * prefix `see`, locator `45`, label `page`, suffix `chapter 2`, and suppresses the author.
 */
function parseCitationItem(source: string): CitationItem | null {
  const match = source.match(new RegExp(`^(.*?)(-?)@(${KEY_CHARS})(.*)$`));
  if (!match) {
    return null;
  }
  const [, prefixRaw, suppress, id, rest] = match;
  const prefix = prefixRaw.trimEnd() || undefined;
  const { locator, label, suffix } = splitLocator(rest.replace(/^,\s*/, ''));
  return {
    id,
    ...(prefix !== undefined && { prefix }),
    ...(locator !== undefined && { locator, label }),
    ...(suffix !== undefined && { suffix }),
    ...(suppress === '-' && { suppressAuthor: true })
  };
}

/**
 * Reads one narrative citation item.
 *
 * Example: `'@smith2020 [p. 33]'` returns id `smith2020`, locator `33`, and label `page`.
 */
function parseNarrative(source: string): CitationItem | null {
  const match = source.match(new RegExp(`^(-?)@(${KEY_CHARS})(?:\\s*\\[([^\\]]*)\\])?$`));
  if (!match) {
    return null;
  }
  const [, suppress, id, bracketed] = match;
  const { locator, label, suffix } = splitLocator(bracketed?.trim() ?? '');
  return {
    id,
    ...(locator !== undefined && { locator, label }),
    ...(suffix !== undefined && { suffix }),
    ...(suppress === '-' && { suppressAuthor: true })
  };
}

/**
 * Splits text like `p. 45 and the following` into a locator (`45`, label
 * `page`) and a suffix (`and the following`). Without a locator label the
 * whole text is treated as a suffix.
 *
 * Example: `splitLocator('ch. 2 after revision')` returns
 * `{ locator: '2', label: 'chapter', suffix: 'after revision' }`.
 */
function splitLocator(text: string): {
  locator?: string;
  label?: string;
  suffix?: string;
} {
  if (!text) {
    return {};
  }
  const match = text.match(/^([A-Za-z.]+)\s+(\S+)(?:\s+([\s\S]*))?$/);
  if (match) {
    const [, labelRaw, locator, rest] = match;
    const label = LABEL_MAP.find(([aliases]) => aliases.includes(labelRaw))?.[1];
    if (label) {
      return {
        locator,
        label,
        ...(rest?.trim() !== undefined && rest.trim() !== '' && { suffix: rest.trim() })
      };
    }
  }
  return { suffix: text };
}
