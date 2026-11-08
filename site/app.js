/**
 * Public site behaviour.
 *
 * Owns bilingual copy, local persistence and the Documentation destination.
 * `applyLanguage('zh-Hans')` re-labels the page and points its documentation
 * links at the Simplified Chinese standalone page without a reload; unknown
 * languages fall back to English.
 */
import { cardLanguageAttribute } from './lang.js';

const COPY = {
  en: {
    title: 'Yi — local-first Markdown writing',
    description: 'Yi is a local-first WYSIWYG Markdown editor for notes, research and long-form writing. Keep ordinary files, link ideas, manage citations, write mathematics, and export through reusable Pandoc templates.',
    'nav.features': 'Features',
    'nav.templates': 'Templates',
    'nav.docs': 'Documentation',
    'nav.skip': 'Skip to content',
    'nav.label': 'Primary',
    'language.label': 'Language',
    'brand.label': 'Yi home',
    'hero.eyebrow': 'Local-first writing',
    'hero.title': 'Your notes, at home in Markdown.',
    'hero.body': 'A local-first WYSIWYG Markdown editor for notes, research and long-form writing—ordinary files, linked ideas, citations and Pandoc publishing.',
    'hero.audience': 'For researchers, academics and long-form writers.',
    'hero.templates': 'Explore templates',
    'hero.github': 'View on GitHub',
    'advantages.title': 'Why Yi',
    'advantages.one': 'WYSIWYG editing without giving up raw Markdown',
    'advantages.two': 'Researcher-oriented citations, cross-references, equations and theorem blocks',
    'advantages.three': 'Reusable Word, LaTeX, EPUB, HTML and PDF template packages',
    'features.eyebrow': 'A writing home',
    'features.title': 'One place for notes, knowledge and finished work.',
    'daily.title': 'Daily notes',
    'daily.body': 'Open a folder, capture a thought and stay in the writing. Files remain readable outside Yi.',
    'daily.one': 'Quick capture with ordinary Markdown files.',
    'daily.two': 'Workspace tree, search, session stack and autosave.',
    'daily.three': 'Light, dark and automatic themes with long-note performance.',
    'knowledge.title': 'Personal knowledge base',
    'knowledge.body': 'Connect notes without trapping them in a database. Yi resolves the links while the source stays portable.',
    'knowledge.one': 'Wikilinks and automatic cross-references.',
    'knowledge.two': 'Structured frontmatter and stable document IDs.',
    'knowledge.three': 'CSL citations and local bibliography files.',
    'writing.title': 'Writing and publishing',
    'writing.body': 'Write mathematical and academic prose in the editor, then hand the same note to a trusted template.',
    'writing.one': 'KaTeX mathematics, callouts, theorem blocks and footnotes.',
    'writing.two': 'Export to Word, ODT, LaTeX, HTML, EPUB, PDF, Reveal.js and Beamer.',
    'writing.three': 'Reusable Pandoc template packages and native citation workflows.',
    'tabs.templates': 'Templates',
    'tabs.docs': 'Documentation',
    'explore.label': 'Explore Yi',
    'templates.all': 'Browse every template package',
    'template.open': 'Open repository',
    'footer.author': 'Made by yungleung',
    'footer.label': 'Community and contribution links',
    'footer.contribute': 'Contribute',
    'footer.goodFirst': 'Good first issues',
    'footer.helpWanted': 'Help wanted',
    'footer.discussions': 'Discussions'
  },
  'zh-Hans': {
    title: 'Yi — 本地优先的 Markdown 写作环境',
    description: 'Yi 是一款本地优先的所见即所得 Markdown 编辑器，面向笔记、研究资料与长文写作。文件始终是普通 Markdown，同时内置链接、交叉引用、文献引用、数学公式与 Pandoc 模板导出。',
    'nav.features': '功能',
    'nav.templates': '模板示例',
    'nav.docs': '文档',
    'nav.skip': '跳到主要内容',
    'nav.label': '主导航',
    'language.label': '语言',
    'brand.label': 'Yi 首页',
    'hero.eyebrow': '本地优先写作',
    'hero.title': '让笔记回到 Markdown。',
    'hero.body': '一款本地优先的所见即所得 Markdown 编辑器，用普通文件连接笔记、研究与长文写作，原生支持引用与 Pandoc 发布。',
    'hero.audience': '面向研究人员、学者与长文写作者。',
    'hero.templates': '浏览模板',
    'hero.github': '在 GitHub 查看',
    'advantages.title': '为什么选择 Yi',
    'advantages.one': '保留原生 Markdown 的所见即所得编辑',
    'advantages.two': '面向研究写作的文献引用、交叉引用、公式与定理块',
    'advantages.three': '可复用的 Word、LaTeX、EPUB、HTML 与 PDF 模板包',
    'features.eyebrow': '写作的家',
    'features.title': '笔记、知识与完成的作品，都在同一个地方。',
    'daily.title': '日常笔记',
    'daily.body': '打开文件夹，记录想法，继续写作；文件在 Yi 之外也能正常阅读。',
    'daily.one': '用普通 Markdown 文件快速记录。',
    'daily.two': '工作区目录、搜索、会话栈与自动保存。',
    'daily.three': '浅色、深色与自动主题，并保持长文性能。',
    'knowledge.title': '个人知识库',
    'knowledge.body': '连接笔记，而不把它们锁进数据库；Yi 负责解析链接，源文件依然可移植。',
    'knowledge.one': 'Wiki 链接与自动交叉引用。',
    'knowledge.two': '结构化 frontmatter 与稳定文档 ID。',
    'knowledge.three': 'CSL 引用与本地文献库文件。',
    'writing.title': '写作与发布',
    'writing.body': '在编辑器中撰写数学与学术内容，再把同一篇笔记交给可信模板。',
    'writing.one': 'KaTeX 数学、提示框、定理块与脚注。',
    'writing.two': '导出至 Word、ODT、LaTeX、HTML、EPUB、PDF、Reveal.js 与 Beamer。',
    'writing.three': '可复用的 Pandoc 模板包与原生引用流程。',
    'tabs.templates': '模板示例',
    'tabs.docs': '文档',
    'explore.label': '探索 Yi',
    'templates.all': '浏览全部模板包',
    'template.open': '打开仓库',
    'footer.author': '由 yungleung 制作',
    'footer.label': '社区与贡献链接',
    'footer.contribute': '参与贡献',
    'footer.goodFirst': '适合初次贡献的问题',
    'footer.helpWanted': '需要帮助的问题',
    'footer.discussions': '讨论区'
  }
};

