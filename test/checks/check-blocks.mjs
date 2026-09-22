/**
 * Checks the block-slicing rules in Node, where a probe inside the app cannot
 * reach (the MCP bridge gives up after a few seconds and several document
 * swaps do not fit). It bundles the real `blocks.ts` and asserts the shapes
 * the plan's Task 2 requires:
 *
 * - one blank line between two blocks is a separator: no block;
 * - every further blank line becomes a `blank` block (an empty paragraph);
 * - leading and trailing runs carry no separator, so every blank line there is
 *   an empty paragraph, except the newline that only terminates the last line;
 * - a run that carries an empty paragraph ends a loose list.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/document/blocks.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-blocks-'));
const file = join(directory, 'blocks.mjs');
writeFileSync(file, output[0].code);
const { splitBlocks, splitBlocksFrom } = await import(file);

/** A compact shape of the sliced document: `kind@line` per block. */
const shape = (text) =>
  splitBlocks(text)
    .map((block) => `${block.kind}@${block.lineStart}`)
    .join(' ');

const cases = [
  ['one blank line is a separator', 'a\n\nb', 'paragraph@1 paragraph@3'],
  ['two blank lines add an empty paragraph', 'a\n\n\nb', 'paragraph@1 blank@3 paragraph@4'],
  [
    'three blank lines add two empty paragraphs',
    'a\n\n\n\nb',
    'paragraph@1 blank@3 blank@4 paragraph@5'
  ],
  ['a trailing blank line is an empty paragraph', 'a\n\n', 'paragraph@1 blank@2'],
  ['a single trailing newline is not a line', 'a\n', 'paragraph@1'],
  ['a leading run carries no separator', '\n\na', 'blank@1 blank@2 paragraph@3'],
  ['a normal loose list stays one block', '- a\n\n- b', 'paragraph@1'],
  [
    'a run with an empty paragraph ends the list',
    '- a\n\n\n- b',
    'paragraph@1 blank@3 paragraph@4'
  ]
];

let failures = 0;
for (const [name, markdown, expected] of cases) {
  const actual = shape(markdown);
  if (actual === expected) {
    console.log(`ok   ${name}`);
    continue;
  }
  failures += 1;
  console.log(`FAIL ${name}\n     expected: ${expected}\n     actual:   ${actual}`);
}

// The re-split an edit costs: `splitBlocksFrom` has to equal `splitBlocks`, in
// every field, after every edit — same kinds, same line and character ranges,
// same order. A resynchronisation that is off by a block, or by the edit's own
// delta, is a caret in the wrong place, so this compares everything rather than
// the shape alone.
const described = (blocks) =>
  blocks
    .map(
      (block) =>
        `${block.kind}@${block.lineStart}-${block.lineEnd} [${block.charStart},${block.charEnd}) ${JSON.stringify(block.text)}`
    )
    .join('\n');

/**
 * Applies a sequence of edits to `markdown`, re-splitting after each one the
 * way the editor does — from the blocks the previous edit left — and comparing
 * that against a full split of the same text.
 */
const reSplit = (name, markdown, edits) => {
  let text = markdown;
  let previous = splitBlocks(text);
  for (const [from, to, inserted] of edits) {
    const edit = { from, to, removed: text.slice(from, to), inserted };
    text = `${text.slice(0, from)}${inserted}${text.slice(to)}`;
    const incremental = splitBlocksFrom(text, previous, edit);
    const full = splitBlocks(text);
    if (described(incremental) === described(full)) {
      previous = incremental;
      continue;
    }
    failures += 1;
    console.log(
      `FAIL ${name}: after ${JSON.stringify([from, to, inserted])}\n` +
        `     expected:\n${described(full)}\n     actual:\n${described(incremental)}`
    );
    previous = full;
  }
  if (failures === 0) {
    console.log(`ok   ${name}`);
  }
};

// The store's own edit sequence (test/checks/check-text-store.mjs), which walks
// a document through insertions, deletions, unicode and whole-paragraph pastes.
reSplit('a sequence of edits re-splits to the same blocks', '', [
  [0, 0, 'hello'],
  [5, 5, '\n\nworld'],
  [2, 4, 'X'],
  [0, 1, ''],
  [0, 0, 'start '],
  [12, 12, '\n\nmore paragraphs\n\nand one more'],
  [3, 9, ''],
  [0, 0, 'Ünïcöde — with an em dash and 汉字']
]);

