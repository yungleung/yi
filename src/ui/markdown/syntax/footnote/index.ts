/**
 * The Markdown footnote syntax domain.
 *
 * Example: consumers read labels with `footnoteLabels`, borrow definitions with
 * `withFootnoteDefinitions`, and create a complete marker/definition pair with `footnoteInsertEdit`
 * through this one entrypoint.
 *
 * May import: the domain's model, label-tracking, parse-context and edit modules. Upholds:
 * footnote syntax has one explicit public surface and one implementation per rule.
 */

export {
  containsReference,
  footnoteLabels,
  footnoteOffsets,
  markerShape,
  nextFootnoteNumber,
  sameLabels
} from './model';
export type { FootnoteOffsets } from './model';
export { labelsAfterEdit } from './labels';
export type { TextReplacement } from './labels';
export { isOwnNode, withFootnoteDefinitions } from './parse_context';
export { footnoteInsertEdit } from './edits';
