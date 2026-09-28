/**
 * What a document's own text says about it: the id it is known by and the title it is shown
 * under.
 *
 * The id is the `id` its frontmatter carries, or the first fourteen digits anywhere in the
 * text — an id is a `YYYYMMDDHHMMSS` stamp — and only a document with neither falls back to
 * the file it was read from. The title is the frontmatter `title`, the first heading, the file
 * name, or `Untitled`.
 *
 * May import: nothing. Upholds: one reader for each rule — the wikilink resolver's id index,
 * the tree's *Copy id*, and the session's stack all ask here rather than keeping a copy of the
 * pattern, so a document is the same document to all of them.
 */

/** The frontmatter block's own text, or null when the document has none. */
export function readFrontmatterBlock(content: string): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
}

/** The `title` the frontmatter gives, or null. */
export function readFrontmatterTitle(content: string): string | null {
  const frontmatter = readFrontmatterBlock(content);
  if (!frontmatter) {
    return null;
  }
  const match = frontmatter.match(/^\s*title:\s*(.+?)\s*$/m);
  return match ? unquote(match[1]) : null;
}

/** The `id` the frontmatter gives, or null. */
export function readFrontmatterId(content: string): string | null {
  const frontmatter = readFrontmatterBlock(content);
  if (!frontmatter) {
    return null;
  }
  const match = frontmatter.match(/^\s*id:\s*(.+?)\s*$/m);
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
  const body = readFrontmatterBlock(content)
    ? content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    : content;
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
