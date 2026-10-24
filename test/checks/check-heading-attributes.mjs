/**
 * Checks the syntax and round trip of Pandoc heading attributes.
 *
 * The heading title must remain the rendered heading while the exact attribute
 * source stays available for the caret and for serialization. These checks use
 * the editor's parser rather than a second Markdown implementation.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-heading-attributes-'));
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return await import(file);
};

const { readHeadingAttributes } = await load(
  'src/ui/markdown/syntax/heading_attributes.ts',
  'heading_attributes'
);
const { parseMarkdown, serializeMarkdown } = await load(
  'src/ui/markdown/syntax/parser.ts',
  'parser'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check(
  'an ATX heading reads its trailing attributes',
  (() => {
    const found = readHeadingAttributes('## Methods {#methods .unnumbered data-owner=demo}');
    return found && {
      source: found.source,
      separator: found.separatorFrom,
      id: found.id,
      classes: found.classes,
      attributes: found.attributes
    };
  })(),
  {
    source: '{#methods .unnumbered data-owner=demo}',
    separator: '## Methods'.length,
    id: 'methods',
    classes: ['unnumbered'],
    attributes: { 'data-owner': 'demo' }
  }
);
check(
  'a setext heading reads attributes from its title line',
  readHeadingAttributes('Methods {#methods .unnumbered}\n==============================')?.id,
  'methods'
);
check(
  'quoted values and escaped spaces are one value',
  readHeadingAttributes('# A {key="one two" other=two\\ words}')?.attributes,
  { key: 'one two', other: 'two words' }
);
check('an unseparated brace is heading text', readHeadingAttributes('## Methods{#methods}'), null);
check('an unterminated brace is heading text', readHeadingAttributes('## Methods {#methods'), null);
check('a non-final brace is heading text', readHeadingAttributes('## {#methods} Methods'), null);
check(
  'the heading parse hides attributes from rendered children',
  parseMarkdown('## Methods {#methods .unnumbered}\n').children[0].children.map((child) => child.value),
  ['Methods']
);
check(
  'serialization restores the attribute block',
  serializeMarkdown(parseMarkdown('## Methods {#methods .unnumbered}\n')).trim(),
  '## Methods {#methods .unnumbered}'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('heading attributes: all checks passed');
