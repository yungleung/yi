/**
 * Derives the identifier Pandoc gives headings when the author supplies none.
 *
 * The heading text passed here is already plain text: links and formatting are
 * wrappers around it, and footnotes are omitted. The result follows Pandoc's
 * ASCII-punctuation rule while retaining letters and digits from every script.
 *
 * May import: nothing — the plain heading text is passed in. Upholds: one fact
 * about markdown syntax has one home, and this is the home of automatic heading
 * identifiers.
 */

/**
 * The automatic identifier of this plain heading text.
 *
 * Example: `pandocHeadingId('A Heading!')` returns `'a-heading'`; text with no
 * letter returns the fallback `'section'`.
 */
export function pandocHeadingId(text: string): string {
  const firstLetter = text.search(/\p{L}/u);
  if (firstLetter < 0) {
    return 'section';
  }
  const id = text
    .slice(firstLetter)
    .toLowerCase()
    .replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{N}\p{M}_.-]/gu, '');
  return id === '' ? 'section' : id;
}
