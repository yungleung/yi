/**
 * Checks Pandoc implicit-figure recognition and figure attribute parsing.
 *
 * Only a paragraph containing one non-empty-alt image is a figure. Valid
 * trailing image attributes stay source coordinates, while malformed or inline
 * attributes remain ordinary Markdown.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-figures-'));
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return await import(pathToFileURL(file).href);
};
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
const first = (markdown) => parseMarkdown(markdown).children[0];

const plain = first('![Caption](a.png)\n');
check('a standalone non-empty-alt image is a figure', plain.type, 'figure');
check('with its image as the child', plain.children[0].type, 'image');
check('and no explicit target', plain.id, null);
check('serialization preserves the native image', serializeMarkdown(parseMarkdown('![Caption](a.png)\n')).trim(), '![Caption](a.png)');

const attributed = first('![Caption](a.png){#fig:a .wide width=80% owner=model}\n');
check(
  'figure attributes are separated from the image source',
  {
    id: attributed.id,
    classes: attributed.classes,
    attributes: attributed.attributes,
    source: attributed.attribute?.source
  },
  {
    id: 'fig:a',
    classes: ['wide'],
    attributes: { width: '80%', owner: 'model' },
    source: '{#fig:a .wide width=80% owner=model}'
  }
);
check(
  'the figure keeps the complete source',
  attributed.source,
  '![Caption](a.png){#fig:a .wide width=80% owner=model}'
);
check(
  'the image title is retained',
  first('![Caption](a.png "Title")\n').children[0].title,
  'Title'
);

check('an inline image is not a figure', first('Before ![Caption](a.png) after\n').type, 'paragraph');
check('an empty-alt image is not a figure', first('![](a.png)\n').type, 'paragraph');
check(
  'text after attributes prevents a figure',
  first('![Caption](a.png){#fig:a} after\n').type,
  'paragraph'
);
check(
  'malformed attributes stay visible paragraph text',
  first('![Caption](a.png){#fig:a bare}\n').type,
  'paragraph'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('figures: all checks passed');
