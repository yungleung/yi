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
  {
    language: 'en',
    path: 'src/ui/documentation/en.md',
    tocLabel: 'On this page',
    title: 'Yi Documentation',
    kicker: 'Documentation',
    backLabel: 'Back to Yi'
  },
  {
    language: 'zh-Hans',
    path: 'src/ui/documentation/zh-Hans.md',
    tocLabel: '本页目录',
    title: 'Yi 文档',
    kicker: '文档',
    backLabel: '返回 Yi'
  }
];

function textOf(node) {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(textOf).join('');
}

/**
 * Groups the flat heading list into a tree so level-three headings nest under
 * the level-two heading that precedes them.
 *
 * Example: `[{depth: 2, …}, {depth: 3, …}, {depth: 2, …}]` becomes two roots,
 * the first carrying the level-three heading as its only child.
 */
function tocTree(items) {
  const roots = [];
  const stack = [];
  for (const item of items) {
    const node = { ...item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].depth >= item.depth) stack.pop();
    (stack.length === 0 ? roots : stack[stack.length - 1].children).push(node);
    stack.push(node);
  }
  return roots;
}

function tocMarkup(nodes) {
  if (nodes.length === 0) return '';
  return `<ol>${nodes.map(tocItemMarkup).join('')}</ol>`;
}

function tocItemMarkup(node) {
  const link = `<a href="#${node.id}">${escapeHtml(node.text)}</a>`;
  const children = node.children.length > 0 ? tocMarkup(node.children) : '';
  return `<li class="doc-toc__item doc-toc__item--h${node.depth}">${link}${children}</li>`;
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
  const parseProcessor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMath);
  const tree = parseProcessor.parse(markdown);
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
  const renderProcessor = unified()
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeKatex, { output: 'htmlAndMathml' })
    .use(rehypeStringify);
  const rendered = await renderProcessor.run(tree);
  const html = String(renderProcessor.stringify(rendered));
  return (
    `<details class="doc-toc" data-doc-toc open>` +
    `<summary class="doc-toc__label">${document.tocLabel}</summary>${tocMarkup(tocTree(headings))}</details>` +
    `<article class="docs-article">${html}</article>`
  );
}

/**
 * Wraps a generated Documentation fragment in a complete page for no-script readers.
 *
 * Example: `/documentation/en-page.html` uses the same article and TOC as the tab while also
 * loading the public-site typography and local KaTeX resources.
 */
function standalonePage(document, fragment) {
  return `<!doctype html>
<html lang="${document.language}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(document.title)}</title>
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
    <link rel="icon" type="image/png" href="../assets/favicon.png">
    <link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">
    <link rel="stylesheet" href="../styles.css">
    <link rel="stylesheet" href="../assets/katex/katex.min.css">
  </head>
  <body class="standalone-page">
    <header class="standalone-header">
      <a class="brand" href="../index.html"><span>Yi</span></a>
      <a href="../index.html">${escapeHtml(document.backLabel)}</a>
    </header>
    <main class="standalone-docs">
      <header class="standalone-title">
        <p>${escapeHtml(document.kicker)}</p>
        <h1>${escapeHtml(document.title)}</h1>
      </header>
      <div class="doc-shell">${fragment}</div>
    </main>
    <script type="module" src="../standalone_docs.js"></script>
  </body>
</html>
`;
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
  const fragment = await buildDocument(document);
  await writeFile(new URL(`documentation/${document.language}.html`, output), fragment);
  await writeFile(
    new URL(`documentation/${document.language}-page.html`, output),
    standalonePage(document, fragment)
  );
}
console.log('site: built _site/index.html and both documentation formats');
