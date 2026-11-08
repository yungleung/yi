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

function tocHtml(html) {
  const start = html.indexOf('data-doc-toc');
  const end = html.indexOf('</details>', start);
  return start === -1 || end === -1 ? '' : html.slice(start, end);
}

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
  check(
    `${language} TOC is a collapsible disclosure`,
    html.includes('<summary class="doc-toc__label"')
  );
  check(`${language} documentation has anchored headings`, /<h2[^>]+id="/.test(html));
  check(
    `${language} nests level-three entries under their level-two heading`,
    /doc-toc__item--h2">[\s\S]*?<ol>[\s\S]*?doc-toc__item--h3/.test(tocHtml(html))
  );
  check(
    `${language} documentation has current source content`,
    required.every((needle) => html.includes(needle))
  );

  const pagePath = `_site/documentation/${language}-page.html`;
  check(`${language} standalone documentation exists`, existsSync(pagePath));
  if (existsSync(pagePath)) {
    const page = readFileSync(pagePath, 'utf8');
    check(
      `${language} standalone documentation is a complete styled page`,
      page.startsWith('<!doctype html>') &&
        page.includes(`<html lang="${language}">`) &&
        page.includes('<link rel="stylesheet" href="../styles.css">') &&
        page.includes('<link rel="stylesheet" href="../assets/katex/katex.min.css">') &&
        page.includes('<script type="module" src="../standalone_docs.js"></script>') &&
        page.includes('<h1>') &&
        page.includes('data-doc-toc') &&
        page.includes('class="docs-article"') &&
        page.includes('href="../index.html"') &&
        !page.includes('易')
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('site documentation: both languages built with a nested TOC');
