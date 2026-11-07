# Yi GitHub Pages Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a bilingual, responsive project site at `https://yungleung.github.io/yi/` with Yi screenshots, feature sections, template examples and documentation with a sidebar TOC.

**Architecture:** A standalone static site lives in `site/`. A Node build converts the authoritative bundled Markdown documentation into HTML fragments and copies the site into `_site/`. A GitHub Actions workflow deploys `_site/` through the official Pages artifact actions. The root Tauri/Vite entrypoints remain unchanged.

**Tech Stack:** HTML, CSS, browser JavaScript, Node.js, unified/remark/rehype, KaTeX, GitHub Actions Pages.

**Spec:** `docs/superpowers/specs/2026-11-07-github-pages-site-design.md`

## Global Constraints

- The completed Pages URL is `https://yungleung.github.io/yi/`.
- Public-site languages are English and Simplified Chinese only.
- All site asset URLs are relative and work under the `/yi/` project path.
- The Documentation tab has a sidebar TOC generated from the current Documentation headings.
- The documentation source remains `src/ui/documentation/en.md` and `src/ui/documentation/zh-Hans.md`.
- The root `index.html`, `settings.html`, `vite.config.ts` and Tauri entrypoints are not modified.
- The public site uses no analytics, trackers or runtime CDN dependencies.
- Interactive tabs use WAI-ARIA tab semantics and keyboard navigation.
- Screenshots are captured from the running Yi application, not mocked.
- Build and check failures are non-zero errors.

---

### Task 1: Documentation Build Pipeline

