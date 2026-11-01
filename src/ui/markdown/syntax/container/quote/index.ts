/**
 * The blockquote syntax subdomain.
 *
 * Example: callers locate a carrier with `quoteLineAt`, apply an Enter edit with `enterInQuote`,
 * and map it into a child parse with `projectQuoteSource`.
 *
 * May import: the subdomain's line, edit and projection modules. Upholds: one explicit quote
 * entrypoint, with source parsing separate from mutation and projection.
 */

export { quoteCarrier, quoteLineAt, quotePrefixAt } from './lines';
export type { QuoteLine } from './lines';
export {
  deleteBlankQuoteLine,
  emptyQuoteTyping,
  enterInQuote,
  fencedDivNewline,
  prefixInsertedBreaks,
  prefixInsertedLines
} from './edits';
export type { QuoteChildContext, QuoteEdit } from './edits';
export { projectQuoteSource, quoteNeedsSourceAt } from './projection';
export type { QuoteProjection } from './projection';
