/**
 * The bundled Tutorial domain.
 *
 * Example: first start and Help both call `openTutorial`; `tutorialText` chooses the matching
 * language document without a workspace.
 *
 * May import: the flow, rules and text siblings. Upholds: one tutorial command, one language rule
 * and one text map.
 */

export {
  openTutorial,
  openTutorialForFirstStart,
  registerTutorialCommand
} from './flow';
export {
  TUTORIAL_LANGUAGES,
  shouldOpenTutorial,
  tutorialLanguage
} from './rules';
export type { TutorialLanguage } from './rules';
export { tutorialText } from './text';
