/**
 * Maps a public language code to the attribute suffix that stores the
 * template-card copy, and is imported by both `app.js` and the site check.
 *
 * Example: `cardLanguageAttribute('zh-Hans')` is `'zh'`, because the cards key
 * their Simplified Chinese copy under `data-zh` rather than `data-zh-Hans`.
 */
export function cardLanguageAttribute(language) {
  return language === 'zh-Hans' ? 'zh' : 'en';
}
