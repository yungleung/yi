/**
 * Checks the frontmatter highlighter in Node: the markup it returns must read back as
 * the block's own text, because a caret inside the block is placed by character offset
 * over those characters.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'src/ui/markdown/nodes/frontmatter_highlight.ts',
  logLevel: 'silent'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-source-highlight-'));
const file = join(directory, 'frontmatter_highlight.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { highlightFrontmatter } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** The text a piece of highlighted markup reads back as. */
const textOf = (markup) =>
  markup
    .replace(/<[^>]*>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');

const YAML = '---\nid: 20240707122715\ntitle: "A note & a half"\ntags: [alpha, beta]\n---';

check('a yaml block reads back as itself', textOf(highlightFrontmatter(YAML)), YAML);
check(
  'and a source full of characters HTML would eat',
  textOf(highlightFrontmatter('title: a & b <c> "d" \'e\'')),
  'title: a & b <c> "d" \'e\''
);
check(
  'and one that is not ASCII',
  textOf(highlightFrontmatter('title: 虚无与生发\n')),
  'title: 虚无与生发\n'
);
check('the keys are marked, not left plain', highlightFrontmatter(YAML).includes('hljs-attr'), true);
check(
  'the values are marked too',
  highlightFrontmatter(YAML).includes('hljs-string'),
  true
);
check('an empty block stays empty', highlightFrontmatter(''), '');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('source highlight: all checks passed');
