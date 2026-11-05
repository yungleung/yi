/**
 * The note as an export reads it: the rewrites every kind of export shares, before pandoc is handed
 * anything.
 *
 * Three rules, one step, and every one of them is the *app's* own answer rather than the converting
 * side's guess:
 *
 * - **a wikilink is written as the words it renders as** — the title after the `|`, the title of
 *   the document the target names, or the target itself when no note answers to it;
 * - **an image's destination is written as the file it names**, as an absolute path, because the
 *   page may show a picture pandoc would fail to find: the two folders a relative destination is
 *   read from (`services/workspace/folders.ts: destinationPaths`) and the spellings a copied path
 *   may use are the renderer's rules, and a hand-written `../` or a name with a space in it is
 *   exactly what an export has to get right. It is one path per image, so what the docx embeds is
 *   what the reader saw;
 * - **a citation is written as the words it reads as, and the works it names are listed under them**
 *   — for the kind the app writes itself, whose conversion is this pre-process and which has no
 *   citeproc behind it. Which kinds those are is the caller's answer (`ExportAnswers.citations`),
 *   because it is a fact about the *conversion* and not about the note: a kind pandoc writes leaves
 *   `[@key]` exactly as the author wrote it and lets citeproc render it.
 *
 * What a wikilink says is `syntax/wikilink_text.ts`'s rule and what a wikilink *is* is the parser's
 * construct, so this walks the parse instead of scanning for brackets: a `[[…]]` inside a code
 * fence, an inline code span or frontmatter is not a wikilink to the parser, and so it is not one
 * in an export either. An image's destination is read the same way — from the node the parser
 * built, never from the characters — and so is a citation, which is why a `[@key]` in a fence stays
 * the characters it was written as.
 *
 * Resolving a title and finding a file are the app's answers rather than this module's — both are
 * arguments — which is what keeps this a rule about text, testable in Node, and what lets a caller
 * with no workspace (or no file system) write the targets and the destinations themselves.
 *
 * May import: the parser pipeline, the wikilink rule, the path rule and the span walk the hint beside
 * it asks the same parse for, and that hint's web-destination rule. Upholds: one fact about markdown
 * syntax has one home, and the document text stays the only source of truth — this reads the text and
 * answers a new text, it never edits the note.
 */

import type { AstCitation, AstWikilink } from '../../markdown/ast';
import { parseMarkdown } from '../../markdown/syntax/parser';
import { wikilinkParts, wikilinkText } from '../../markdown/syntax/wikilink_text';
import { spansOfType, type Walkable } from '../node_spans';
import { tableRewrites } from './table_rewrites';
import { equationRewrites } from './equation_rewrites';
import { listRewrites } from './list_rewrites';
import { calloutRewrites } from './callout_rewrites';
import { isLatexKind } from '../kind_family';
import { imageRewrites } from './image_rewrites';
import { encodeFragment, escapeLinkText } from './markdown_escaping';
import {
  firstReference,
  referenceIndex,
  referenceLabel,
  type ReferenceEntry
} from '../../markdown/document/reference_index';
import type { ExportAnswers, Rewrite, TitleLookup } from './contracts';
import { applyRewrites } from './rewrites';
import { figureRewrites } from './figure_rewrites';
import { listingRewrites } from './listing_rewrites';
import { materializeTheoremMetadata } from './theorem_metadata';

export { materializeTheoremMetadata } from './theorem_metadata';

export type {
  CitationRendering,
  FileExists,
  TitleLookup
} from './contracts';
export type { ImageBases } from '../assets';
export type { ExportAnswers, Rewrite };

/** A theorem reference could not be emitted because its ID is also a citation key. */
export class TheoremCitationCollision extends Error {
  constructor(readonly id: string) {
    super(`theorem reference ${id} collides with a citation key`);
    this.name = 'TheoremCitationCollision';
  }
}

/**
 * The note as pandoc should read it: every wikilink written as the words it renders as, every
 * image's destination written as the file it names. Everything else in the document is left
 * exactly as it was written, character for character.
 */
