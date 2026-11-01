/**
 * The input-method composition domain.
 *
 * Example: `installCompositionInput` wires the native textarea, caret positioning and marked-text
 * view; keyboard helpers keep focus on the same seam through composition events.
 *
 * May import: the domain's input, keyboard, position and view modules. Upholds: IME lifecycle,
 * placement and focus have one public surface and one coordinated implementation.
 */

export { installCompositionInput } from './input';
export type { CompositionInput } from './input';
export {
  isCompositionControl,
  keepCompositionKeyboard,
  regainCompositionKeyboard,
  resetCompositionKeyboard,
  showingSelection
} from './keyboard';
export { installCompositionPosition } from './position';
export type {
  CompositionPosition,
  CompositionPositionOptions
} from './position';
export { createCompositionView } from './view';
export type { CompositionView, LayoutChanged } from './view';
