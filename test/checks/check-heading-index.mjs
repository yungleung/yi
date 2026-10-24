/**
 * Checks Pandoc heading identifiers and the document target index.
 *
 * The index is what a same-document fragment resolves through, so it must keep
 * document order, include explicit identifiers, and use Pandoc's duplicate
 * naming without rewriting explicit duplicates.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-heading-index-'));
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return await import(file);
};
const { pandocHeadingId } = await load(
  'src/ui/markdown/syntax/pandoc_identifiers.ts',
  'pandoc_identifiers'
);
const { firstHeadingTarget, headingIndex } = await load(
  'src/ui/markdown/document/heading_index.ts',
  'heading_index'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check('spaces become hyphens', pandocHeadingId('A Heading!'), 'a-heading');
check('underscore, hyphen, and period remain', pandocHeadingId('A_B.C!'), 'a_b.c');
check('text before the first letter is removed', pandocHeadingId('123 start'), 'start');
check('Unicode lowercase is preserved', pandocHeadingId('中文 Heading'), '中文-heading');
check('punctuation alone falls back', pandocHeadingId('—'), 'section');

const targets = headingIndex(
  '# Same\n\n' +
    '# Same\n\n' +
    '# Custom {#same}\n\n' +
    'Title {#setext .unnumbered}\n=====\n\n' +
    '# Same\n'
);
check(
  'automatic duplicates use Pandoc suffixes and explicit IDs stay literal',
  targets.map((target) => target.id),
  ['same', 'same-1', 'same', 'setext', 'same-2']
);
check(
  'an explicit ID is marked explicit',
  targets.map((target) => target.explicit),
  [false, false, true, true, false]
);
check(
  'a fragment finds the first matching target',
  firstHeadingTarget(targets, 'same')?.from,
  targets[0].from
);
check(
  'inserting a duplicate above recalculates IDs in document order',
  headingIndex('# Same\n\n# New\n\n# Same\n').map((target) => target.id),
  ['same', 'new', 'same-1']
);
check(
  'a setext title excludes its attributes',
  targets[3].title,
  'Title'
);
check(
  'all targets use document offsets',
  targets.map((target) => [target.from, target.to]),
  [
    [0, 6],
    [8, 14],
    [16, 32],
    [34, 67],
    [69, 75]
  ]
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('heading index: all checks passed');