export async function exportSource(text: string, answers: ExportAnswers): Promise<string> {
  // Callouts become ordinary semantic Divs before the shared parse, so every
  // rewrite below sees the body at its final nesting level.
  const source =
    answers.kind === 'markdown' ? text : materializeTheoremMetadata(text);
  const withCallouts = applyRewrites(source, calloutRewrites(source));
  const tree = parseMarkdown(withCallouts) as unknown as Walkable;
  const references = referenceIndex(withCallouts);
  if (answers.kind !== 'markdown') {
    const citationKeys = answers.citationKeys ?? new Set();
    const collision = references.find(
      (entry) =>
        entry.kind === 'theorem' &&
        entry.id !== null &&
        citationKeys.has(entry.id)
    );
    if (collision?.id !== undefined && collision.id !== null) {
      throw new TheoremCitationCollision(collision.id);
    }
  }
  const figures = spansOfType(tree, 'figure');
  const tables = spansOfType(tree, 'table');
  const listings = spansOfType(tree, 'listing');
  const cited = answers.citations === null ? null : spansOfType(tree, 'citation');
  const sources = [...new Set((cited ?? []).map((span) => (span.node as AstCitation).value))];
  const fetched = new Map<string, string | null>();
  const rewritten = applyRewrites(withCallouts, [
    ...autoReferenceRewrites(
      tree,
      references,
      answers.kind
    ),
    ...(await wikilinkRewrites(tree, answers.titleOf)),
    ...(await figureRewrites(figures, references, answers, fetched)),
    ...listingRewrites(listings, references, answers),
    ...(await imageRewrites(tree, answers, fetched, figures, tables)),
    ...equationRewrites(withCallouts, references, answers.kind),
    ...listRewrites(tree, references, answers.kind),
    ...tableRewrites(tree, references, answers.kind),
    ...(cited ?? []).map((span) => ({
      start: span.start,
      end: span.end,
      text: answers.citations!.render((span.node as AstCitation).value)
    }))
  ]);
  if (answers.citations === null || sources.length === 0) {
    return rewritten;
  }
  const entries = answers.citations.references(sources);
  if (entries.length === 0) {
    return rewritten;
  }
  // The list the works are listed under, as markdown: a heading under the note's own, and one bullet
  // per work. A kind that gets this is one pandoc is not rendering, so nothing else will add it.
  return `${rewritten.trimEnd()}\n\n## ${answers.citations.title}\n\n${entries
    .map((entry) => `- ${entry}`)
    .join('\n')}\n`;
}

/**
 * Every wikilink, as the words it renders as. Only the links that need an answer are asked about:
 * one that names its own text has its answer already, and a target the workspace holds no note for
 * is asked once, not once a link.
 */
async function wikilinkRewrites(tree: Walkable, titleOf: TitleLookup): Promise<Rewrite[]> {
  const spans = spansOfType(tree, 'wikilink').map((span) => ({
    ...span,
    parts: wikilinkParts((span.node as AstWikilink).value)
  }));
  const titles = new Map<string, string | null>();
  await Promise.all(
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
  return spans.map((span) => ({
    start: span.start,
    end: span.end,
    text: wikilinkText(span.parts, titles.get(span.parts.target) ?? null)
  }));
}

/** Automatic references, as ordinary links with the target's inferred text. */
function autoReferenceRewrites(
  tree: Walkable,
  references: readonly ReferenceEntry[],
  kind: string
): Rewrite[] {
  return spansOfType(tree, 'autoReference').map((span) => {
    const node = span.node as { id: string };
    const target = firstReference(references, node.id);
    if (target?.kind === 'theorem' && kind !== 'markdown') {
      return {
        start: span.start,
        end: span.end,
        text: `@${target.id![0]?.toUpperCase() ?? ''}${target.id!.slice(1)}`
      };
    }
    if (
      target?.kind === 'table' &&
      isLatexKind(kind)
    ) {
      return {
        start: span.start,
        end: span.end,
        text: `\\yiTableRef{${latexLabel(node.id)}}`
      };
    }
    if (
      target?.kind === 'equation' &&
      isLatexKind(kind)
    ) {
      return {
        start: span.start,
        end: span.end,
        text: `\\yiEquationRef{${latexLabel(node.id)}}`
      };
    }
    if (
      target?.kind === 'list' &&
      isLatexKind(kind)
    ) {
      return {
        start: span.start,
        end: span.end,
        text: `\\yiListRef{${latexLabel(node.id)}}`
      };
    }
    const text = target
      ? referenceLabel(target)
      : `#${node.id}`;
    return {
      start: span.start,
      end: span.end,
      text: `[${escapeLinkText(text)}](#${encodeFragment(node.id)})`
    };
  });
}

/** An identifier used as one LaTeX label argument. */
function latexLabel(id: string): string {
  return id.replace(/\\/g, '\\textbackslash{}').replace(/}/g, '\\}');
}
