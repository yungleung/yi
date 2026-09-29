/**
 * How a link is written: the brackets around its title, the destination after them,
 * the characters either one escapes, and where inside that the caret belongs.
 *
 * It also holds the two questions the app asks about a destination — whether the
 * clipboard is offering one (`clipboardDestination`) and whether the system browser
 * can be handed one (`isOpenableUrl`) — because both are answered by the same fact:
 * what a link's destination is. The preview card opens a link in a note by the
 * second rule, so the app has one answer rather than two.
 *
 * A link is written `[title](destination)`. A destination with a space, an angle
 * bracket or an unbalanced parenthesis cannot be written plainly — markdown would
 * read the `)` early — so it is wrapped in `<…>`, which is what CommonMark offers
 * for exactly that. The insertion's caret sits at the end of the *title*, so the next
 * keystroke writes the title of a link whose destination the clipboard already gave.
 *
 * May import: nothing — the text is passed in. Upholds: one fact about markdown
 * syntax has one home, and this is the home of what a link is written as.
 */

/** The markdown a link is written as, and where the caret sits inside it. */
export interface LinkInsertion {
  /** The raw markdown: `[title](destination)`. */
  markdown: string;
  /** The caret's offset within {@link markdown} — at the end of the title part. */
  caret: number;
}

/** The markdown for a link with this title and destination. */
export function linkInsertion(title: string, url: string | null): LinkInsertion {
  const text = escapeTitle(title);
  return {
    markdown: `[${text}](${destination(url)})`,
    // The title part is one character in, so an empty title is the position the
    // author types a title into; a title already written puts the caret at its end.
    caret: text.length + 1
  };
}

/**
 * The destination a clipboard offers, or null when it offers none.
 *
 * A destination is taken only when the clipboard holds exactly one token with a
 * scheme this app knows (`http:`, `https:`, `mailto:`) — a copied URL from a browser
 * or a mail link, and nothing else. Text with several words, a bare host
 * (`www.example.com`), a `javascript:` URL and an empty clipboard all mean "no
 * destination": the link is still written, and its author types the URL.
 */
export function clipboardDestination(text: string): string | null {
  const trimmed = text.trim();
  return /^(?:https?|mailto):\S+$/i.test(trimmed) ? trimmed : null;
}

/** Whether the system browser can be handed this href. */
export function isOpenableUrl(href: string): boolean {
  return /^https?:/i.test(href.trim());
}

/**
 * What a selection contributes to a title: its own words, without the whitespace a drag picks up
 * at either end. A link's title and an image's alt text are both written this way, because both
 * are held to the text the author meant to keep.
 */
export function selectionTitle(selected: string): { from: number; to: number; text: string } {
  const text = selected.replace(/^\s+|\s+$/g, '');
  const from = selected.length - selected.replace(/^\s+/, '').length;
  return { from, to: from + text.length, text };
}

/** The title part of a link, with the characters that would end it escaped. */
function escapeTitle(title: string): string {
  return title.replace(/[\\[\]]/g, (character) => `\\${character}`);
}

/** The destination part of a link: plain when markdown can read it, `<…>` when it cannot. */
function destination(url: string | null): string {
  const text = (url ?? '').trim();
  if (text === '') {
    return '';
  }
  return isPlainDestination(text) ? text : `<${text.replace(/[\\<>]/g, (character) => `\\${character}`)}>`;
}

/**
 * Whether a destination can be written without `<…>`: no whitespace (which would end
 * it), no angle brackets, and parentheses that balance — markdown counts them, so one
 * unclosed `)` would end the destination early.
 */
function isPlainDestination(text: string): boolean {
  if (/[\s<>]/.test(text)) {
    return false;
  }
  let depth = 0;
  for (const character of text) {
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }
  return depth === 0;
}
