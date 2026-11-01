/**
 * Escaping for the small HTML fragments the app writes itself.
 *
 * Processed Markdown turns figures and captioned tables into HTML so ordinary
 * Markdown readers display them without a Yi parser or a Pandoc run.
 *
 * May import: nothing. Upholds: every value the app places in HTML text or a
 * quoted attribute is escaped once, by the same rule.
 */

/**
 * Escape text placed in an HTML element body or a quoted attribute value.
 *
 * Example: `'<b>"A & B"</b>'` becomes
 * `'&lt;b&gt;&quot;A &amp; B&quot;&lt;/b&gt;'`.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Map a Pandoc key into a safe HTML data-attribute name.
 *
 * Example: `'owner email'` becomes `'owner-email'`; an empty key becomes `'value'`.
 */
export function htmlAttributeName(key: string): string {
  const safe = key.replace(/[^A-Za-z0-9_.:-]/g, '-');
  return safe === '' ? 'value' : safe;
}