**Files:**
- Create: `scripts/build-site.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `site/index.html`
- Create: `site/styles.css`
- Create: `site/app.js`
- Test: `test/checks/check-site-docs.mjs`

**Interfaces:**
- Consumes: Markdown from `src/ui/documentation/{en,zh-Hans}.md`.
- Produces: `_site/documentation/en.html`, `_site/documentation/zh-Hans.html`.
- Produces: `_site/` as the complete Pages artifact.
- Produces: npm scripts `site:build` and `site:preview`.

- [ ] **Step 1: Write the failing documentation build check**

Create `test/checks/check-site-docs.mjs`:

```js
/**
 * Builds the public site and proves both documentation fragments come from the bundled guides.
 *
 * Example: changing the first heading in `src/ui/documentation/en.md` changes the generated
 * English fragment and its sidebar target.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const check = (name, pass) => {
  if (!pass) failures.push(name);
};

const build = spawnSync(process.execPath, ['scripts/build-site.mjs'], { encoding: 'utf8' });
check('the site build succeeds', build.status === 0);

for (const [language, required] of [
  ['en', ['Package YAML', 'Template packages', 'A4']],
  ['zh-Hans', ['包内 YAML', '模板包', 'A4']]
]) {
  const path = `_site/documentation/${language}.html`;
  check(`${language} documentation exists`, existsSync(path));
  if (!existsSync(path)) continue;
  const html = readFileSync(path, 'utf8');
  check(`${language} documentation has its TOC`, html.includes('data-doc-toc'));
  check(`${language} documentation has anchored headings`, /<h2[^>]+id="/.test(html));
  check(
    `${language} documentation has current source content`,
    required.every((needle) => html.includes(needle))
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('site documentation: both languages built with heading targets');
```

The Simplified Chinese assertions may use a required English technical token instead of a
translated sentence if the current translated guide has no matching section heading.

- [ ] **Step 2: Run the check and verify it fails**

Run: `node test/checks/check-site-docs.mjs`
Expected: FAIL because `scripts/build-site.mjs` does not exist.

- [ ] **Step 3: Add Markdown rendering dependencies and scripts**

Run:

```sh
npm install --save-dev github-slugger rehype-katex rehype-slug rehype-stringify remark-rehype
```

In `package.json`, add:

```json
"site:build": "node scripts/build-site.mjs",
"site:preview": "node scripts/serve-site.mjs"
```

Add `_site` to `.gitignore`.

- [ ] **Step 4: Create the local preview server**

Create `scripts/serve-site.mjs`:

```js
/**
 * Serves the generated public site for desktop and mobile visual checks.
 *
 * Example: `npm run site:build && npm run site:preview` opens the same relative URLs used on
 * GitHub Pages, where the project is mounted below `/yi/`.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../_site/', import.meta.url);
const port = Number(process.env.YI_SITE_PORT ?? 1430);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

createServer(async (request, response) => {
  const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = normalize(requested === '/' ? 'index.html' : requested.slice(1));
  const file = new URL(relative, root);
  try {
    const body = await readFile(file);
    if (!file.href.startsWith(root.href)) throw new Error('outside the site');
    response.writeHead(200, { 'content-type': types[extname(file.pathname)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Yi site: http://127.0.0.1:${port}/`);
});
```

`join` is removed from the import because the URL constructor performs the join.

- [ ] **Step 5: Build both documentation fragments**

Create `scripts/build-site.mjs` with these concrete parts:

```js
/**
 * Builds the public GitHub Pages artifact from the static shell and bundled Documentation.
 *
 * Example: `npm run site:build` writes `_site/index.html` and
 * `_site/documentation/{en,zh-Hans}.html`; neither output is committed.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import GithubSlugger from 'github-slugger';

const root = new URL('../', import.meta.url);
const source = new URL('site/', root);
const output = new URL('_site/', root);
const documents = [
  { language: 'en', path: 'src/ui/documentation/en.md', tocLabel: 'On this page' },
  { language: 'zh-Hans', path: 'src/ui/documentation/zh-Hans.md', tocLabel: '本页目录' }
];

function textOf(node) {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(textOf).join('');
}

function tocMarkup(items) {
  if (items.length === 0) return '';
  return `<ol>${items
    .map(
      (item) =>
        `<li class="doc-toc__item doc-toc__item--h${item.depth}">` +
        `<a href="#${item.id}">${escapeHtml(item.text)}</a></li>`
    )
    .join('')}</ol>`;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function buildDocument(document) {
  const markdown = await readFile(new URL(document.path, root), 'utf8');
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMath);
  const tree = processor.parse(markdown);
  const slugs = new GithubSlugger();
  const headings = [];
  for (const node of tree.children) {
    if (node.type !== 'heading' || node.depth < 2 || node.depth > 3) continue;
    const label = textOf(node).trim();
    const id = slugs.slug(label);
    node.data ??= {};
    node.data.hProperties ??= {};
    node.data.hProperties.id = id;
    headings.push({ depth: node.depth, id, text: label });
  }
  if (headings.length === 0) {
    throw new Error(`${document.path} produced no table-of-contents headings`);
  }
  const rendered = await processor
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeKatex, { output: 'htmlAndMathml' })
    .use(rehypeStringify)
    .run(tree);
  const html = String(processor.stringify(rendered));
  return (
    `<aside class="doc-toc" data-doc-toc>` +
    `<p class="doc-toc__label">${document.tocLabel}</p>${tocMarkup(headings)}</aside>` +
    `<article class="docs-article">${html}</article>`
  );
}

if (!existsSync(source)) throw new Error('site/ is missing');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await mkdir(new URL('documentation/', output), { recursive: true });
await mkdir(new URL('assets/katex/', output), { recursive: true });
await cp(
  new URL('node_modules/katex/dist/katex.min.css', root),
  new URL('assets/katex/katex.min.css', output)
);
await cp(new URL('node_modules/katex/dist/fonts/', root), new URL('assets/katex/fonts/', output), {
  recursive: true
});
for (const document of documents) {
  const html = await buildDocument(document);
  await writeFile(new URL(`documentation/${document.language}.html`, output), html);
}
console.log('site: built _site/index.html and both documentation fragments');
```

The `processor.run(tree)` pipeline processes the already-parsed tree that contains the assigned
heading IDs. If unified returns a transformed tree, stringify that result directly; do not parse
the Markdown twice.

- [ ] **Step 6: Provide the initial site shell**

Create minimal `site/index.html`, `site/styles.css` and `site/app.js` files that contain the
required head metadata and an empty `<main>`, so `cp` and local preview have a target. Task 2
replaces the shell with the real landing page.

`site/index.html` must at minimum include:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Yi — local-first Markdown writing</title>
    <link rel="stylesheet" href="./assets/katex/katex.min.css">
  </head>
  <body>
    <main></main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

- [ ] **Step 7: Run the documentation build check**

Run: `node test/checks/check-site-docs.mjs`
Expected: PASS and print `site documentation: both languages built with heading targets`.

- [ ] **Step 8: Commit Task 1**

```sh
git add .gitignore package.json package-lock.json scripts/build-site.mjs scripts/serve-site.mjs site/index.html site/styles.css site/app.js test/checks/check-site-docs.mjs
git commit -m "feat(site): build bilingual documentation pages"
```

---

### Task 2: Bilingual Landing Page

**Files:**
- Modify: `site/index.html`
- Modify: `site/styles.css`
- Modify: `site/app.js`
- Create: `site/assets/icon.png`
- Test: `test/checks/check-site.mjs`

**Interfaces:**
- Consumes: application icon at `src-tauri/icons/128x128.png`.
- Consumes: translation state controlled by `site/app.js` through `lang-option` buttons.
- Produces: language-neutral DOM keyed with `data-i18n` attributes that `app.js` fills from one
  `COPY` dictionary.

- [ ] **Step 1: Write the failing site structure check**

Create `test/checks/check-site.mjs`:

```js
/**
 * Holds the public landing page to the approved content, language and navigation contract.
 *
 * Example: removing a template card or an English/Chinese string fails `npm run check`.
 */
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync('site/index.html', 'utf8');
const css = readFileSync('site/styles.css', 'utf8');
const js = readFileSync('site/app.js', 'utf8');
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

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('site: bilingual landing page and template links are present');
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `node test/checks/check-site.mjs`
Expected: FAIL because the landing copy, tabs, cards and icon do not exist.

