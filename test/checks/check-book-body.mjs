/**
 * The text a book is handed (`ui/export/book_body.ts`): the note's own level-1 heading, with the
 * note's name standing in it when the note writes none.
 *
 * The rule is short and every case of it is a shape a note really has: the note's heading where it
 * belongs (frontmatter stays first), a `##` section at the very top of a note whose title is its
 * frontmatter `title:`, a body that is prose alone, an empty `#` (which markdown reads as an empty
 * heading, so the note has one), and a name that is markdown itself. The book one of these texts
 * makes is what `check-epub-valid.mjs` asks epubcheck about; this is the rule on its own, which is
 * what says *where* the name goes and what it says when a note already says it.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-book-body-'));
const bundle = await rolldown({
  input: 'src/ui/export/book_body.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'book_body.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { bodyWithItsName, opensWithItsOwnHeading } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// What counts as the note's own level-1 heading, and what does not: the `##` case is the one this
// rule exists for, and the three-space case is pandoc's own reading (measured: it is a paragraph).
check('a body opening with `# A` has its own heading', opensWithItsOwnHeading('# A\n\ntext\n'), true);
check('and so does a body whose first line is a bare `#`', opensWithItsOwnHeading('#\n\ntext\n'), true);
check('blank lines in front do not hide it', opensWithItsOwnHeading('\n\n# A\n\ntext\n'), true);
check('a frontmatter block does not hide it either', opensWithItsOwnHeading('---\ntitle: X\n---\n# A\n\ntext\n'), true);
check('a `##` section is not the note’s own title', opensWithItsOwnHeading('## A\n\ntext\n'), false);
check('`#foo` is prose', opensWithItsOwnHeading('#foo\n\ntext\n'), false);
check('and an indented `#` is prose too, as pandoc reads it', opensWithItsOwnHeading('   # A\n\ntext\n'), false);
check('a note whose body is prose alone has none', opensWithItsOwnHeading('A paragraph.\n'), false);
check('nor has one with no body at all', opensWithItsOwnHeading('---\ntitle: X\n---\n'), false);

check(
  'a note that opens with its own heading is handed back untouched',
  bodyWithItsName('# Going out\n\nSome text.\n', 'Going out'),
  '# Going out\n\nSome text.\n'
);
check(
  'and a note whose title is its frontmatter gets the name under the frontmatter',
  bodyWithItsName('---\ntitle: Going out\n---\n\n## Going out\n\nSome text.\n', 'Going out'),
  '---\ntitle: Going out\n---\n# Going out\n\n## Going out\n\nSome text.\n'
);
check(
  'a `##` at the top of the body is the case the name stands above',
  bodyWithItsName('## Going out\n\nSome text.\n', 'Going out'),
  '# Going out\n\n## Going out\n\nSome text.\n'
);
check(
  'a body of prose alone gets the same',
  bodyWithItsName('Just a paragraph.\n', 'Going out'),
  '# Going out\n\nJust a paragraph.\n'
);
check(
  'the name is written as the note writes it — a name taken from a heading is that line',
  bodyWithItsName('## text\n\nSome text.\n', 'A *name* in [brackets]'),
  '# A *name* in [brackets]\n\n## text\n\nSome text.\n'
);
check(
  'a line break in a name cannot become a line of the note',
  bodyWithItsName('Some text.\n', 'A name\nsplit in two'),
  '# A name split in two\n\nSome text.\n'
);
check('no name is nothing written', bodyWithItsName('Some text.\n', null), 'Some text.\n');
check('and a name of nothing but spaces is the same', bodyWithItsName('Some text.\n', '  \n '), 'Some text.\n');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('book body: all checks passed');
