/**
 * Reads Pandoc's trailing attribute block from an ATX or setext heading.
 *
 * The block is recognized only at the end of the heading's content and only
 * when whitespace separates it from the title. The returned offsets cover the
 * separating whitespace and braces exactly, so the editor can reveal and edit
 * the author's source without reconstructing it.
 *
 * May import: nothing — the heading source is passed in. Upholds: one fact
 * about markdown syntax has one home, and this is the home of what a heading
 * attribute block is.
 */

/** A trailing Pandoc attribute block, in heading-source coordinates. */
export interface HeadingAttributeBlock {
  /** Start of `{`, after the separating whitespace. */
  from: number;
  /** End just after `}`, exclusive. */
  to: number;
  /** The exact source from {@link from} to {@link to}. */
  source: string;
  /** Start of the whitespace separator that the parser removes from the title. */
  separatorFrom: number;
  /** The exact whitespace between the heading text and `{`. */
  separator: string;
  /** The explicit identifier (`#id`), or null. */
  id: string | null;
  /** Class names (`.class`), in source order. */
  classes: string[];
  /** Key/value attributes, with one value per key. */
  attributes: Record<string, string>;
}

interface ParsedAttributes {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
}

/**
 * The heading's trailing attribute block, or null when its source does not end
 * in one. ATX closing hashes are allowed after the block.
 */
export function readHeadingAttributes(source: string): HeadingAttributeBlock | null {
  const contentEnd = headingContentEnd(source);
  if (contentEnd === null) {
    return null;
  }
  const trimmedEnd = trimSpacesBack(source, contentEnd);
  if (trimmedEnd <= 0 || source[trimmedEnd - 1] !== '}') {
    return null;
  }
  const open = matchingOpenBrace(source, trimmedEnd - 1);
  if (open <= 0 || !/\s/.test(source[open - 1])) {
    return null;
  }
  const parsed = parseAttributeTokens(source.slice(open + 1, trimmedEnd - 1));
  if (parsed === null) {
    return null;
  }
  const separatorFrom = trimSpacesBack(source, open);
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
 * Where a heading's own content ends: before optional ATX closing hashes, or
 * before a setext underline.
 */
function headingContentEnd(source: string): number | null {
  const firstEnd = source.indexOf('\n');
  const firstLineEnd = firstEnd < 0 ? source.length : firstEnd;
  const firstLine = source.slice(0, firstLineEnd);
  if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(firstLine)) {
    let contentEnd = trimSpacesBack(source, firstLineEnd);
    const closing = /[ \t]+#+$/.exec(firstLine.slice(0, contentEnd));
    if (closing) {
      contentEnd = trimSpacesBack(source, closing.index);
    }
    return contentEnd;
  }

  const trimmed = source.replace(/[ \t\r\n]+$/, '');
  const underlineAt = trimmed.lastIndexOf('\n');
  if (
    underlineAt < 0 ||
    !/^ {0,3}(?:=+|-+)[ \t]*$/.test(trimmed.slice(underlineAt + 1))
  ) {
    return null;
  }
  const titleEnd = underlineAt;
  const titleStart = trimmed.lastIndexOf('\n', underlineAt - 1) + 1;
  if (titleStart >= titleEnd) {
    return null;
  }
  return titleEnd;
}

/** Move back over ASCII spaces and tabs. */
function trimSpacesBack(source: string, at: number): number {
  let end = Math.max(0, Math.min(at, source.length));
  while (end > 0 && (source[end - 1] === ' ' || source[end - 1] === '\t')) {
    end -= 1;
  }
  return end;
}

/**
 * The opening brace that pairs with the final `}`, ignoring braces in quoted
 * strings. Returns -1 when the block has a nested brace or an unclosed quote.
 */
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

/** Parse the inside of `{…}` into identifier, classes and key/value attributes. */
function parseAttributeTokens(value: string): ParsedAttributes | null {
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

/**
 * Split on whitespace outside quotes, retaining escapes for the value parser.
 * Null means an unterminated quote, escape or a brace: the block is not valid.
 */
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