- [ ] **Step 3: Copy the application icon**

Run:

```sh
mkdir -p site/assets/screenshots
cp src-tauri/icons/128x128.png site/assets/icon.png
```

- [ ] **Step 4: Implement the semantic page shell**

Replace `site/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Yi is a local-first Markdown writing environment for notes, research and long-form documents.">
    <title>Yi — local-first Markdown writing</title>
    <link rel="icon" href="./assets/icon.png">
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <a class="brand" href="./" aria-label="Yi home">
        <img src="./assets/icon.png" width="38" height="38" alt="">
        <span>Yi</span>
      </a>
      <nav aria-label="Primary">
        <a href="#features" data-i18n="nav.features">Features</a>
        <a href="#examples" data-i18n="nav.templates">Templates</a>
        <a href="#documentation" data-i18n="nav.docs">Documentation</a>
      </nav>
      <div class="language" role="group" aria-label="Language">
        <button type="button" data-lang="en" aria-pressed="true">English</button>
        <button type="button" data-lang="zh-Hans" aria-pressed="false">简体中文</button>
      </div>
      <a class="github" href="https://github.com/yungleung/yi">GitHub</a>
    </header>
    <main id="main">
      <section class="hero">
        <div class="hero__copy">
          <p class="eyebrow" data-i18n="hero.eyebrow">Local-first writing</p>
          <h1 data-i18n="hero.title">Your notes, at home in Markdown.</h1>
          <p class="hero__body" data-i18n="hero.body">Write in a calm, rendered page while every note stays an ordinary file you own.</p>
          <div class="actions">
            <a class="button button--primary" href="#explore" data-i18n="hero.templates">Explore templates</a>
            <a class="button" href="https://github.com/yungleung/yi" data-i18n="hero.github">View on GitHub</a>
          </div>
        </div>
        <figure class="hero__media">
          <img
            data-screenshot="hero"
            src="./assets/screenshots/hero.webp"
            data-alt-en="The Yi editor showing rendered Markdown, the workspace tree and native desktop controls."
            data-alt-zh="易编辑器界面，显示渲染后的 Markdown、工作区目录树和原生桌面控件。"
            alt=""
            width="1800"
            height="1125"
            loading="eager">
        </figure>
      </section>
      <section id="features" class="feature-story">
        <header class="section-heading">
          <p class="eyebrow" data-i18n="features.eyebrow">A writing home</p>
          <h2 data-i18n="features.title">One place for notes, knowledge and finished work.</h2>
        </header>
        <article class="feature" id="daily-notes">
          <div class="feature__copy">
            <p class="feature__number">01</p>
            <h3 data-i18n="daily.title">Daily notes</h3>
            <p data-i18n="daily.body">Open a folder, capture a thought and stay in the writing. Files remain readable outside Yi.</p>
            <ul>
              <li data-i18n="daily.one">Quick capture with ordinary Markdown files.</li>
              <li data-i18n="daily.two">Workspace tree, search, session stack and autosave.</li>
              <li data-i18n="daily.three">Light, dark and automatic themes with long-note performance.</li>
            </ul>
          </div>
          <figure class="feature__media">
            <img
              src="./assets/screenshots/hero.webp"
              data-alt-en="Daily writing in Yi with rendered prose and workspace navigation."
              data-alt-zh="在易中日常写作，显示渲染后的正文与工作区导航。"
              alt=""
              width="1800"
              height="1125"
              loading="lazy">
          </figure>
        </article>
        <article class="feature feature--reverse" id="knowledge-base">
          <div class="feature__copy">
            <p class="feature__number">02</p>
            <h3 data-i18n="knowledge.title">Personal knowledge base</h3>
            <p data-i18n="knowledge.body">Connect notes without trapping them in a database. Yi resolves the links while the source stays portable.</p>
            <ul>
              <li data-i18n="knowledge.one">Wikilinks and automatic cross-references.</li>
              <li data-i18n="knowledge.two">Structured frontmatter and stable document IDs.</li>
              <li data-i18n="knowledge.three">CSL citations and local bibliography files.</li>
            </ul>
          </div>
          <figure class="feature__media">
            <img
              src="./assets/screenshots/cross-references.webp"
              data-alt-en="Yi showing linked notes, citations and cross-references in rendered Markdown."
              data-alt-zh="易在渲染后的 Markdown 中显示笔记链接、引用与交叉引用。"
              alt=""
              width="1800"
              height="1125"
              loading="lazy">
          </figure>
        </article>
        <article class="feature" id="writing-publishing">
          <div class="feature__copy">
            <p class="feature__number">03</p>
            <h3 data-i18n="writing.title">Writing and publishing</h3>
            <p data-i18n="writing.body">Write mathematical and academic prose in the editor, then hand the same note to a trusted template.</p>
            <ul>
              <li data-i18n="writing.one">KaTeX mathematics, callouts, theorem blocks and footnotes.</li>
              <li data-i18n="writing.two">Export to Word, ODT, LaTeX, HTML, EPUB, PDF, Reveal.js and Beamer.</li>
              <li data-i18n="writing.three">Reusable Pandoc template packages and native citation workflows.</li>
            </ul>
          </div>
          <figure class="feature__media">
            <img
              src="./assets/screenshots/template-workbench.webp"
              data-alt-en="The Yi template workbench showing packaged export styles."
              data-alt-zh="易的模板工作台，显示打包的导出样式。"
              alt=""
              width="1800"
              height="1125"
              loading="lazy">
          </figure>
        </article>
      </section>
      <section class="workbench" id="explore">
        <div role="tablist" aria-label="Explore Yi">
          <button role="tab" id="tab-templates" aria-controls="panel-templates" aria-selected="true" data-i18n="tabs.templates">Templates</button>
          <button role="tab" id="tab-docs" aria-controls="panel-docs" aria-selected="false" tabindex="-1" data-i18n="tabs.docs">Documentation</button>
        </div>
        <section id="panel-templates" role="tabpanel" aria-labelledby="tab-templates">
          <div class="template-grid">
            <a class="template-card" href="https://github.com/yungleung/yi/tree/main/examples/templates/html">
              <span class="template-card__kind">HTML</span>
              <strong data-en="Technical article" data-zh="技术文章">Technical article</strong>
              <span data-en="Sidebar contents, responsive layout and local CSS." data-zh="侧边目录、响应式布局与本地 CSS。">Sidebar contents, responsive layout and local CSS.</span>
            </a>
            <a class="template-card" href="https://github.com/yungleung/yi/tree/main/examples/templates/latex">
              <span class="template-card__kind">LaTeX</span>
              <strong data-en="PRL manuscript" data-zh="PRL 论文稿">PRL manuscript</strong>
              <span data-en="REVTeX, structured authors, figures and native BibTeX." data-zh="REVTeX、结构化作者、图表与原生 BibTeX。">REVTeX, structured authors, figures and native BibTeX.</span>
            </a>
            <a class="template-card" href="https://github.com/yungleung/yi/tree/main/examples/templates/pdf">
              <span class="template-card__kind">PDF</span>
              <strong data-en="Academic report" data-zh="学术报告">Academic report</strong>
              <span data-en="XeLaTeX title page, sections, code and references." data-zh="XeLaTeX 标题页、章节、代码与参考文献。">XeLaTeX title page, sections, code and references.</span>
            </a>
            <a class="template-card" href="https://github.com/yungleung/yi/tree/main/examples/templates/rho-class">
              <span class="template-card__kind">PDF</span>
              <strong data-en="Rho Class article" data-zh="Rho Class 论文">Rho Class article</strong>
              <span data-en="A licensed two-column journal class with callouts and IEEE references." data-zh="带提示框与 IEEE 参考文献的授权双栏期刊样式。">A licensed two-column journal class with callouts and IEEE references.</span>
            </a>
            <a class="template-card" href="https://github.com/yungleung/yi/tree/main/examples/templates/legrand-orange-book">
              <span class="template-card__kind">PDF</span>
              <strong data-en="Legrand Orange Book" data-zh="Legrand Orange Book">Legrand Orange Book</strong>
              <span data-en="Book parts, chapter art, callouts and template-owned theorem styles." data-zh="书籍分部、章节插图、提示框与模板定理样式。">Book parts, chapter art, callouts and template-owned theorem styles.</span>
            </a>
            <a class="template-card" href="https://github.com/yungleung/yi/tree/main/examples/templates/epub">
              <span class="template-card__kind">EPUB</span>
              <strong data-en="Literary EPUB" data-zh="文学 EPUB">Literary EPUB</strong>
              <span data-en="Cover, front matter, navigation and reflowable chapter design." data-zh="封面、前置页、导航与可重排章节设计。">Cover, front matter, navigation and reflowable chapter design.</span>
            </a>
            <a class="template-card" href="https://github.com/yungleung/yi/tree/main/examples/templates/docx">
              <span class="template-card__kind">Word</span>
              <strong data-en="Word report" data-zh="Word 报告">Word report</strong>
              <span data-en="A styled reference document with field-based contents." data-zh="带字段目录与完整样式的参考文档。">A styled reference document with field-based contents.</span>
            </a>
            <a class="template-card" href="https://github.com/yungleung/yi/tree/main/examples/templates/odt">
              <span class="template-card__kind">ODT</span>
              <strong data-en="Dissertation" data-zh="学位论文">Dissertation</strong>
              <span data-en="Cover, abstract, cached contents and body-only page numbering." data-zh="封面、摘要、缓存目录与仅正文页码。">Cover, abstract, cached contents and body-only page numbering.</span>
            </a>
          </div>
          <a class="all-templates" href="https://github.com/yungleung/yi/tree/main/examples/templates" data-i18n="templates.all">Browse every template package</a>
        </section>
        <section id="panel-docs" role="tabpanel" aria-labelledby="tab-docs" hidden>
          <div class="doc-shell" data-doc-shell>
            <div data-doc-body>
              <p data-i18n="docs.loading">Loading documentation…</p>
            </div>
          </div>
        </section>
      </section>
    </main>
    <footer>
      <p>Yi · MIT · <span data-i18n="footer.author">Made by yungleung</span></p>
      <a href="https://github.com/yungleung/yi">GitHub</a>
    </footer>
    <noscript>
      <p>
        <a href="./documentation/en.html">English documentation</a>
        ·
        <a href="./documentation/zh-Hans.html">简体中文文档</a>
      </p>
    </noscript>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

- [ ] **Step 5: Add the bilingual dictionary and language state**

In `site/app.js`, define:

```js
const COPY = {
  en: {
    title: 'Yi — local-first Markdown writing',
    description: 'Yi is a local-first Markdown writing environment for notes, research and long-form documents.',
    'nav.features': 'Features',
    'nav.templates': 'Templates',
    'nav.docs': 'Documentation',
    'hero.eyebrow': 'Local-first writing',
    'hero.title': 'Your notes, at home in Markdown.',
    'hero.body': 'Write in a calm, rendered page while every note stays an ordinary file you own.',
    'hero.templates': 'Explore templates',
    'hero.github': 'View on GitHub',
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
    'templates.all': 'Browse every template package',
    'docs.toc': 'On this page',
    'docs.loading': 'Loading documentation…',
    'docs.error': 'Documentation could not be loaded.',
    'footer.author': 'Made by yungleung'
  },
  'zh-Hans': {
    title: '易 — 本地优先的 Markdown 写作环境',
    description: '易是一款面向笔记、研究与长文写作的本地优先 Markdown 编辑器。',
    'nav.features': '功能',
    'nav.templates': '模板示例',
    'nav.docs': '文档',
    'hero.eyebrow': '本地优先写作',
    'hero.title': '让笔记回到 Markdown。',
    'hero.body': '在舒适的渲染页面中书写，同时让每一篇笔记都保持为你拥有的普通文件。',
    'hero.templates': '浏览模板',
    'hero.github': '在 GitHub 查看',
    'features.eyebrow': '写作的家',
    'features.title': '笔记、知识与完成的作品，都在同一个地方。',
    'daily.title': '日常笔记',
    'daily.body': '打开文件夹，记录想法，继续写作；文件在易之外也能正常阅读。',
    'daily.one': '用普通 Markdown 文件快速记录。',
    'daily.two': '工作区目录、搜索、会话栈与自动保存。',
    'daily.three': '浅色、深色与自动主题，并保持长文性能。',
    'knowledge.title': '个人知识库',
    'knowledge.body': '连接笔记，而不把它们锁进数据库；易负责解析链接，源文件依然可移植。',
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
    'templates.all': '浏览全部模板包',
    'docs.toc': '本页目录',
    'docs.loading': '正在加载文档…',
    'docs.error': '文档加载失败。',
    'footer.author': '由 yungleung 制作'
  }
};
```

Implement `applyLanguage(language)` to:

1. validate `en` or `zh-Hans`;
2. set `<html lang>`, `document.title` and the description meta;
3. update every `[data-i18n]` from `COPY[language]`;
4. update template titles and descriptions stored as `data-en` / `data-zh` attributes;
5. update `aria-pressed`;
6. store the language in `localStorage` inside `try/catch`.

- [ ] **Step 6: Implement the editorial CSS**

In `site/styles.css`, define these tokens:

```css
:root {
  --paper: #f7f3ea;
  --paper-deep: #eee6d8;
  --ink: #171714;
  --muted: #625f58;
  --line: #d8d0c2;
  --accent: #b14d2f;
  --accent-soft: #f0d8ca;
  --panel: #fffdf8;
  --serif: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --sans: "Avenir Next", "Segoe UI", sans-serif;
}
```

Implement:

- a centered `min(1180px, calc(100% - 40px))` layout;
- sticky translucent header with a fine bottom rule;
- hero using a two-column grid and overflow-hidden paper surface;
- feature sections using alternating asymmetric grids;
- template cards in an auto-fit grid with restrained borders and hover elevation;
- documentation panel with a sticky TOC column and article column;
- visible `:focus-visible` rings;
- breakpoints at `960px` and `680px`;
- `@media (prefers-reduced-motion: reduce)` removing transforms and scroll behaviour;
- no color-only indication of active tabs or language.

- [ ] **Step 7: Run the site structure check**

Run: `node test/checks/check-site.mjs`
Expected: PASS. The content-related assertions cover the required copy, feature bullets, template
cards, footer, `noscript` links and ARIA attributes.

- [ ] **Step 8: Commit Task 2**

```sh
git add site/index.html site/styles.css site/app.js site/assets/icon.png test/checks/check-site.mjs
git commit -m "feat(site): add the bilingual landing page"
```

---

### Task 3: Tabs, Template Catalogue and Language Switching

**Files:**
- Modify: `site/app.js`
- Modify: `site/index.html`
- Test: `test/checks/check-site.mjs`

**Interfaces:**
- Consumes: tab IDs `tab-templates`, `tab-docs`, `panel-templates`, `panel-docs`.
- Produces: functions `activateTab(id, focus)`, `applyLanguage(language)` and
  `loadDocumentation(language)`.
- Produces: language events used by the Documentation task.

- [ ] **Step 1: Extend the failing check**

Add assertions:

```js
check(
  'tabs expose keyboard semantics',
  html.includes('role="tablist"') &&
    html.includes('aria-selected="true"') &&
    html.includes('aria-controls="panel-templates"') &&
    js.includes("event.key === 'ArrowRight'") &&
    js.includes("event.key === 'Home'")
);
check(
  'language switching updates both languages',
  js.includes("localStorage.setItem('yi-site-language'") &&
    js.includes("document.documentElement.lang = language")
);
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `node test/checks/check-site.mjs`
Expected: FAIL on missing tab keyboard and persistence code.

