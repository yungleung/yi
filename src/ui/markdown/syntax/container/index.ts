/**
 * The Markdown block-container syntax domain.
 *
 * Example: `readFencedDiv` locates a Pandoc Div, `fenceTypedWrite` protects a delimiter line
 * while typing, and `enterInQuote` creates a prefixed quote break through this same facade.
 *
 * May import: the domain's Div, fence-body and quote modules. Upholds: line-shaped container
 * boundaries and their pure text edits have one public entrypoint and source-derived offsets.
 */

export { fencedDivAtOffset, readFencedDiv } from './divs';
export type { FencedDivSource } from './divs';
export { fenceLanguageEdit, fenceNewlineWrite, fenceTypedWrite } from './fence_edits';
export type { FenceWrite } from './fence_edits';
export {
  deleteBlankQuoteLine,
  emptyQuoteTyping,
  enterInQuote,
  fencedDivNewline,
  prefixInsertedBreaks,
  prefixInsertedLines,
  projectQuoteSource,
  quoteCarrier,
  quoteLineAt,
  quoteNeedsSourceAt,
  quotePrefixAt
} from './quote';
export type {
  QuoteChildContext,
  QuoteEdit,
  QuoteLine,
  QuoteProjection
} from './quote';
