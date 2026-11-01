/**
 * Reads Pandoc's brace-delimited attribute grammar.
 *
 * Heading and figure syntax decide where an attribute block may stand; this
 * module owns what the tokens inside it mean. It preserves the exact source
 * span and separator so rendering and serialization never reconstruct the
 * author's spelling.
 *
 * May import: nothing — the source and content boundary are passed in. Upholds:
 * one fact about markdown syntax has one home.
 */

/** Parsed identifiers, classes, and key/value attributes. */
export interface PandocAttributes {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
}

/** A trailing attribute block with its source coordinates. */
export interface PandocAttributeBlock extends PandocAttributes {
  /** Start of `{`. */
  from: number;
  /** End just after `}`. */
  to: number;
  /** The exact `{…}` source. */
  source: string;
  /** Start of whitespace before `{`, or {@link from} when none is required. */
  separatorFrom: number;
  /** The exact separator whitespace. */
  separator: string;
}

/**
 * The attribute block ending a content span, or null when the span ends in any
 * other text. `requireWhitespace` distinguishes headings from image attributes.
 *
 * Example: for `'Heading {#intro .wide owner=demo}'`, the result has id `intro`,
 * classes `['wide']`, attribute `{ owner: 'demo' }`, and exact source `'{#intro .wide owner=demo}'`.
 */
export function attributeBlockAtEnd(
  source: string,
  contentEnd: number,
  requireWhitespace: boolean
): PandocAttributeBlock | null {
  const trimmedEnd = trimSpacesBack(source, contentEnd);
  if (trimmedEnd <= 0 || source[trimmedEnd - 1] !== '}') {
    return null;
  }
  const open = matchingOpenBrace(source, trimmedEnd - 1);
  if (open < 0) {
    return null;
  }
  if (requireWhitespace && (open <= 0 || !/\s/.test(source[open - 1]))) {
    return null;
  }
  const parsed = parseAttributeTokens(source.slice(open + 1, trimmedEnd - 1));
  if (parsed === null) {
    return null;
  }
  const separatorFrom = requireWhitespace ? trimSpacesBack(source, open) : open;
  return {
    from: open,
    to: trimmedEnd,
    source: source.slice(open, trimmedEnd),
    separatorFrom,
    separator: source.slice(separatorFrom, open),
    ...parsed
  };
}

/**
 * Move back over ASCII spaces and tabs.
 *
 * Example: `trimSpacesBack('title  ', 7)` returns `5`.
 */
export function trimSpacesBack(source: string, at: number): number {
  let end = Math.max(0, Math.min(at, source.length));
  while (end > 0 && (source[end - 1] === ' ' || source[end - 1] === '\t')) {
    end -= 1;
  }
  return end;
}

/** The opening brace pairing with the final `}`, ignoring quoted braces. */
function matchingOpenBrace(source: string, close: number): number {
  let open = -1;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index <= close; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{') {
      open = index;
    } else if (character === '}' && index !== close) {
      return -1;
    }
  }
  return quote === null ? open : -1;
}

/** Parse the inside of `{…}` into identifier, classes, and attributes. */
function parseAttributeTokens(value: string): PandocAttributes | null {
  const tokens = splitAttributeTokens(value);
  if (tokens === null || tokens.length === 0) {
    return null;
  }
  let id: string | null = null;
  const classes: string[] = [];
  const attributes: Record<string, string> = {};
  for (const token of tokens) {
    if (token.startsWith('#') && token.length > 1) {
      id = unescapeAttribute(token.slice(1));
      continue;
    }
    if (token.startsWith('.') && token.length > 1) {
      classes.push(unescapeAttribute(token.slice(1)));
      continue;
    }
    const equals = token.indexOf('=');
    if (equals <= 0) {
      return null;
    }
    const key = unescapeAttribute(token.slice(0, equals));
    const raw = token.slice(equals + 1);
    if (key === '' || raw === '') {
      return null;
    }
    attributes[key] = unescapeAttribute(
      (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw
    );
  }
  return { id, classes, attributes };
}

/** Split on whitespace outside quotes, retaining escapes for value parsing. */
function splitAttributeTokens(value: string): string[] | null {
  const tokens: string[] = [];
  let token = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      token += `\\${character}`;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      token += character;
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      token += character;
      continue;
    }
    if (/\s/.test(character)) {
      if (token !== '') {
        tokens.push(token);
        token = '';
      }
      continue;
    }
    if (character === '{' || character === '}') {
      return null;
    }
    token += character;
  }
  if (escaped || quote !== null) {
    return null;
  }
  if (token !== '') {
    tokens.push(token);
  }
  return tokens;
}

/** Resolve the escaping Pandoc allows inside an attribute token. */
function unescapeAttribute(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}