- [ ] **Step 3: Implement accessible tabs**

In `site/app.js`, query `[role="tab"]`, set active state with:

```js
function activateTab(tab, moveFocus = false) {
  for (const candidate of tabs) {
    const selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    document.getElementById(candidate.getAttribute('aria-controls')).hidden = !selected;
  }
  if (moveFocus) tab.focus();
}
```

Add click delegation and keydown handling for `ArrowLeft`, `ArrowRight`, `Home` and `End`.
Wrapping must move from the last tab to the first and the reverse.

- [ ] **Step 4: Implement language switching**

Use stored language, otherwise `en`. Language buttons call `applyLanguage`. After changing
language, the active Documentation tab calls `loadDocumentation(language)`; the Templates tab
updates card titles and descriptions immediately.

Do not reload the page on language change. Keep the active tab and scroll position.

- [ ] **Step 5: Verify all eight template destinations**

Check each card in both languages against the GitHub URL table in the spec. The visible card
contains the template name, a one-sentence purpose, and a localized **Open repository** or
**打开仓库** label. The whole card must be one link or contain one explicit link without nesting
interactive content.

- [ ] **Step 6: Run the check**

Run: `node test/checks/check-site.mjs`
Expected: screenshot failures remain; tab and language assertions pass.

- [ ] **Step 7: Commit Task 3**

