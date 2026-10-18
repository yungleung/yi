/**
 * What a document's own text says about it: the id it is known by and the title it is shown
 * under.
 *
 * The id is the `id` its frontmatter carries, or the first fourteen digits anywhere in the
 * text — an id is a `YYYYMMDDHHMMSS` stamp — and only a document with neither falls back to
 * the file it was read from. The title is the frontmatter `title`, the first heading, the file
 * name, or `Untitled`.
 *
 * May import: the YAML parser. Upholds: one reader for each rule — the wikilink resolver's id
 * index, the tree's *Copy id*, and the session's stack all ask here rather than keeping a copy of
 * the pattern, so a document is the same document to all of them.
 */

import { parseDocument } from 'yaml';

/**
 * The frontmatter block: `---`, its lines, then `---` or YAML's `...` end marker — the one shape
 * every reader of it agrees on, so a caller that wants the text under it and one that wants to
 * write *there* read the same pattern.
 */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)/;

/** The frontmatter block's own text, or null when the document has none. */
export function readFrontmatterBlock(content: string): string | null {
  const match = content.match(FRONTMATTER);
  return match ? match[1] : null;
}

/**
 * Where the frontmatter stops — the offset just past its closing marker, or 0 when the document has
 * none. What a caller writes *under* it needs the cut, where reading a key out of it wants the text.
 */
export function frontmatterEnd(content: string): number {
  const match = content.match(FRONTMATTER);
  return match === null ? 0 : (match.index ?? 0) + match[0].length;
}

/** The fields the app knows by name. Every one is text; a key the note does not give is null. */
export interface FrontmatterFields {
  title: string | null;
  id: string | null;
  lang: string | null;
}

/**
 * The app's three fields, read as YAML.
 *
 * The parser is the one that understands what a value is: a quoted string holding a colon, a
 * comment after the value, a folded block, or an `id` with leading zeros. The *failsafe* schema is
 * deliberate — it keeps every scalar as the text it was written as, so an id never becomes a
 * number and a title never becomes a date or a boolean.
 *
 * A header the parser refuses (a duplicate key, an unclosed quote) is read the way it was before
 * the parser: a titled line is still a title, and a broken one costs a reader nothing. That
 * fallback is the only place the line pattern survives.
 */
export function readFrontmatterFields(content: string): FrontmatterFields {
  const frontmatter = readFrontmatterBlock(content);
  if (!frontmatter) {
    return { title: null, id: null, lang: null };
  }
  try {
    const doc = parseDocument(frontmatter, { schema: 'failsafe' });
    if (doc.errors.length > 0) {
      return fieldsFromLines(frontmatter);
    }
    return {
      title: scalarText(doc.get('title')),
      id: scalarText(doc.get('id')),
      lang: scalarText(doc.get('lang'))
    };
  } catch {
    return fieldsFromLines(frontmatter);
  }
}

/** The `title` the frontmatter gives, or null. */
export function readFrontmatterTitle(content: string): string | null {
  return readFrontmatterFields(content).title;
}

/** The `id` the frontmatter gives, or null. */
export function readFrontmatterId(content: string): string | null {
  return readFrontmatterFields(content).id;
}

/**
 * The `lang` the frontmatter gives, or null — the language the *note* is written in, which is not
 * the language the app is speaking. An export hands pandoc the app's own language when the note is
 * silent (`ui/export/export_flow.ts`), so a note that says one has to be read here rather than
 * overruled there.
 */
export function readFrontmatterLang(content: string): string | null {
  return readFrontmatterFields(content).lang;
}

/** A parsed scalar as the text it is, or null for a value this app cannot use as text. */
function scalarText(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text === '' ? null : text;
  }
  return null;
}

/** The three fields read from their lines, for a header the YAML parser could not read. */
function fieldsFromLines(frontmatter: string): FrontmatterFields {
  return {
    title: lineField(frontmatter, 'title'),
    id: lineField(frontmatter, 'id'),
    lang: lineField(frontmatter, 'lang')
  };
}

/** A key's own line, read the way this module did before it had a parser. */
function lineField(frontmatter: string, key: string): string | null {
  const match = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm').exec(frontmatter);
  return match ? unquote(match[1]) : null;
}

/**
 * The first fourteen digits at the *top* of the document — an id written without a key of its
 * own. Whole runs only (a longer number is not an id), and only before the first blank line.
 *
 * The limit is not decoration: a note that links to another by its id — `[[20221031105857]]`,
 * which is how this app's wikilinks name a note — mentions a stamp deep in its text that is not
 * its own name. Measured on the fixture workspace, whose two documents both mention
 * `20221031105857`: reading the whole text gave them the same id, and the session then took the
 * second document for the one already open. Read at the top, neither has an id and both fall
 * back to their paths, which is what they are.
 */
export function firstIdDigits(content: string): string | null {
  const opening = content.split(/\r?\n\s*\r?\n/, 1)[0] ?? '';
  const match = opening.match(/(?<!\d)(\d{14})(?!\d)/);
  return match ? match[1] : null;
}

/** The id a document answers to, or null when nothing in it or its path names one. */
export function documentId(content: string, path: string | null): string | null {
  return readFrontmatterId(content) ?? firstIdDigits(content) ?? path;
}

/** The first `# heading` outside the frontmatter, or null. */
export function firstHeading(content: string): string | null {
  const body = content.slice(frontmatterEnd(content));
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/** The file's name without its folder or its extension, or null when there is no path. */
export function fileStem(path: string | null): string | null {
  if (!path) {
    return null;
  }
  const name = path.split(/[\\/]/).pop() ?? '';
  const stem = name.replace(/\.[^.]+$/, '');
  return stem.length > 0 ? stem : null;
}

/** The title a document is shown under: what it calls itself, else the file it came from. */
export function documentTitle(content: string, path: string | null): string {
  return readFrontmatterTitle(content) ?? firstHeading(content) ?? fileStem(path) ?? 'Untitled';
}

/** A frontmatter value without the quotes an author may have wrapped it in. */
function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '').trim();
}
