/**
 * Serializes captioned code listings for the export writers.
 *
 * Example: HTML receives a `<figure>` with a caption, while LaTeX receives a
 * fenced highlight block whose native counter remains aligned with Yi's labels.
 *
 * May import: the listing node type and HTML escaping rules. Upholds: one
 * listing is written once per target family, with no editor state involved.
 */

import type { ListingNode } from '../../markdown/syntax/listings';
import { escapeHtml, htmlAttributeName } from './html';
import { attributeValue, escapeMarkdownText } from './markdown_escaping';

/** A processed-Markdown listing all common Markdown readers can draw. */
export function listingHtml(listing: ListingNode, label: string | null): string {
  const classes = [
    'listing',
    ...listing.classes.filter((name) => name !== listing.language)
  ];
  const attributes = [
    ...(listing.id === null ? [] : [`id="${escapeHtml(listing.id)}"`]),
    `class="${escapeHtml([...new Set(classes)].join(' '))}"`,
    ...Object.entries(listing.attributes)
      .filter(([key]) => key !== 'caption')
      .map(([key, value]) => `data-${htmlAttributeName(key)}="${escapeHtml(value)}"`)
  ];
  const language =
    listing.language === null ? '' : ` class="language-${escapeHtml(listing.language)}"`;
  const caption = listingCaptionText(label, listing.caption);
  return [
    `<figure ${attributes.join(' ')}>`,
    `  <pre><code${language}>${escapeHtml(listing.value)}</code></pre>`,
    `  <figcaption>${escapeHtml(caption ?? '')}</figcaption>`,
    '</figure>'
  ].join('\n');
}

/** A listing wrapped in one Pandoc Div so every non-LaTeX writer keeps its target and caption. */
export function pandocListing(listing: ListingNode, label: string | null): string {
  const wrapper = [
    ...(listing.id === null ? [] : [`#${listing.id}`]),
    '.listing'
  ];
  const caption = listingCaptionText(label, listing.caption);
  return [
    `::: {${wrapper.join(' ')}}`,
    fencedListing(listing, [], [], false),
    '',
    '::: {.listing-caption}',
    escapeMarkdownText(caption ?? ''),
    ':::',
    ':::'
  ].join('\n');
}

/** A LaTeX/PDF listing whose shape keeps native counters aligned with Yi's target sequence. */
export function latexListing(listing: ListingNode): string {
  if (listing.id !== null && listing.caption !== null) {
    return listing.source;
  }
  if (listing.id !== null) {
    return fencedListing(listing, [['caption', '\u200b']]);
  }
  return fencedListing(listing, [['title', listing.caption ?? '']], ['caption', 'title']);
}

/** The caption line shared by editor and rendered exports. */
function listingCaptionText(label: string | null, caption: string | null): string | null {
  if (label === null) {
    return caption;
  }
  return caption === null ? `${label}.` : `${label}. ${caption}`;
}

/** A canonical fenced block with only the attributes its caller asks to replace. */
function fencedListing(
  listing: ListingNode,
  extra: Array<[string, string]>,
  omit: readonly string[] = [],
  includeId = true
): string {
  const classes = [...new Set(listing.classes)];
  const attributes = Object.entries(listing.attributes).filter(
    ([key]) => !omit.includes(key) && key !== 'caption'
  );
  const tokens = [
    ...(listing.id === null || !includeId ? [] : [`#${listing.id}`]),
    ...classes.map((name) => `.${name}`),
    ...attributes.map(([key, value]) => `${key}="${attributeValue(value)}"`),
    ...extra.map(([key, value]) => `${key}="${attributeValue(value)}"`)
  ];
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(listing.value) + 1));
  const info = tokens.length === 0 ? '' : `{${tokens.join(' ')}}`;
  const body = listing.value.endsWith('\n') ? listing.value : `${listing.value}\n`;
  return `${fence}${info}\n${body}${fence}`;
}

/** Keep an opening-fence command from being closed by a backtick run in its body. */
function longestBacktickRun(value: string): number {
  return Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
}