```sh
git add site/index.html site/app.js test/checks/check-site.mjs
git commit -m "feat(site): add templates and language tabs"
```

---

### Task 4: Documentation Tab and TOC

**Files:**
- Modify: `site/app.js`
- Modify: `site/styles.css`
- Test: `test/checks/check-site.mjs`
- Test: `test/checks/check-site-docs.mjs`

**Interfaces:**
- Consumes: generated fragments `documentation/en.html` and `documentation/zh-Hans.html`.
- Consumes fragment markup: `<aside class="doc-toc" data-doc-toc>` followed by
  `<article class="docs-article">`.
- Produces: active heading tracking with `IntersectionObserver`.

- [ ] **Step 1: Add failing documentation interaction assertions**

In `test/checks/check-site.mjs`, add:

```js
check(
  'the Documentation tab loads the selected language',
  js.includes('documentation/${language}.html') &&
    js.includes('loadDocumentation(language)')
);
check(
  'the Documentation tab tracks headings',
  js.includes('IntersectionObserver') && js.includes('data-doc-toc')
);
check(
  'the Documentation tab has a localized failure state',
  js.includes('docs.error')
);
```

- [ ] **Step 2: Run the checks and verify failure**

Run: `node test/checks/check-site.mjs`
Expected: FAIL because documentation loading and TOC tracking are absent.

