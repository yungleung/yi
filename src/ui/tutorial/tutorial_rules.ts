/**
 * The tutorial's two facts, over plain values: which language it is written in, and whether a start
 * should open it.
 *
 * The catalogue language is one of the app's own (`services/i18n.ts`), so a language the app does
 * not speak — or a config written by hand — falls back to English exactly as the rest of the app
 * does. The first-start answer is `first start` **and** nothing restored: a restored note is the
 * reader's, and a later start is not the one the tutorial is for.
 *
 * May import: nothing. Upholds: one answer to each question, held by `check-tutorial.mjs`, so the
 * startup path and the tutorial's own text cannot disagree about either.
 */

/** The languages the tutorial is written in, in the catalogue's own spelling. */
export const TUTORIAL_LANGUAGES = [
  'en',
  'de',
  'es',
  'fr',
  'ja',
  'pt',
  'zh-Hans',
  'zh-Hant'
] as const;

export type TutorialLanguage = (typeof TUTORIAL_LANGUAGES)[number];

/** The tutorial's language for the app's language, with English as the fallback. */
export function tutorialLanguage(language: string): TutorialLanguage {
  return (TUTORIAL_LANGUAGES as readonly string[]).includes(language)
    ? (language as TutorialLanguage)
    : 'en';
}

/** Whether a start with these facts should show the tutorial. */
export function shouldOpenTutorial(firstStart: boolean, hasDocument: boolean): boolean {
  return firstStart && !hasDocument;
}
