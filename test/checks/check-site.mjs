/**
 * Holds the public landing page to the approved content, language and navigation contract.
 *
 * Example: removing a template card or an English/Chinese string fails `npm run check`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { cardLanguageAttribute } from '../../site/lang.js';

const html = readFileSync('site/index.html', 'utf8');
const css = readFileSync('site/styles.css', 'utf8');
const js = readFileSync('site/app.js', 'utf8');
const tabs = readFileSync('site/tabs.js', 'utf8');
const failures = [];
const check = (name, pass) => {
  if (!pass) failures.push(name);
};

for (const text of [
  'Local-first writing',
  'Daily notes',
  'Personal knowledge base',
  'Writing and publishing',
  'Templates',
  'Documentation',
  'English',
  '简体中文'
]) {
  check(`the page includes ${text}`, html.includes(text) || js.includes(text));
}

for (const token of ['data-lang="en"', 'data-lang="zh-Hans"', 'role="tablist"']) {
  check(`the page includes ${token}`, html.includes(token));
}

for (const example of ['html', 'latex', 'pdf', 'rho-class', 'legrand-orange-book', 'epub', 'docx', 'odt']) {
  check(
    `the page links ${example}`,
    html.includes(`https://github.com/yungleung/yi/tree/main/examples/templates/${example}`)
  );
}

check('the site icon exists', existsSync('site/assets/icon.png'));
check('the layout is responsive', css.includes('@media (max-width'));
check('reduced motion is respected', css.includes('prefers-reduced-motion'));
check('relative assets are used', html.includes('./assets/icon.png') && !html.includes('href="/'));
check(
  'header navigation points at real sections',
  html.includes('href="#features"') &&
    html.includes('href="#explore"') &&
    !html.includes('href="#examples"') &&
    !html.includes('href="#documentation"')
);
check(
  'header navigation activates the matching tab',
  html.includes('data-activates="tab-templates"') &&
    html.includes('data-activates="tab-docs"') &&
    tabs.includes('function activateTab') &&
    tabs.includes("candidate.setAttribute('aria-selected'") &&
    tabs.includes('panel.hidden = !selected') &&
    tabs.includes("root.querySelectorAll('[data-activates]')") &&
    js.includes('wireTabs()')
);
check(
  'Simplified Chinese reads the data-zh card attribute',
  cardLanguageAttribute('zh-Hans') === 'zh'
);
check('English reads the data-en card attribute', cardLanguageAttribute('en') === 'en');
check(
  'an unknown language falls back to the English attribute',
  cardLanguageAttribute('fr') === 'en'
);
check('the card loop uses the mapped attribute', js.includes('cardLanguageAttribute'));
check(
  'tabs expose keyboard semantics',
  html.includes('role="tablist"') &&
    html.includes('aria-selected="true"') &&
    html.includes('aria-controls="panel-templates"') &&
    tabs.includes("event.key === 'ArrowRight'") &&
    tabs.includes("event.key === 'ArrowLeft'") &&
    tabs.includes("event.key === 'Home'") &&
    tabs.includes("event.key === 'End'")
);
check(
  'language switching persists and switches the page',
  js.includes("localStorage.setItem(STORAGE_KEY, language)") &&
    js.includes('document.documentElement.lang = language') &&
    js.includes("querySelectorAll('[data-lang]')")
);
check(
  'language buttons announce the switch for the Documentation tab',
  js.includes("addEventListener('click'") &&
    js.includes('yi:languagechange') &&
    js.includes("applyLanguage(button.getAttribute('data-lang'))")
);
check(
  'template cards carry a localized open label',
  js.includes("'template.open'") &&
    js.includes('打开仓库') &&
    html.includes('data-i18n="template.open"')
);
check(
  'accessible header labels switch with the language',
  html.includes('data-i18n-label="nav.label"') &&
    html.includes('data-i18n-label="language.label"') &&
    html.includes('data-i18n-label="brand.label"') &&
    html.includes('data-i18n="nav.skip"') &&
    js.includes("'nav.label': '主导航'")
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('site: bilingual landing page and template links are present');