- [ ] **Step 3: Load documentation as a fragment**

Implement:

```js
const docsBody = document.querySelector('[data-doc-body]');
let currentDocumentation = null;

async function loadDocumentation(language) {
  if (currentDocumentation === language) return;
  docsBody.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`./documentation/${language}.html`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    docsBody.innerHTML = await response.text();
    localizeDocumentation(language);
    trackDocumentationHeadings();
    currentDocumentation = language;
  } catch {
    currentDocumentation = null;
    docsBody.innerHTML =
      `<p class="doc-error">${COPY[language]['docs.error']} ` +
      `<a href="https://github.com/yungleung/yi/blob/main/src/ui/documentation/${language}.md">` +
      `GitHub</a>.</p>`;
  } finally {
    docsBody.removeAttribute('aria-busy');
  }
}
```

Set the TOC label from `COPY[language]['docs.toc']` instead of trusting the build label.

- [ ] **Step 4: Implement the sidebar TOC**

On tab activation:

1. fetch the active language fragment;
2. find `[data-doc-toc]` and all `.docs-article h2, .docs-article h3`;
3. create an `IntersectionObserver` with `rootMargin: '0px 0px -72% 0px'`;
4. mark the last intersecting heading’s matching TOC link with
   `aria-current="location"`;
5. disconnect the previous observer before switching language;
6. intercept in-document TOC clicks and call `scrollIntoView({block: 'start'})`, then update the
   URL hash without a page reload.

