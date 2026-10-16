/**
 * The pictures in a note that an export cannot use **as pictures**: an image whose destination is a
 * `data:` URL naming something that is not an image.
 *
 * The card's hint is this rule's only reader (`export_dialog.ts`), and what it answers with is the
 * destinations themselves — what the export would carry as a file rather than draw — not what to do
 * about it, which is an edit only the reader can make.
 *
 * A `data:` URL is the one destination whose kind the note itself writes down, so it is the one this
 * rule can judge without asking the machine: `data:image/png;base64,…` is a picture every kind
 * carries, and `data:text/plain;base64,…` is no picture at all. Measured with pandoc 3.12: a docx
 * carries such a destination into `word/media/` as a `.txt` and says *nothing* — a document with a
 * broken picture and no warning at all — and a pdf is left to pandoc's own words about the file it
 * made of it (`Cannot load file`, `Jpeg Invalid marker used`, naming a temporary path the reader has
 * never seen). So the app says which destination it is, in the reader's language, before the export.
 *
 * A destination that is not a `data:` URL is not this rule's business: what a file holds is something
 * pandoc finds out, and the app hands it over as the file it is.
 *
 * May import: the parser, the AST and the span walk — this is a rule about the note, not about the
 * machine. Upholds: one fact about a note has one home, which is what lets `check-picture-hint.mjs`
 * hold it in Node.
 */
import { parseMarkdown } from '../markdown/syntax/parser';
import type { AstImage } from '../markdown/ast';
import { spansOfType, type Walkable } from './node_spans';

/**
 * Whether a destination is a `data:` URL naming something that is not an image. The media type is the
 * first thing after `data:`, and an image is a media type that starts with `image/`; a URL that names
 * none at all (`data:;base64,…`) is `text/plain` by the URL's own rule, so it names no image either.
 */
export function namesNoImage(destination: string): boolean {
  const media = /^data:\s*([^,;]*)/i.exec(destination.trim());
  return media !== null && !/^image\//i.test(media[1].trim());
}

/**
 * The destinations of the note's images that name no image, each once, in the order they are written —
 * read from the parse, so a `data:` URL inside a fence or a code span is not an image destination and
 * is not reported.
 */
export function destinationsThatNameNoImage(text: string): string[] {
  const tree = parseMarkdown(text) as unknown as Walkable;
  const named = spansOfType(tree, 'image').map((span) => (span.node as AstImage).url);
  return [...new Set(named.filter((destination) => namesNoImage(destination)))];
}
