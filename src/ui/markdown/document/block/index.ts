/**
 * The document block model and scanner domain.
 *
 * Example: `splitBlocks` is read through this facade, while `BlockIndex` finds blocks by line and
 * `BlockParseCache` keys parsed children by content.
 *
 * May import: the domain's model, kind, lookup, scanner and cache modules. Upholds: the block
 * vocabulary, source scanner and derived indexes have one explicit public surface.
 */

export {
  blockContentKey,
  blockParseInput,
  splitBlocks,
  splitBlocksFrom
} from './model';
export type { BlockNode, MarkdownBlock } from './model';
export {
  hasBodyView,
  hasSourceMode,
  isFenced,
  isQuoteLike,
  isRawRendered
} from './kinds';
export type { BlockKind } from './kinds';
export { BlockIndex } from './lookup';
export type { BlockEntry, IndexedEntry } from './lookup';
export { BlockParseCache } from './parse_cache';
export { scanContainerBlock } from './scan_rules';
export type { RuleScan } from './scan_rules';
export { scanBlocks, splitLines } from './scanner';
export type { BlockSeed, SourceLine } from './scanner';
