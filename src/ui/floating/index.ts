/**
 * The app's floating-surface domain.
 *
 * Example: a message, the selection toolbar and the table picker use `BesideCard`, while a question
 * extends `QuestionCard`; all three share `FloatingSurface` through this entrypoint.
 *
 * May import: the domain's surface kinds and pure placement rule. Upholds: every floating surface
 * shares one explicit public vocabulary without exposing implementation modules to consumers.
 */

export { FloatingSurface } from './surface';
export { BesideCard, boxOf } from './beside';
export type { BesideOptions } from './beside';
export { AnchoredPanel } from './panel';
export type { PanelOptions } from './panel';
export { QuestionCard } from './question_card';
export {
  CARD_GAP,
  WINDOW_MARGIN,
  besidePlacement
} from './placement';
export type { Box, Size } from './placement';
