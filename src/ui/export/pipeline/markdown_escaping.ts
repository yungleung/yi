/**
 * Escaping rules shared by generated export Markdown, links and Pandoc attributes.
 *
 * Example: `encodedPath("a b/c#d.png")` becomes `a%20b/c%23d.png`, which
 * Markdown and Pandoc read as one local file destination.
 *
 * May import: nothing. Upholds: one escaping rule exists once for every export
 * rewrite family that emits Markdown.
 */

/**
 * Escape document text placed in a generated Markdown caption paragraph.
 *
 * Example: `'A *bold* [note]'` becomes `'A \\*bold\\* \\[note\\]'`.
 */
export function escapeMarkdownText(text: string): string {
  return text.replace(/([\\`*_[\]{}<>#+\-!|])/g, '\\$1');
}

/**
 * Escape text used as an ordinary Markdown link label.
 *
 * Example: `'A [note]'` becomes `'A \\[note\\]'`.
 */
export function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, (character) => `\\${character}`);
}

/**
 * Escape one fragment identifier for a Markdown destination.
 *
 * Example: `'section one'` becomes `'section%20one'`.
 */
export function encodeFragment(id: string): string {
  return encodeURI(id);
}

/**
 * A quoted Pandoc attribute value.
 *
 * Example: `'a "quoted" path'` becomes `'a \\"quoted\\" path'`.
 */
export function attributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Encode every path segment while preserving separators.
 *
 * Example: spaces, `#`, parentheses, quotes and `%` become percent escapes that
 * Pandoc decodes again when fetching the picture.
 */
export function encodedPath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
