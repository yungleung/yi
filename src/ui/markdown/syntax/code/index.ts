/**
 * The Markdown fenced-code syntax domain.
 *
 * Example: a consumer reads a listing with `listingFenceData`, handles Tab with `codeIndentEdit`,
 * and turns qualifying fences into nodes with `restoreListings`, all through this entrypoint.
 *
 * May import: the domain's fence, edit and listing modules. Upholds: code syntax has one explicit
 * public surface, while fenced-container navigation remains shared in `syntax/fence_edits.ts`.
 */

export { codeFenceData, listingFenceData } from './fences';
export type { CodeFenceData } from './fences';
export { codeIndentEdit } from './edits';
export { restoreListings } from './listings';
export type { ListingNode } from './listings';
