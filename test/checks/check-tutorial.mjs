/**
 * The tutorial's two rules, and the eight documents behind them.
 *
 * The tutorial is a reference the app opens, not a note the reader writes: it is read-only, and it
 * exists in every language the app speaks. The first-start rule is separate from the session so the
 * question "does a first start with nothing restored open it?" is answered in Node rather than
 * inferred from `main.ts`; the app probe holds the menu and the read-only editor.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-tutorial-'));
const bundle = await rolldown({
  input: 'src/ui/tutorial/tutorial_rules.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'tutorial_rules.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { shouldOpenTutorial, tutorialLanguage } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check('a first start with nothing restored opens the tutorial', shouldOpenTutorial(true, false), true);
check('a first start that restored a document does not', shouldOpenTutorial(true, true), false);
check('a later start does not', shouldOpenTutorial(false, false), false);

check('the app’s own code is the tutorial’s code', tutorialLanguage('fr'), 'fr');
check('the two Chinese catalogues keep their scripts apart', {
  simplified: tutorialLanguage('zh-Hans'),
  traditional: tutorialLanguage('zh-Hant')
}, { simplified: 'zh-Hans', traditional: 'zh-Hant' });
check('a language the app does not speak falls back to English', tutorialLanguage('nl'), 'en');

const titles = {
  en: 'Welcome to Yi',
  de: 'Willkommen bei Yi',
  es: 'Bienvenido a Yi',
  fr: 'Bienvenue dans Yi',
  ja: 'Yi へようこそ',
  pt: 'Bem-vindo ao Yi',
  'zh-Hans': '欢迎使用 Yi',
  'zh-Hant': '歡迎使用 Yi'
};
for (const [language, title] of Object.entries(titles)) {
  const source = readFileSync(`src/ui/tutorial/tutorial.${language}.md`, 'utf8');
  check(
    `${language}: the frontmatter carries the tutorial id and its own title`,
    source.startsWith('---\n') && source.includes('id: yi-tutorial') && source.includes(`title: ${title}`),
    true
  );
  check(
    `${language}: the document shows the features it is teaching`,
    {
      sections: (source.match(/^## /gm) ?? []).length >= 8,
      table: /^\|.*\|$/m.test(source),
      code: source.includes('```'),
      math: source.includes('$$'),
      footnote: source.includes('[^'),
      task: source.includes('- [ ]'),
      wikilink: source.includes('[[')
    },
    {
      sections: true,
      table: true,
      code: true,
      math: true,
      footnote: true,
      task: true,
      wikilink: true
    }
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('tutorial: all checks passed');
