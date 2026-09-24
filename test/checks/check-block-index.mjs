/**
 * Checks the index that holds where the blocks are: a prefix sum over their own
 * lengths and line spans, kept across the edits that change one block, and rebuilt
 * when an edit changes how many blocks there are.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/document/block_index.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-block-index-'));
const file = join(directory, 'block_index.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { BlockIndex } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const blocks = ['abc', 'defgh', 'ij', 'klmn'].map((text, at) => ({ text, span: at === 1 ? 2 : 1 }));
const index = new BlockIndex(blocks);
const starts = (tree) => blocks.map((_, at) => tree.startAt(at));
const lines = (tree) => blocks.map((_, at) => tree.lineAt(at));

check('it holds them all', index.size, 4);
check('the first block starts at zero', index.startAt(0), 0);
check('a block starts where the ones before it end', starts(index), [0, 3, 8, 10]);
check('a block ends where the next one starts', index.endAt(2), 10);
check('the last block ends at the document length', index.endAt(3), 14);
check('asking past the end is the document length', index.endAt(99), 14);
check('lines count the same way, from one', lines(index), [1, 2, 4, 5]);
check('a block is asked about directly as well', index.startOf(blocks[2]), 8);
check('and knows its end and its line', [index.endOf(blocks[1]), index.lineOf(blocks[1])], [8, 2]);

// An edit inside one block moves the blocks after it and leaves the ones before it:
// nothing is rewritten, which is the whole point of the tree.
const longer = { text: 'defghxyz', span: 2 };
index.place(1, longer);
check('placing a longer block moves the ones after it', starts(index), [0, 3, 11, 13]);
check('and leaves the ones before it alone', lines(index), [1, 2, 4, 5]);
check('the placed block ends where it now says', index.endOf(longer), 11);
check('the block it replaced is forgotten', (() => {
  try {
    index.startOf(blocks[1]);
    return 'answered';
  } catch {
    return 'refused';
  }
})(), 'refused');

// A structural edit changes how many blocks there are: everything after it renumbers.
const spliced = [blocks[0], longer, { text: 'abcdefg', span: 3 }, { text: 'h', span: 1 }, blocks[3]];
index.rebuild(spliced);
check('a rebuild renumbers the tail', spliced.map((_, at) => index.startAt(at)), [0, 3, 11, 18, 19]);
check('and its line numbers', spliced.map((_, at) => index.lineAt(at)), [1, 2, 4, 7, 8]);
check('and it holds the new count', index.size, 5);

index.rebuild(blocks);
check('a rebuild puts it back', starts(index), [0, 3, 8, 10]);
check('and a block that came back with it knows its place', index.endOf(blocks[3]), 14);

// Placing past the end is the caller's mistake, not a growth: a list that grew is a
// rebuild, and the index says so by doing nothing.
const before = starts(index);
index.place(9, { text: 'zz', span: 1 });
check('placing past the end does nothing', starts(index), before);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('block index: all checks passed');
