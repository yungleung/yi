/**
 * The app's words, in the reader's language.
 *
 * The catalogues are files in the repository (`locales/<language>.json`), and they are the *one*
 * home of every string the app shows: the webview imports them here and the menu reads the same
 * files from Rust (`src-tauri/src/i18n.rs`). Two readers, one set of facts — a string cannot be
 * translated on one side and left behind on the other, and `test/checks/check-locales.mjs` fails if
 * the files disagree about which keys exist.
 *
 * A key is dotted and flat (`menu.file.save`), a parameter is written `{name}` inside the string,
 * and a key with no string answers the key itself: a gap is then *visible* — in a window, a
 * screenshot or a probe — instead of quietly rendering nothing. A language the reader's system asks
 * for but this app does not have falls back to English the same way
 * (`matchLocale`): the two sides read the same rule, and the check holds them to it.
 *
 * May import: the catalogues. Upholds: one lookup rule for every string in the app, so no module
 * keeps a literal of its own and no window has to be told what language it is in twice.
 */

import de from '../../locales/de.json';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import fr from '../../locales/fr.json';
import ja from '../../locales/ja.json';
import pt from '../../locales/pt.json';
import zhHans from '../../locales/zh-Hans.json';
import zhHant from '../../locales/zh-Hant.json';

/**
 * The languages this app speaks, in the order the settings window offers them. Each is written the
 * way its own readers write it — a language's name is not translated.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'zh-Hans', name: '简体中文' },
  { code: 'zh-Hant', name: '繁體中文' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' }
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

/** The language every fallback lands on, and the one every key is written in. */
export const DEFAULT_LANGUAGE: Language = 'en';

const CATALOGUES: Record<Language, Record<string, string>> = {
  en,
  ja,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  de,
  fr,
  es,
  pt
};

let current: Language = DEFAULT_LANGUAGE;

/** The language the app is speaking. */
export function language(): Language {
  return current;
}

/** Speaks `code` from here on; an unknown code leaves the app in the language it had. */
export function setLanguage(code: string): void {
  if (isLanguage(code)) {
    current = code;
  }
}

/** Whether a string is one of the languages this app has a catalogue for. */
export function isLanguage(code: string): code is Language {
  return LANGUAGES.some((known) => known.code === code);
}

/**
 * The language a system locale asks for: `zh-Hant-TW` and `zh-TW` are Traditional Chinese, `zh`
 * and `zh-CN` are Simplified, and anything else this app does not speak is English. Chinese is
 * the one place a locale has to be read rather than matched by its first two letters — the script
 * is the language.
 */
export function matchLocale(locale: string): Language {
  const tag = locale.replace('_', '-').toLowerCase();
  if (tag.startsWith('zh')) {
    return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(tag) ? 'zh-Hant' : 'zh-Hans';
  }
  const two = tag.slice(0, 2);
  return LANGUAGES.some((known) => known.code === two) ? (two as Language) : DEFAULT_LANGUAGE;
}

/**
 * The string for `key`, with its parameters put in. A key the catalogue does not have answers the
 * key itself; a language that has no string for a key answers English, which is the language every
 * key is written in.
 */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const text = CATALOGUES[current][key] ?? CATALOGUES[DEFAULT_LANGUAGE][key] ?? key;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );
}
