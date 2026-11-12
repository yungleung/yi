/**
 * Checks the index that holds where the blocks are: two prefix sums, one over each
 * block's character stride and one over its line stride, kept across the edits that
 * change one block and rebuilt when an edit changes how many there are.
 *
 * A stride is the distance from a block's start to the next block's start, which is
 * more than the block's own size in both measures — the blocks neither tile the text
 * (a blank line is a block of no characters, and the newlines between blocks belong
 * to no block) nor tile the lines (a run of blank lines is fewer blocks than it has
 * lines). A naive sum of lengths gets both wrong, which is what the first two cases
 * here are for.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'src/ui/markdown/document/block/lookup.ts',
  logLevel: 'silent'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-block-index-'));
const file = join(directory, 'block_index.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { BlockIndex } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// Four blocks starting at 0, 4, 11 and 14 characters and at lines 1, 3, 5 and 6: the
// strides carry the blank lines between them, which no block holds.
const keys = [{}, {}, {}, {}];
const entries = [
  { key: keys[0], length: 3, span: 1, charStride: 4, lineStride: 2 },
  { key: keys[1], length: 5, span: 2, charStride: 7, lineStride: 2 },
  { key: keys[2], length: 2, span: 1, charStride: 3, lineStride: 1 },
  { key: keys[3], length: 4, span: 1, charStride: 0, lineStride: 0 }
];
const index = new BlockIndex(entries);
const starts = (tree) => entries.map((_, at) => tree.startAt(at));
const lines = (tree) => entries.map((_, at) => tree.lineAt(at));

check('it holds them all', index.size, 4);
check('the first block starts at zero', index.startAt(0), 0);
check('starts count strides, not lengths', starts(index), [0, 4, 11, 14]);
check('a block ends where its own text ends', index.endAt(1), 9);
check('asking past the end is the last block', index.endAt(99), 18);
check('lines count their own strides too', lines(index), [1, 3, 5, 6]);
check('a two-line block ends on its second line', index.endLineAt(1), 4);
check('a block is asked about directly as well', [
  index.startOf(keys[2]),
  index.endOf(keys[2]),
  index.lineOf(keys[2]),
  index.endLineOf(keys[2])
], [11, 13, 5, 5]);

// An edit inside one block moves the ones after it and leaves the ones before it.
const longer = { length: 8, span: 2, charStride: 10, lineStride: 3 };
index.place(1, {}, longer);
check('placing a longer block moves the ones after it', starts(index), [0, 4, 14, 17]);
check('and its lines', lines(index), [1, 3, 6, 7]);
check('the placed block ends where it now says', index.endAt(1), 12);
check('the block that was replaced is forgotten', (() => {
  try {
    index.startOf(keys[1]);
    return 'answered';
  } catch {
    return 'refused';
  }
})(), 'refused');

const wider = { length: 8, span: 2, charStride: 13, lineStride: 4 };
index.place(1, {}, wider);
check('a wider stride moves the tail too', starts(index), [0, 4, 17, 20]);
check('and its line numbers', lines(index), [1, 3, 7, 8]);

// A structural edit changes how many blocks there are: everything after it renumbers,
// which is the one thing no representation can avoid.
const spliced = [
  { key: keys[0], length: 3, span: 1, charStride: 4, lineStride: 2 },
  { key: {}, length: 7, span: 3, charStride: 8, lineStride: 3 },
  { key: {}, length: 1, span: 1, charStride: 3, lineStride: 2 },
  { key: keys[3], length: 4, span: 1, charStride: 0, lineStride: 0 }
];
for (const entry of spliced) {
  index.set(entry.key, entry);
}
index.rebuild(spliced.map((entry) => entry.key));
check('a rebuild renumbers the tail', spliced.map((_, at) => index.startAt(at)), [0, 4, 12, 15]);
check('and its line numbers', spliced.map((_, at) => index.lineAt(at)), [1, 3, 6, 8]);
check('and it holds the new count', index.size, 4);

for (const entry of entries) {
  index.set(entry.key, entry);
}
index.rebuild(keys);
check('a rebuild puts it back', starts(index), [0, 4, 11, 14]);
check('and a block that came back with it knows its place', index.endOf(keys[3]), 18);
check('a block the rebuild dropped is refused', (() => {
  try {
    index.startOf(spliced[1].key);
    return 'answered';
  } catch {
    return 'refused';
  }
})(), 'refused');

// Placing past the end is a caller's mistake, not a growth: a list that grew is a
// rebuild, and the index says so by doing nothing.
const before = starts(index);
index.place(9, {}, { length: 2, span: 1, charStride: 2, lineStride: 1 });
check('placing past the end does nothing', starts(index), before);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('block index: all checks passed');
