/**
 * Holds the public landing page to the approved content, language and navigation contract.
 *
 * Example: removing a template card or an English/Chinese string fails `npm run check`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { cardLanguageAttribute } from '../../site/lang.js';
import { activateTab, tabTargetIndex } from '../../site/tabs.js';
import { selectActiveHeading } from '../../site/docs.js';

const html = readFileSync('site/index.html', 'utf8');
const css = readFileSync('site/styles.css', 'utf8');
const js = readFileSync('site/app.js', 'utf8');
const tabs = readFileSync('site/tabs.js', 'utf8');
const docsPath = 'site/docs.js';
const docs = existsSync(docsPath) ? readFileSync(docsPath, 'utf8') : '';
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
const webpSize = (path) => {
  const bytes = readFileSync(path);
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === 'VP8X') {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3)
    };
  }
  throw new Error(`${path} is not a supported WebP image`);
};
for (const screenshot of ['hero.webp', 'cross-references.webp', 'template-workbench.webp']) {
  const path = `site/assets/screenshots/${screenshot}`;
  check(`the site ships ${screenshot}`, existsSync(path));
  if (!existsSync(path)) continue;
  const size = webpSize(path);
  const image = html
    .match(/<img\b[^>]*>/g)
    ?.find((element) => element.includes(`src="./assets/screenshots/${screenshot}"`));
  check(
    `${screenshot} keeps its actual dimensions`,
    size.width === 1800 &&
      size.height === 1200 &&
      image?.includes('width="1800"') === true &&
      image?.includes('height="1200"') === true
  );
}
check(
  'screenshots have descriptive alternatives',
  html.includes('data-alt-en=') && html.includes('data-alt-zh=')
);
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
    tabs.includes('tabTargetIndex(index, tabs.length, event.key)')
);
check(
  'Arrow and Home/End move through tabs with wrap-around',
  tabTargetIndex(0, 3, 'ArrowLeft') === 2 &&
    tabTargetIndex(2, 3, 'ArrowRight') === 0 &&
    tabTargetIndex(1, 3, 'ArrowLeft') === 0 &&
    tabTargetIndex(1, 3, 'ArrowRight') === 2 &&
    tabTargetIndex(1, 3, 'Home') === 0 &&
    tabTargetIndex(1, 3, 'End') === 2 &&
    tabTargetIndex(0, 0, 'End') === -1
);

let focused = false;
let attributeChanges = 0;
let panelHidden = false;
const activePanel = {
  set hidden(value) {
    panelHidden = value;
  }
};
const activeTab = {
  getAttribute(name) {
    if (name === 'role') return 'tab';
    if (name === 'aria-controls') return 'active-panel';
    return null;
  },
  setAttribute() {
    attributeChanges += 1;
  },
  focus() {}
};
const staleTab = {
  getAttribute(name) {
    if (name === 'role') return 'tab';
    if (name === 'aria-controls') return 'missing-panel';
    return null;
  },
  closest() {
    return { querySelectorAll: () => [activeTab, staleTab] };
  },
  setAttribute() {
    attributeChanges += 1;
  },
  focus() {
    focused = true;
  }
};
const previousDocument = globalThis.document;
globalThis.document = {
  getElementById(id) {
    return id === 'active-panel' ? activePanel : null;
  }
};
check('an invalid tab target leaves the current UI unchanged', activateTab(staleTab, true) === false);
check('an invalid tab target does not move focus', focused === false);
check('an invalid tab target does not hide a panel', panelHidden === false);
check('an invalid tab target does not rewrite tab state', attributeChanges === 0);
globalThis.document = previousDocument;
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
  'screenshots copy the selected language into their alt text',
  js.includes('[data-alt-en][data-alt-zh]') && js.includes("setAttribute('alt'")
);
check(
  'accessible header labels switch with the language',
  html.includes('data-i18n-label="nav.label"') &&
    html.includes('data-i18n-label="language.label"') &&
    html.includes('data-i18n-label="brand.label"') &&
    html.includes('data-i18n="nav.skip"') &&
    js.includes("'nav.label': '主导航'")
);
check(
  'the Documentation tab loads the selected language',
  js.includes('documentation/${language}.html') && js.includes('loadDocumentation(language)')
);
check(
  'the Documentation tab tracks the active heading',
  docs.includes('IntersectionObserver') && docs.includes('data-doc-toc')
);
check(
  'the Documentation tab has a localized failure state',
  js.includes('docs.error') && js.includes('doc-error')
);
check(
  'tab activation announces the selected tab',
  tabs.includes('yi:tabchange') && js.includes("addEventListener('yi:tabchange'")
);
check(
  'the Documentation tab reloads on a language change',
  js.includes("addEventListener('yi:languagechange'") && js.includes('loadDocumentation(')
);
check(
  'TOC clicks scroll past the sticky header and record the fragment',
  docs.includes('scrollIntoView') && docs.includes('history.replaceState')
);
check(
  'the active TOC link is marked for assistive tech',
  docs.includes("setAttribute('aria-current', 'location')")
);
const aboveBand = { id: 'a', top: -40 };
const enteringBand = { id: 'b', top: 80 };
const belowBand = { id: 'c', top: 400 };
check(
  'the last intersecting heading wins the TOC',
  selectActiveHeading([aboveBand, enteringBand, belowBand], new Set(['a', 'b']), 300).id === 'b'
);
check(
  'the nearest preceding heading stays active when none intersect',
  selectActiveHeading([aboveBand, enteringBand, belowBand], new Set(), 300).id === 'b'
);
check(
  'no heading is active before the first heading',
  selectActiveHeading([{ id: 'a', top: 400 }], new Set(), 300) === null
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('site: bilingual landing page and template links are present');
