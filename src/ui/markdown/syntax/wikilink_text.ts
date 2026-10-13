/**
 * What is between a wikilink's brackets, and what it reads as on the page.
 *
 * The construct itself belongs to the parser (`plugins/remark-wikilink`): this is the *inside* of
 * it, `[[target]]` or `[[target|title]]`, and the display text that follows from it — the title
 * after the `|`, or the title of the document the target names when the app can resolve one, and
 * the target itself when it cannot, which is the one thing every reader of a wikilink gets whether
 * or not the workspace holds the note it names.
 *
 * It lived inside the rendered node, which is also where a *second* reader appeared: an export
 * writes the same text into the document it hands to pandoc, and a node that draws DOM is no place
 * to read a rule from. One home, so what a wikilink draws and what an export writes cannot drift.
 *
 * May import: nothing. Upholds: one fact about markdown syntax — what a wikilink's brackets hold —
 * has one home.
 */

/** The target a wikilink names, and the text it is shown as when its source names one. */
export interface WikilinkParts {
  /** The document the link names: a file name, or the frontmatter id of a note. */
  target: string;
  /** What the author chose to call it, or null when the source names no title of its own. */
  title: string | null;
}

/** The parts of `[[target]]` or `[[target|title]]`. */
export function wikilinkParts(value: string): WikilinkParts {
  const inner = value.slice(2, -2);
  const separator = inner.indexOf('|');
  if (separator >= 0) {
    const target = inner.slice(0, separator).trim();
    const title = inner.slice(separator + 1).trim();
    return { target, title: title || null };
  }
  return { target: inner.trim(), title: null };
}

/**
 * What the link reads as, given what the app knows about its target: `resolved` is the title of the
 * document the target names — null when there is none, or when the app has not been asked.
 */
export function wikilinkText(parts: WikilinkParts, resolved: string | null): string {
  return parts.title ?? resolved ?? parts.target;
}
