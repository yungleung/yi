/**
 * The tutorial's eight documents, as text.
 *
 * Each is a markdown file beside this module and is bundled with the window; the file is chosen by
 * the app's language (`tutorial_rules.ts`), so the menu's own language and the document it opens
 * cannot drift apart. The documents carry no image files: a picture would need a workspace, and the
 * tutorial is the same wherever the reader is.
 *
 * May import: the rule beside it and Vite's raw markdown imports. Upholds: one tutorial per language
 * the app speaks, with no second copy in the code.
 */

import { language } from '../../services/i18n';
import { tutorialLanguage, type TutorialLanguage } from './tutorial_rules';
import de from './tutorial.de.md?raw';
import en from './tutorial.en.md?raw';
import es from './tutorial.es.md?raw';
import fr from './tutorial.fr.md?raw';
import ja from './tutorial.ja.md?raw';
import pt from './tutorial.pt.md?raw';
import zhHans from './tutorial.zh-Hans.md?raw';
import zhHant from './tutorial.zh-Hant.md?raw';

const TUTORIALS: Record<TutorialLanguage, string> = {
  en,
  de,
  es,
  fr,
  ja,
  pt,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant
};

/** The tutorial in the app's own language. */
export function tutorialText(): string {
  return TUTORIALS[tutorialLanguage(language())];
}
