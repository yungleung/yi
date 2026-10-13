/**
 * The note as an export reads it: the step every kind of export shares, before pandoc is handed
 * anything.
 *
 * Pandoc reads markdown and knows nothing of `[[…]]`, so a wikilink has to be written the way the
 * page draws it: the title after the `|`, or the title of the document the target names, or the
 * target itself when no note answers to it. What a wikilink says is `syntax/wikilink_text.ts`'s
 * rule and what a wikilink *is* is the parser's construct, so this walks the parse instead of
 * scanning for brackets: a `[[…]]` inside a code fence, an inline code span or frontmatter is not a
 * wikilink to the parser, and so it is not one in an export either.
 *
 * Resolving titles is the app's answer rather than this module's — it takes the lookup as an
 * argument — which is what keeps this a rule about text, testable in Node, and what lets a caller
 * that has no workspace (or no answer) write the targets themselves.
 *
 * May import: the parser pipeline and the wikilink rule, both from the syntax layer. Upholds: one
 * fact about markdown syntax has one home, and the document text stays the only source of truth —
 * this reads the text and answers a new text, it never edits the note.
 */

import type { AstNode, AstWikilink } from '../markdown/ast';
import { parseMarkdown } from '../markdown/syntax/parser';
import { wikilinkParts, wikilinkText, type WikilinkParts } from '../markdown/syntax/wikilink_text';

/** The title of the document a wikilink names, or null when nothing in the workspace answers. */
export type TitleLookup = (target: string) => Promise<string | null>;

/** One wikilink's span in the document, and what its brackets hold. */
interface WikilinkSpan {
  start: number;
  end: number;
  parts: WikilinkParts;
}

/**
 * `text` with every wikilink replaced by the words it renders as. Everything else in the document
 * is left exactly as it was written, character for character.
 */
export async function withRenderedWikilinks(text: string, titleOf: TitleLookup): Promise<string> {
  const spans = wikilinkSpans(text);
  if (spans.length === 0) {
    return text;
  }

  const titles = new Map<string, string | null>();
  await Promise.all(
    // Only the links that need an answer are asked about: one that names its own text has its
    // answer already, and a target the workspace holds no note for is asked once, not once a link.
    [
      ...new Set(
        spans
          .filter((span) => span.parts.title === null && span.parts.target !== '')
          .map((span) => span.parts.target)
      )
    ].map(async (target) => {
      // An empty answer is no answer: a title that is the empty string would write nothing at all.
      titles.set(target, (await titleOf(target)) || null);
    })
  );

  // Backwards, so a replacement cannot move the span of one that has not been made yet.
  let replaced = text;
  for (const span of [...spans].sort((one, other) => other.start - one.start)) {
    const text = wikilinkText(span.parts, titles.get(span.parts.target) ?? null);
    replaced = replaced.slice(0, span.start) + text + replaced.slice(span.end);
  }
  return replaced;
}

/** Every wikilink in the document, in the order they are written, by their document offsets. */
function wikilinkSpans(text: string): WikilinkSpan[] {
  const spans: WikilinkSpan[] = [];
  visit(parseMarkdown(text) as unknown as Walkable, (node) => {
    if (node.type !== 'wikilink') {
      return;
    }
    const wikilink = node as AstWikilink;
    const start = wikilink.position?.start.offset;
    const end = wikilink.position?.end.offset;
    if (start === undefined || end === undefined) {
      return;
    }
    spans.push({ start, end, parts: wikilinkParts(wikilink.value) });
  });
  return spans;
}

/** A node of a parse, as much of it as walking needs. */
interface Walkable {
  children?: Walkable[];
}

/** Every node of a parse, parents before children. */
function visit(node: Walkable, at: (node: AstNode) => void): void {
  at(node as unknown as AstNode);
  for (const child of node.children ?? []) {
    visit(child, at);
  }
}