const STORAGE_KEY = 'yi-site-language';

/**
 * Reads the persisted language, defaulting to English when storage is blocked.
 */
function storedLanguage() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'zh-Hans' ? value : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Applies one language to the document title, metadata, `[data-i18n]` copy and
 * template card `data-en`/`data-zh` strings, then records the choice.
 *
 * Example: `applyLanguage('zh-Hans')` turns the hero title into `让笔记回到 Markdown。`
 * and sets `aria-pressed` on the 简体中文 button without reloading the page.
 */
function applyLanguage(language) {
  if (!Object.hasOwn(COPY, language)) language = 'en';

  document.documentElement.lang = language;
  document.title = COPY[language].title;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', COPY[language].description);

  for (const element of document.querySelectorAll('[data-i18n]')) {
    const key = element.getAttribute('data-i18n');
    if (Object.hasOwn(COPY[language], key)) element.textContent = COPY[language][key];
  }

  for (const element of document.querySelectorAll('[data-i18n-label]')) {
    const key = element.getAttribute('data-i18n-label');
    if (Object.hasOwn(COPY[language], key)) element.setAttribute('aria-label', COPY[language][key]);
  }

  const cardLanguage = cardLanguageAttribute(language);
  for (const element of document.querySelectorAll('[data-en][data-zh]')) {
    element.textContent = element.getAttribute(`data-${cardLanguage}`);
  }

  for (const image of document.querySelectorAll('[data-alt-en][data-alt-zh]')) {
    image.setAttribute('alt', image.getAttribute(`data-alt-${cardLanguage}`));
  }

  for (const link of document.querySelectorAll('[data-doc-link]')) {
    link.setAttribute('href', `./documentation/${language}-page.html`);
  }

  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-pressed', String(button.getAttribute('data-lang') === language));
  }

  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage may be unavailable; the visible page still reflects the language.
  }

  return language;
}

/**
 * Binds the language buttons to `applyLanguage`.
 *
 * Example: clicking 简体中文 re-labels the page, persists `zh-Hans` and changes
 * every Documentation link to `./documentation/zh-Hans-page.html`.
 */
function wireLanguage() {
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.addEventListener('click', () => {
      applyLanguage(button.getAttribute('data-lang'));
    });
  }
}

applyLanguage(storedLanguage());
wireLanguage();