When no heading intersects, keep the nearest preceding heading active.

- [ ] **Step 5: Add responsive TOC styling**

In desktop CSS:

```css
.doc-shell {
  display: grid;
  grid-template-columns: minmax(190px, 250px) minmax(0, 1fr);
  gap: clamp(28px, 5vw, 72px);
}
.doc-toc {
  position: sticky;
  top: 94px;
  align-self: start;
  max-height: calc(100vh - 120px);
  overflow: auto;
}
.docs-article {
  min-width: 0;
  max-width: 78ch;
}
.docs-article pre {
  overflow-x: auto;
}
```

Below `960px`, make the TOC a non-sticky block above the article and collapse it with a native
`<details>` element or an equivalent accessible disclosure control. The TOC must not disappear on
mobile.

- [ ] **Step 6: Style the converted documentation**

Add explicit styles for:

- `.docs-article h2`, `h3`, `p`, `ul`, `ol`, `blockquote`;
- `.docs-article table` with horizontal overflow;
- `.docs-article code` and `pre`;
- `.docs-article .katex-display`;
- `.docs-article a`;
- `.doc-toc a[aria-current="location"]`.

- [ ] **Step 7: Run documentation checks**

Run:

```sh
node test/checks/check-site-docs.mjs
node test/checks/check-site.mjs
```

Expected: documentation checks pass; only missing screenshot assertions may remain.

- [ ] **Step 8: Browser-verify TOC navigation**

Run:

```sh
npm run site:build
npm run site:preview
```

At `http://127.0.0.1:1430/`:

- open Documentation;
- click at least three TOC entries;
- scroll between sections and confirm active state changes;
- switch language and confirm the article and TOC switch;
- resize below `680px` and confirm the TOC remains reachable.

- [ ] **Step 9: Commit Task 4**

```sh
git add site/app.js site/styles.css test/checks/check-site.mjs test/checks/check-site-docs.mjs
git commit -m "feat(site): add documentation with a sidebar toc"
```

---

### Task 5: Real Application Screenshots

**Files:**
- Create: `site/assets/screenshots/hero.webp`
- Create: `site/assets/screenshots/cross-references.webp`
- Create: `site/assets/screenshots/template-workbench.webp`
- Modify: `site/index.html`
- Modify: `test/checks/check-site.mjs`

**Interfaces:**
- Consumes: the running Tauri app through the MCP bridge.
- Produces: three optimized screenshots with bilingual alternative text.

- [ ] **Step 1: Add failing screenshot assertions**

Add:

