/**
 * The Markdown formatting domain.
 *
 * Example: `formatRange` computes a style edit, `patchFormatDom` applies it without rebuilding,
 * and `taggedTexts` exposes the labelled DOM leaves used by that fast path.
 *
 * May import: the domain's rules and DOM modules. Upholds: formatting vocabulary, source edits and
 * DOM tagging have one public boundary.
 */

export {
  FORMATTING_STYLES,
  formatRange,
  formattingMarker
} from './rules';
export type {
  FormattingEdit,
  FormattingStyle,
  FormatUnit
} from './rules';
export { patchFormatDom } from './dom';
export {
  createFormatElement,
  formatTag,
  isWidget,
  isolatePiece,
  makeTaggedSpan,
  markerLength,
  shiftTags,
  taggedTexts
} from './dom_tags';
export type { TaggedText } from './dom_tags';
