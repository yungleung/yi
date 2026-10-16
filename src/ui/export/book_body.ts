/**
 * The text a *book* is handed: the note's own level-1 heading, with the note's name standing in it
 * when the note writes none.
 *
 * A note may keep its level-1 heading in the frontmatter's `title:` rather than write one into the
 * body — a `## section` under such a note is a section of the note, not of nothing. Pandoc's EPUB
 * writer knows half of that: the body's first chunk has no level-1 heading, so the writer makes one
 * out of the book's own name and nests what follows inside it. What it cannot know is that the
 * *note's* headings have to share an id-space with that name: the writer's heading is not part of
 * the document pandoc makes identifiers unique in, so a note whose `## Going out` repeats the name
 * comes out with two elements claiming `going-out` — measured with pandoc 3.12 and epubcheck 5.4.0,
 * `Duplicate ID "going-out"` twice, and `test/checks/check-epub-valid.mjs` is where that book is
 * asked about. So the name is written *into* the note where its level-1 heading belongs, and the
 * writer's own heading is never made: the note's `## Going out` then takes the id pandoc gives the
 * second of two headings that say the same words.
 *
 * The name is written as the note writes it — prose, and *markdown* when it is markdown, which is
 * how the metadata title is read — because a name taken from a heading's line is that line.
 *
 * May import: the note-text rules (`services/document_identity.ts`). Upholds: the note itself is
 * never edited — this answers the text a book is handed, and the frontmatter stays where it was.
 */
import { frontmatterEnd } from '../../services/document_identity';

/**
 * Whether the note's own text opens with a level-1 heading: the body's first line, blank lines and
 * the frontmatter aside, is `#` at the line's own beginning (header text after a space or a tab, or
 * nothing at all, which markdown reads as an empty heading). `##` is a section rather than the note's
 * own title, `#foo` is prose, and so is `# A` with three spaces in front of it — measured: pandoc
 * reads that as a paragraph, so a `#` that does not stand at the line's beginning is not a heading.
 */
export function opensWithItsOwnHeading(text: string): boolean {
  const body = text.slice(frontmatterEnd(text)).replace(/^(?:[ \t]*\r?\n)+/, '');
  return /^#(?:[ \t]|\r?\n|$)/.test(body);
}

/**
 * The note with its name above it as the level-1 heading it does not write for itself — or exactly
 * the note it was handed, when the note opens with a heading of its own or has no name to write.
 */
export function bodyWithItsName(text: string, name: string | null): string {
  // A name is one line of a note or a file's own name, so a line break in one would put the rest of
  // the name below the heading, as a paragraph of the note.
  const words = (name ?? '').replace(/\s*\n\s*/g, ' ').trim();
  if (words === '' || opensWithItsOwnHeading(text)) {
    return text;
  }
  const at = frontmatterEnd(text);
  const heading = `# ${words}\n`;
  const under = text.slice(at).replace(/^[\r\n]+/, '');
  return at === 0 ? `${heading}\n${under}` : `${text.slice(0, at)}\n${heading}\n${under}`;
}
