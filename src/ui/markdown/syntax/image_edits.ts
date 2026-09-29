/**
 * How an image is written into the text: the markdown `![alt](destination)`, the destination a
 * clipboard is offering, and the name and kind of the file an image the app saves is written as.
 *
 * An image *is* a link with a `!` in front — CommonMark says so — so the escaping of its alt text
 * and the `<…>`-wrapping of a destination markdown cannot read plainly are the link's own rules,
 * and this module asks for them (`link_edits.ts: linkInsertion`) rather than keeping a second
 * copy. What is new here is what a destination may be: a link's clipboard holds a URL, while an
 * image's may also name a file on this disk, which the reader copied out of a terminal, a file
 * manager or a download.
 *
 * May import: the link's own shape (`link_edits.ts`). Upholds: one fact about an image in
 * markdown has one home, this one — the button that writes one, the dialog that names one, and
 * the check beside this file all read it from here.
 */

import { linkInsertion } from './link_edits';

/** The markdown an image is written as, and where the caret sits inside it. */
export interface ImageInsertion {
  /** The raw markdown: `![alt](destination)`. */
  markdown: string;
  /** The caret's offset within {@link markdown} — at the end of the alt text. */
  caret: number;
}

/** The markdown for an image with this alt text and destination. */
export function imageInsertion(alt: string, destination: string | null): ImageInsertion {
  const link = linkInsertion(alt, destination);
  return { markdown: `!${link.markdown}`, caret: link.caret + 1 };
}

/**
 * The extensions this app recognises as an image's, whether it can *write* one of them or not:
 * what a clipboard's path is allowed to end in.
 */
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif|bmp|avif|svg|tiff?)$/i;

/**
 * The destinations this app can *write*: what the webview's canvas encodes (see
 * `imageKindFor`). A name asking for anything else is written as a PNG, and says so.
 */
const WRITABLE_EXTENSION = /\.(?:png|jpe?g|webp)$/i;

/**
 * The destination a clipboard is offering, or null when it offers none.
 *
 * A destination is exactly one token — no whitespace, which is what tells a path from a
 * sentence — and either a web or file URL, or a path ending in one of the image kinds this app
 * knows. A path with a space in it, a file that is not an image (`notes.md`), a bare word and an
 * empty clipboard all mean "no destination": the image is still written, and its author types or
 * pastes one.
 */
export function clipboardImageDestination(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '' || /\s/.test(trimmed)) {
    return null;
  }
  if (/^(?:https?|file):\S+$/i.test(trimmed)) {
    return trimmed;
  }
  return IMAGE_EXTENSION.test(trimmed) ? trimmed : null;
}

/**
 * The alt text a destination suggests: its last path piece without the extension, so an image
 * pasted from a file or a URL arrives described by its own name rather than by nothing. A
 * destination with nothing to take answers an empty alt.
 */
export function imageTitleFromUrl(destination: string): string {
  const withoutQuery = destination.split(/[?#]/)[0];
  const piece = withoutQuery.split(/[\\/]/).pop() ?? '';
  const stem = piece.replace(/\.[^.]+$/, '');
  return decodeSafely(stem);
}

/**
 * The name a saved image is written under: what the reader typed, or the app's own stamp, with
 * the extension the file will really have (PNG unless the name asks for `.jpg`, `.jpeg` or
 * `.webp`).
 *
 * Null when what they typed could not be a file's name — it is a path (the settings say *which
 * folder*, so a separator in a name means they meant somewhere else), or it starts a hidden file,
 * which the tree hides and a reader would not find again.
 */
export function imageFileName(typed: string, stamp: string): string | null {
  const trimmed = typed.trim();
  const named = trimmed === '' ? `${stamp}.png` : withWritableExtension(trimmed);
  if (named.startsWith('.') || /[\\/]/.test(named)) {
    return null;
  }
  return named;
}

/** The mime an image is encoded as: what its name asks for, and PNG for anything else. */
export function imageKindFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/png';
}

/** A name with an extension this app can write — the reader's own, or `.png`. */
function withWritableExtension(name: string): string {
  if (WRITABLE_EXTENSION.test(name)) {
    return name;
  }
  return `${name.replace(/\.[^.]+$/, '')}.png`;
}

/** A URI-decoded string, or the string itself when it is not one that decodes. */
function decodeSafely(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
