/**
 * Listing rewrites for processed Markdown, Pandoc Markdown and LaTeX exports.
 *
 * Example: one labeled code fence becomes HTML for processed Markdown, a native highlighted listing
 * for LaTeX, or a Pandoc Markdown listing carrying the same visible label.
 *
 * May import: parsed listing nodes, reference labels, shared pipeline contracts, the LaTeX kind
 * rule and listing serializers. Upholds: each parsed listing produces exactly one source rewrite.
 */

import type { ListingNode } from '../../markdown/syntax/listings';
import type { ReferenceEntry } from '../../markdown/document/reference_index';
import { referenceLabel } from '../../markdown/document/reference_index';
import type { Span } from './node_spans';
import type { ExportAnswers, Rewrite } from './contracts';
import { isLatexKind } from '../kind_family';
import {
  latexListing,
  listingHtml,
  pandocListing
} from './listing_markdown';

export function listingRewrites(
  listings: readonly Span[],
  references: readonly ReferenceEntry[],
  answers: ExportAnswers
): Rewrite[] {
  return listings.map((span) => {
    const listing = span.node as unknown as ListingNode;
    const entry = references.find(
      (candidate) => candidate.kind === 'listing' && candidate.from === span.start
    );
    const label = entry === undefined ? null : referenceLabel(entry);
    return {
      start: span.start,
      end: span.end,
      text:
        answers.kind === 'markdown'
          ? listingHtml(listing, label)
          : isLatexKind(answers.kind)
            ? latexListing(listing)
            : pandocListing(listing, label)
    };
  });
}
