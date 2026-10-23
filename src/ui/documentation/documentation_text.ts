/**
 * The bundled Documentation guide.
 *
 * The guide has no workspace path and no fetched resources: it is one markdown document imported
 * into the window, so it reads the same wherever the app is opened.
 *
 * May import: the i18n language vocabulary and Vite’s raw markdown loader. Upholds: Documentation
 * opens in the app’s current language, and an unknown or missing translation falls back to English.
 */

import { DEFAULT_LANGUAGE, type Language } from '../../services/i18n';
import de from './documentation.de.md?raw';
import en from './documentation.en.md?raw';
import es from './documentation.es.md?raw';
import fr from './documentation.fr.md?raw';
import ja from './documentation.ja.md?raw';
import pt from './documentation.pt.md?raw';
import zhHans from './documentation.zh-Hans.md?raw';
import zhHant from './documentation.zh-Hant.md?raw';

const DOCUMENTATION: Record<Language, string> = {
  en,
  ja,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  de,
  fr,
  es,
  pt
};

export function documentationText(language: Language = DEFAULT_LANGUAGE): string {
  return DOCUMENTATION[language] ?? DOCUMENTATION[DEFAULT_LANGUAGE];
}
