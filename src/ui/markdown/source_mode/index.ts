/**
 * Source mode: exact Markdown substituted for rendering while the caret is inside it.
 *
 * Example: `isSourceBlock` selects a fenced formula block, `isShownSource` identifies its inline
 * nodes, and `setShownRange` moves the one offset range that drives both.
 *
 * May import: the domain's state, block and node rules. Upholds: source mode has one public
 * entrypoint while mutable state stays separate from block and node questions.
 */

export {
  editStaysInsideShownSource,
  moveShownSource,
  moveShownSourceForFormatting,
  renderingBlock,
  setShownRange,
  shownSourceHeld,
  withHeldShownSource,
  withRenderFrame
} from './state';
export {
  blockSourceAt,
  enterSourceOf,
  isSourceBlock,
  setSourceEntryHandler,
  shownSourceWithinBlock,
  sourceEntryOffset
} from './block';
export {
  isShownSource,
  isShownSourceRange,
  shownSourceText
} from './node';