```js
for (const screenshot of ['hero.webp', 'cross-references.webp', 'template-workbench.webp']) {
  check(`the site ships ${screenshot}`, existsSync(`site/assets/screenshots/${screenshot}`));
}
check(
  'screenshots have descriptive alternatives',
  html.includes('data-alt-en=') && html.includes('data-alt-zh=')
);
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `node test/checks/check-site.mjs`
Expected: FAIL because the screenshots do not exist.

- [ ] **Step 3: Start Yi on this branch**

Run: `npm run tauri dev`
Restarting is required because the site branch must be the code the app is measuring.

- [ ] **Step 4: Prepare the hero screenshot**

Use a Tauri probe or the running app to:

1. open `test/fixtures/workspace/default-document.md`;
2. use the light theme;
3. use the page layout;
4. scroll to a region showing rendered prose, a table and a callout or formula;
5. resize the window to a 16:10 landscape shape.

Capture the window through the MCP bridge or a native window screenshot. Save the raw capture in
`/private/tmp/yi-site-hero.png`, inspect it, then convert with:

```sh
sips -s format webp -Z 1800 /private/tmp/yi-site-hero.png --out site/assets/screenshots/hero.webp
```

- [ ] **Step 5: Prepare the cross-reference screenshot**

Open a fixture note containing wikilinks, citations and references. Capture a focused window view
that visibly shows rendered links and academic content. Save and optimize as
`cross-references.webp`.

- [ ] **Step 6: Prepare the template-workbench screenshot**

Open the export-template manager or template editor with the library visible. Capture enough of
the window to show that Yi manages real template packages. Save and optimize as
`template-workbench.webp`.

- [ ] **Step 7: Place screenshots and alternatives**

Use them in the hero and feature sections. Every image needs width, height, `loading`, and
`data-alt-en` / `data-alt-zh`; `applyLanguage` copies the selected alternative into `alt`.

- [ ] **Step 8: Run the site check**

Run: `node test/checks/check-site.mjs`
Expected: PASS.

- [ ] **Step 9: Inspect the screenshots at desktop and mobile widths**

Run the local preview and verify:

- text is readable after scaling;
- screenshots are not stretched;
- mobile does not require horizontal scrolling;
- each image’s alternative describes the feature, not merely “screenshot”.

- [ ] **Step 10: Commit Task 5**

```sh
git add site/index.html site/app.js site/assets/screenshots test/checks/check-site.mjs
git commit -m "feat(site): show yi in the public pages"
```

---

### Task 6: Pages Workflow and Final Verification

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`
- Modify: `docs/ai-context.md`
- Modify: `test/README.md`
- Test: `test/checks/check-site.mjs`
- Test: `test/checks/check-site-docs.mjs`

**Interfaces:**
- Consumes: `npm run site:build` and `_site/`.
- Produces: a GitHub Pages artifact deployment triggered by pushes to `main`.

- [ ] **Step 1: Add failing workflow assertions**

In `test/checks/check-site.mjs`, add:

```js
const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');
check('Pages deploys from main', workflow.includes('branches: [main]'));
check(
  'Pages uploads the generated artifact',
  workflow.includes('actions/upload-pages-artifact') && workflow.includes('path: _site')
);
check(
  'Pages uses the deployment action',
  workflow.includes('actions/deploy-pages')
);
check(
  'Pages has the required permissions',
  ['contents: read', 'pages: write', 'id-token: write'].every((line) => workflow.includes(line))
);
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `node test/checks/check-site.mjs`
Expected: FAIL because the Pages workflow does not exist.

- [ ] **Step 3: Add the Pages workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run site:build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Document the public site commands**

In `README.md`, add a short **Project website** section after **Testing**:

```markdown
## Project website

The public site lives in `site/` and deploys to
<https://yungleung.github.io/yi/> through GitHub Pages.

```bash
npm run site:build
npm run site:preview
```

The build converts the current bundled English and Simplified Chinese Documentation rather than
maintaining a separate copy.
```

In `docs/ai-context.md`, add `site:build` and `site:preview` under **Commands you will need**, and
state that `site/` is the public site while `_site/` is generated.

In `test/README.md`, add entries for `check-site.mjs` and `check-site-docs.mjs`.

- [ ] **Step 5: Run the full Node check suite**

Run: `npm run check`
Expected: PASS, including both site checks.

- [ ] **Step 6: Build and inspect the artifact**

Run:

```sh
npm run site:build
find _site -maxdepth 3 -type f | sort
```

Expected: at minimum `_site/index.html`, `_site/styles.css`, `_site/app.js`, both documentation
fragments and all three screenshots.

- [ ] **Step 7: Run desktop and mobile browser checks**

Run `npm run site:preview`.

Desktop:

- verify landing content and screenshots;
- verify all three feature sections;
- verify all eight template links;
- verify Documentation and TOC;
- switch to Simplified Chinese and repeat the checks.

Mobile:

- verify navigation remains usable;
- verify the hero and screenshots do not overflow;
- verify tabs and language controls remain reachable;
- verify the TOC expands and scrolls to headings.

Capture a browser screenshot of both breakpoints for visual review, but do not commit browser-test
screenshots unless they are needed as documentation.

- [ ] **Step 8: Run project verification**

Run:

```sh
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
npm run check
npm run probe -- test/probes/documentation.js
```

Expected: all pass.

- [ ] **Step 9: Commit Task 6**

```sh
git add .github/workflows/pages.yml README.md docs/ai-context.md test/README.md test/checks/check-site.mjs
git commit -m "ci(pages): deploy the public project site"
```

---

## Final Verification

- [ ] Run `git diff --check`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml`.
- [ ] Run `npm run check`.
- [ ] Run `npm run site:build`.
- [ ] Run `npm run probe -- test/probes/documentation.js`.
- [ ] Inspect the built site at desktop and mobile widths in English and Simplified Chinese.
- [ ] Confirm `_site/` is ignored and `git status --short` contains only intended source changes.
- [ ] Report the branch, commits, validation results and the remaining manual GitHub setting:
      select **GitHub Actions** as the repository’s Pages source after pushing.
