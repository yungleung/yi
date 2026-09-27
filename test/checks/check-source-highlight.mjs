/**
 * Checks the frontmatter highlighter in Node: the markup it returns must read back as
 * the block's own text, because a caret inside the block is placed by character offset
 * over those characters.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const { highlightFrontmatter } = await import(file);

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
const TOML = '+++\ntitle = "A note"\ndraft = true\n+++';
const PAIRS = 'title = "A note"\ndraft = true';

check('a yaml block reads back as itself', textOf(highlightFrontmatter(YAML, 'yaml')), YAML);
check('a toml block reads back as itself', textOf(highlightFrontmatter(TOML, 'toml')), TOML);
check(
  'and a source full of characters HTML would eat',
  textOf(highlightFrontmatter('title: a & b <c> "d" \'e\'', 'yaml')),
  'title: a & b <c> "d" \'e\''
);
check(
  'and one that is not ASCII',
  textOf(highlightFrontmatter('title: 虚无与生发\n', 'yaml')),
  'title: 虚无与生发\n'
);
check('the keys are marked, not left plain', highlightFrontmatter(YAML, 'yaml').includes('hljs-attr'), true);
check(
  'the values are marked too',
  highlightFrontmatter(YAML, 'yaml').includes('hljs-string'),
  true
);
check(
  'the format is the one the block was parsed as',
  highlightFrontmatter(PAIRS, 'toml') !== highlightFrontmatter(PAIRS, 'yaml'),
  true
);
check('an empty block stays empty', highlightFrontmatter('', 'yaml'), '');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('source highlight: all checks passed');
