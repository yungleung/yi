/**
 * Checks the app's words: that every catalogue has the same keys as English, that every key has a
 * string in it, that every key the sources *use* exists, and that the webview's reading of a
 * system locale matches what Rust's reading is held to.
 *
 * The catalogues are one set of facts read by two programs — the webview (`src/services/i18n.ts`)
 * and the menu (`src-tauri/src/i18n.rs`) — so this check is what keeps the two readers honest: a
 * key one side knows that the other does not is a string translated in one place and English in
 * the other, which is the state this feature exists to prevent.
 *
 * It reads files rather than bundling them (the Rust side is not a module Node can import), the
 * way `headers.mjs` reads sources: this is about what the files say.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The languages this app ships, and the ones the settings window offers. */
const LANGUAGES = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'];
const DEFAULT_LANGUAGE = 'en';

const failures = [];
const catalogueOf = (language) => JSON.parse(readFileSync(join('locales', `${language}.json`), 'utf8'));

// A key written **twice** in one file is a key whose second line silently wins: `JSON.parse` keeps the
// last and says nothing, which is how the backend's own `export.noPandoc` (a second string for a fact
// the card already had a better one for) replaced the card's sentence without a single test noticing.
// So the raw text is read as well as parsed, and a repeat is a failure of its own.
for (const language of LANGUAGES) {
  const text = readFileSync(join('locales', `${language}.json`), 'utf8');
  const seen = new Set();
  for (const match of text.matchAll(/^\s*"([^"]+)":/gm)) {
    if (seen.has(match[1])) {
      failures.push(`${language}.json writes ${match[1]} twice`);
    }
    seen.add(match[1]);
  }
}

const english = catalogueOf(DEFAULT_LANGUAGE);
const englishKeys = Object.keys(english).sort();

// --- one key set, and no blank strings --------------------------------------------------------

for (const language of LANGUAGES) {
  const catalogue = catalogueOf(language);
  const keys = Object.keys(catalogue);
  const missing = englishKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !englishKeys.includes(key));
  const blank = englishKeys.filter((key) => (catalogue[key] ?? '').trim() === '');
  if (missing.length > 0) {
    failures.push(`${language} is missing ${missing.length}: ${missing.slice(0, 6).join(', ')}`);
  }
  if (extra.length > 0) {
    failures.push(`${language} has keys English does not: ${extra.slice(0, 6).join(', ')}`);
  }
  if (blank.length > 0) {
    failures.push(`${language} has nothing to say for: ${blank.slice(0, 6).join(', ')}`);
  }
}

// --- every key the sources use, and every key they do not --------------------------------------

const sources = [];
(function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (path.endsWith('.ts') || path.endsWith('.rs')) {
      sources.push(path);
    }
  }
})('src');
// And the backend's own sentences: a Rust module that hands a reader a message uses a key like any view
// does (`i18n::now`), so the walk reaches `src-tauri/src` as well — `target/` is beside it, not under it.
(function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (path.endsWith('.ts') || path.endsWith('.rs')) {
      sources.push(path);
    }
  }
})('src-tauri/src');

const used = new Map();
for (const file of sources) {
  // `i18n.rs` *holds* the catalogues — its own strings are the languages themselves, not uses of a key.
  if (file.endsWith('i18n.rs')) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  // `t('area.key')`, `t("area.key")` and Rust's `t(language, "area.key", &[…])` are one call — and
  // Rust's `now("area.key", &[…])` is the same one where no config is at hand (`i18n::now`).
  // `path_error("area.key", path, reason)` uses a key through the shared path/reason spelling.
  // A `nameKey` field is the same use one indirection away: a caller passes it back to `t`.
  for (const match of source.matchAll(
    /\b(?:t|now|path_error)\(\s*(?:"|')([a-z][\w.]*)(?:"|')|\bnameKey\s*:\s*(?:"|')([a-z][\w.]*)(?:"|')/g
  )) {
    used.set(match[1] ?? match[2], file);
  }
}
for (const [key, file] of used) {
  if (!englishKeys.includes(key)) {
    failures.push(`${file} uses ${key}, which no catalogue has`);
  }
}

// The menu reads its keys through its own file, so those count as used too.
const menu = readFileSync('src-tauri/src/menu.rs', 'utf8');
const menuKeys = [...menu.matchAll(/t\(language,\s*"([a-z][\w.]*)"/g)].map((match) => match[1]);
const unused = englishKeys.filter((key) => !used.has(key) && !menuKeys.includes(key));
if (unused.length > 0) {
  failures.push(`no source uses: ${unused.join(', ')}`);
}

// --- the language a system locale asks for ------------------------------------------------------

/**
 * The rule the webview writes (`src/services/i18n.ts: matchLocale`), spelled here the same way so
 * the expectations can be checked against it. Rust's reader has the same cases as its own test.
 */
function matchLocale(locale) {
  const tag = locale.replace('_', '-').toLowerCase();
  if (tag.startsWith('zh')) {
    return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(tag) ? 'zh-Hant' : 'zh-Hans';
  }
  const two = tag.slice(0, 2);
  return LANGUAGES.includes(two) ? two : DEFAULT_LANGUAGE;
}

const LOCALES = [
  ['de-DE', 'de'],
  ['fr_FR', 'fr'],
  ['pt-BR', 'pt'],
  ['es-419', 'es'],
  ['ja-JP', 'ja'],
  ['zh-Hans-CN', 'zh-Hans'],
  ['zh-CN', 'zh-Hans'],
  ['zh-TW', 'zh-Hant'],
  ['zh-Hant-HK', 'zh-Hant'],
  ['ko-KR', 'en'],
  ['en-GB', 'en']
];
for (const [locale, expected] of LOCALES) {
  const matched = matchLocale(locale);
  if (matched !== expected) {
    failures.push(`a system locale of ${locale} reads as ${matched}, not ${expected}`);
  }
}

// The webview is what actually reads a reader's locale, so its own file has to carry this rule.
const webview = readFileSync('src/services/i18n.ts', 'utf8');
if (!/hant\|tw\|hk\|mo/.test(webview)) {
  failures.push('the webview no longer reads Traditional Chinese out of a locale');
}
if (!readFileSync('src-tauri/src/i18n.rs', 'utf8').includes('"hant" | "tw" | "hk" | "mo"')) {
  failures.push('the menu no longer reads Traditional Chinese out of a locale');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`locales: ${LANGUAGES.length} languages, ${englishKeys.length} keys each, all used`);
