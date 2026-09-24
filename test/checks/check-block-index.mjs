/**
 * Checks the index that holds where the blocks are: a prefix sum over each block's
 * length *plus the gap after it*, and another over its line span, kept across the
 * edits that change one block and rebuilt when an edit changes how many there are.
 *
 * The gap is the part a naive sum gets wrong: the blocks do not tile the document —
 * a blank line is a block of no characters, and the newlines between blocks belong to
 * no block — so a block's start is not the sum of the lengths before it.
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

// Four blocks: "abc", "defgh" over two lines, "ij", "klmn". Between them, one line
// ending, then a blank line and another line ending, then a line ending, then nothing.
const keys = [{}, {}, {}, {}];
const entries = [
  { key: keys[0], length: 3, span: 1, gap: 1 },
  { key: keys[1], length: 5, span: 2, gap: 2 },
  { key: keys[2], length: 2, span: 1, gap: 1 },
  { key: keys[3], length: 4, span: 1, gap: 0 }
];
const index = new BlockIndex(entries);
const starts = (tree) => entries.map((_, at) => tree.startAt(at));
const lines = (tree) => entries.map((_, at) => tree.lineAt(at));

check('it holds them all', index.size, 4);
check('the first block starts at zero', index.startAt(0), 0);
check('starts count each stride, gap included', starts(index), [0, 4, 11, 14]);
check('a block ends where its own text ends', index.endAt(1), 9);
check('asking past the end is the last block', index.endAt(99), 18);
check('lines count the same way, from one', lines(index), [1, 2, 4, 5]);
check('a two-line block ends on its second line', index.endLineAt(1), 3);
check('a block is asked about directly as well', [
  index.startOf(keys[2]),
  index.endOf(keys[2]),
  index.lineOf(keys[2]),
  index.endLineOf(keys[2])
], [11, 13, 4, 4]);

// An edit inside one block moves the ones after it and leaves the ones before it.
// The gap moves with the block: a paragraph that grows a blank line after it is a
// stride change like any other, and nothing is rewritten for it.
const longer = { length: 8, span: 2, gap: 2 };
index.place(1, {}, longer);
check('placing a longer block moves the ones after it', starts(index), [0, 4, 14, 17]);
check('and leaves the ones before it alone', lines(index), [1, 2, 4, 5]);
check('the placed block ends where it now says', index.endAt(1), 12);
check('the block that was replaced is forgotten', (() => {
  try {
    index.startOf(keys[1]);
    return 'answered';
  } catch {
    return 'refused';
  }
})(), 'refused');

const widened = { length: 8, span: 2, gap: 5 };
index.place(1, {}, widened);
check('a wider gap moves the tail too', starts(index), [0, 4, 17, 20]);

// A structural edit changes how many blocks there are: everything after it renumbers,
// which is the one thing no representation can avoid.
const spliced = [
  { key: keys[0], length: 3, span: 1, gap: 1 },
  { key: {}, length: 7, span: 3, gap: 0 },
  { key: {}, length: 1, span: 1, gap: 2 },
  { key: keys[3], length: 4, span: 1, gap: 0 }
];
for (const entry of spliced) {
  index.set(entry.key, entry);
}
index.rebuild(spliced.map((entry) => entry.key));
check('a rebuild renumbers the tail', spliced.map((_, at) => index.startAt(at)), [0, 4, 11, 14]);
check('and its line numbers', spliced.map((_, at) => index.lineAt(at)), [1, 2, 5, 6]);
check('and it holds the new count', index.size, 4);

for (const entry of entries) {
  index.set(entry.key, entry);
}
index.rebuild(keys);
check('a rebuild puts it back', starts(index), [0, 4, 11, 14]);
check('and a block that came back with it knows its place', index.endOf(keys[3]), 18);

// Placing past the end is a caller's mistake, not a growth: a list that grew is a
// rebuild, and the index says so by doing nothing.
const before = starts(index);
index.place(9, {}, { length: 2, span: 1, gap: 0 });
check('placing past the end does nothing', starts(index), before);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('block index: all checks passed');