// The edits that make resynchronisation hard: the ones that move a boundary.
const note = '# Title\n\npara one\n\npara two\n\n- a\n- b\n\n> quote\n';
reSplit('an edit above the list', note, [[6, 9, 'paragraph']]);
reSplit('an edit that joins two blocks', note, [[9, 13, '\n']]);
reSplit('an edit that splits one block', note, [[12, 12, '\n\n']]);
reSplit('an edit that opens a fence', note, [[0, 0, '```\n']]);
reSplit('an edit that closes a fence', note, [[0, 0, '```\n']].concat([[note.length + 4, note.length + 4, '```\n']]));
reSplit('an edit inside a fence', 'para\n\n```js\nlet x = 1;\n```\n\nend\n', [[16, 16, ' // note']]);
reSplit('an edit that opens a definition list', 'term\n\nrest\n', [[7, 7, ': detail\n']]);
reSplit('an edit that changes a table', 'para\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nend\n', [
  [31, 31, '\n| 3 | 4 |']
]);
reSplit('typing at the end of a paragraph', 'a\n\nb\n', [[1, 1, 'x'], [2, 2, 'y'], [3, 3, 'z']]);
reSplit('typing on a blank line', 'a\n\n\nb\n', [[2, 2, 'x'], [2, 3, ''], [2, 2, '#']]);
reSplit('deleting a line ending', 'a\n\nb\n', [[2, 3, '']]);
reSplit('editing the frontmatter', '---\ntitle: x\n---\n\nbody\n', [[13, 13, '!']]);
reSplit('editing the last line of a document with no line ending', 'a\n\nb', [[4, 4, 'c'], [5, 5, '\n']]);

// A deterministic walk through a document with the constructs that span lines,
// so the boundaries move in combinations a hand-written list would miss.
let seed = 20260922;
const nextRandom = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const alphabet = ['a', 'b', ' ', '\n', '#', '`', '-', '|', '\t', ':'];
const randomEdits = [];
let length = 0;
for (let step = 0; step < 200; step += 1) {
  const from = Math.floor(nextRandom() * (length + 1));
  const to = Math.min(length, from + Math.floor(nextRandom() * 4));
  let inserted = '';
  const size = Math.floor(nextRandom() * 6);
  for (let index = 0; index < size; index += 1) {
    inserted += alphabet[Math.floor(nextRandom() * alphabet.length)];
  }
  randomEdits.push([from, to, inserted]);
  length += inserted.length - (to - from);
}
reSplit(
  'two hundred pseudo-random edits',
  '# Title\n\ntext\n\n```js\nconst x = 1;\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- one\n- two\n\n[^1]: note\n',
  randomEdits
);

// The blocks an edit did not reach are the blocks it had, not copies of them:
// the renderer keys by content, and a copy is a rebuild of the element.
const before = splitBlocks('a\n\nb\n\nc\n');
const reworded = splitBlocksFrom('A\n\nb\n\nc\n', before, { from: 0, to: 1, removed: 'a', inserted: 'A' });
const grown = splitBlocksFrom('aX\n\nb\n\nc\n', before, { from: 1, to: 1, removed: '', inserted: 'X' });
const reuse = [
  reworded.length === 3 && reworded[1] === before[1] && reworded[2] === before[2],
  reworded[0].text === 'A',
  grown[0].text === 'aX',
  grown[1].text === 'b' && grown[1].lineStart === 3 && grown[1].charStart === before[1].charStart + 1,
  grown[2].lineStart === 5 && grown[2].charStart === before[2].charStart + 1
];
if (reuse.every(Boolean)) {
  console.log('ok   an edit above keeps the blocks below');
} else {
  failures += 1;
  console.log(`FAIL an edit above keeps the blocks below\n     ${JSON.stringify(reuse)}`);
}

console.log(failures === 0 ? 'all block rules hold' : `${failures} rule(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
