/**
 * The Pandoc attribute and identifier syntax domain.
 *
 * Example: `attributeBlockAtEnd` reads `{#id .class key=value}`, while `pandocHeadingId` derives the
 * ID Pandoc would assign to a heading without one.
 *
 * May import: the domain's attribute and identifier modules. Upholds: Pandoc metadata grammar and
 * generated identifiers share one explicit facade.
 */

export {
  attributeBlockAtEnd,
  trimSpacesBack
} from './attributes';
export type {
  PandocAttributeBlock,
  PandocAttributes
} from './attributes';
export { pandocHeadingId } from './identifiers';
