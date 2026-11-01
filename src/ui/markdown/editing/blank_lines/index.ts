/**
 * Line-level editing rules for blank lines.
 *
 * Example: Enter uses `splitParagraph` or `continueListItem` according to context, while pasting
 * blocks uses `pasteInsertion`; all callers keep importing `editing/blank_lines`.
 *
 * May import: the domain's paragraph, list and deletion modules. Upholds: blank-line behavior has
 * one public surface while list ownership, paragraph layout and deletion remain separate.
 */

export {
  blockPadding,
  emptyLineInsertion,
  materializeInsertion,
  paragraphSplit,
  paragraphStart,
  pasteInsertion,
  splitParagraph,
  startEmptyParagraph,
  startEmptyParagraphAbove
} from './paragraph';
export { continueListItem, exitBlankItem } from './list';
export { characterRemoval, deleteEmptyParagraph } from './deletion';
