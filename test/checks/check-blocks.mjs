/**
 * Checks the block-slicing rules in Node, where a probe inside the app cannot
 * reach (the MCP bridge gives up after a few seconds and several document
 * swaps do not fit). It bundles the real block model and asserts the shapes
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
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'src/ui/markdown/document/block/model.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-blocks-'));
const file = join(directory, 'blocks.mjs');
writeFileSync(file, output[0].code);
const { splitBlocks, splitBlocksFrom } = await import(pathToFileURL(file).href);

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
  ],
  // A construct whose *own text* is the shape the app shows while the caret is inside it — a
  // fence, a display formula (`kinds.ts: hasSourceMode`) — begins where markdown says it
  // begins, even when it interrupts a paragraph. markdown reads both as blocks
  // (`text\n```\ncode\n``` ` is a paragraph, a code block, a paragraph), and a formula folded into a
  // paragraph has no shape in which its source can be shown at all: measured, a click on one
  // entered the paragraph's text and no source view appeared.
  ['a fence that interrupts a paragraph is a block of its own', 'text\n```\ncode\n```\nafter\n', 'paragraph@1 fencedCode@2 paragraph@5'],
  ['and its language is kept', 'text\n```js\nlet x = 1;\n```\nafter\n', 'paragraph@1 fencedCode@2 paragraph@5'],
  ['display math that interrupts one too', 'text\n$$\nx\n$$\nafter\n', 'paragraph@1 displayMath@2 paragraph@5'],
  [
    'labeled display math',
    '[$$\nx\n$$]{#eq:x}\n',
    'equation@1'
  ],
  [
    'labeled display math interrupts a paragraph',
    'text\n[$$\nx\n$$]{#eq:x}\nafter\n',
    'paragraph@1 equation@2 paragraph@5'
  ],
  ['two formulas under one paragraph are two blocks', 'a\n$$\nx\n$$\n$$\ny\n$$\nb\n', 'paragraph@1 displayMath@2 displayMath@5 paragraph@8'],
  // The same two with the blank lines markdown's own reading does not need: unchanged.
  ['a fence with blank lines around it is what it was', 'text\n\n```\ncode\n```\n\nafter\n', 'paragraph@1 fencedCode@3 paragraph@7'],
  ['and so is display math', 'text\n\n$$\nx\n$$\n\nafter\n', 'paragraph@1 displayMath@3 paragraph@7'],
  [
    'a generic fenced Div is one block across blank body lines',
    '::: {.columns}\nLeft\n\nRight\n:::\n\nafter\n',
    'fencedDiv@1 paragraph@7'
  ],
  [
    'a named Pandoc Div is the same block',
    '::: notes\nSpeaker note\n:::\n\nafter\n',
    'fencedDiv@1 paragraph@5'
  ],
  [
    'nested generic fenced Divs stay one outer block',
    ':::: {.columns}\n::: {.column width="40%"}\nLeft\n:::\n::: {.column}\nRight\n:::\n::::\n\nafter\n',
    'fencedDiv@1 paragraph@10'
  ],
  [
    'a generic Div ends at its outer fence and leaves the next fence its own block',
    ':::: {.incremental}\n::: {.nonincremental}\n- First\n- Second\n:::\n::::\n\n```python\nprint(1)\n```\n',
    'fencedDiv@1 fencedCode@8'
  ],
  // The frontmatter is YAML, and YAML ends a document with `---` or `...`.
  ['frontmatter closed by ---', '---\na: b\n---\n\nbody\n', 'frontmatter@1 paragraph@5'],
  ['and one closed by ...', '---\na: b\n...\n\nbody\n', 'frontmatter@1 paragraph@5'],
  ['the first closing marker ends it', '---\na: b\n---\n\nbody\n...\n', 'frontmatter@1 paragraph@5'],
  ['+++ is not a frontmatter fence', '+++\na = 1\n+++\n\nbody\n', 'paragraph@1 paragraph@5'],
  ['a direct table caption stays in the table block', '| A |\n| --- |\n| 1 |\n: Caption\n', 'paragraph@1'],
  [
    'one blank line keeps its caption in the table block',
    '| A |\n| --- |\n| 1 |\n\n: Caption\n',
    'paragraph@1'
  ],
  [
    'two blank lines leave a caption as ordinary following source',
    '| A |\n| --- |\n| 1 |\n\n\n: Caption\n',
    'paragraph@1 blank@5 paragraph@6'
  ],
  [
    'a direct list caption stays in the list block',
    '- one\n- two\n: Steps {#list:steps}\n',
    'paragraph@1'
  ],
  [
    'one blank line keeps a list caption in the list block',
    '- one\n- two\n\n: Steps {#list:steps}\n',
    'paragraph@1'
  ],
  [
    'two blank lines leave a list caption as ordinary following source',
    '- one\n- two\n\n\n: Steps {#list:steps}\n',
    'paragraph@1 blank@4 paragraph@5'
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
reSplit('editing frontmatter closed by ...', '---\ntitle: x\n...\n\nbody\n', [[13, 13, '!']]);
reSplit('editing the last line of a document with no line ending', 'a\n\nb', [[4, 4, 'c'], [5, 5, '\n']]);

const nestedCallout = splitBlocks(
  '> > [!NOTE]\n> > first\n> >\n> > second\n\nAfter\n'
);
const nestedShape = nestedCallout
  .slice(0, 2)
  .map((block) => [block.kind, block.lineStart, block.lineEnd]);
if (JSON.stringify(nestedShape) === JSON.stringify([
  ['quote', 1, 4],
  ['paragraph', 6, 6]
])) {
  console.log('ok   a nested callout is one quote block');
} else {
  failures += 1;
  console.log(`FAIL a nested callout is one quote block\n     ${JSON.stringify(nestedShape)}`);
}

const div = splitBlocks(
  '::: {.callout .callout-note}\nFirst\n\nSecond\n:::\n'
);
const divShape = div.map((block) => [block.kind, block.lineStart, block.lineEnd]);
if (JSON.stringify(divShape) === JSON.stringify([['fencedDiv', 1, 5]])) {
  console.log('ok   a fenced-Div callout keeps its blank body lines');
} else {
  failures += 1;
  console.log(`FAIL a fenced-Div callout keeps its blank body lines\n     ${JSON.stringify(divShape)}`);
}

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

// The blocks an edit did not reach are the blocks it had, not copies of them: the
// renderer keys by content, a copy is a rebuild of the element, and their positions
// are derived from the index — so an edit that moves them moves them without
// touching them. (Each case starts from its own split: an edit that lands in a block
// replaces it, and a replaced block is not the document's any more.)
const before = splitBlocks('a\n\nb\n\nc\n');
const reworded = splitBlocksFrom('A\n\nb\n\nc\n', before, { from: 0, to: 1, removed: 'a', inserted: 'A' });
const growFrom = splitBlocks('a\n\nb\n\nc\n');
const grown = splitBlocksFrom('aX\n\nb\n\nc\n', growFrom, { from: 1, to: 1, removed: '', inserted: 'X' });
const segments = (blocks) =>
  blocks.map(
    (block) => `${block.kind}@${block.lineStart}-${block.lineEnd}[${block.charStart},${block.charEnd})`
  );
const reuse = [
  reworded.length === 3 && reworded[1] === before[1] && reworded[2] === before[2],
  reworded[0].text === 'A',
  grown[0].text === 'aX',
  grown[1] === growFrom[1] && grown[2] === growFrom[2],
  // Where they are is a full split's answer: a moved block's own fields show where it
  // is now, so comparing them to their old values would ask it where it used to be.
  JSON.stringify(segments(grown)) === JSON.stringify(segments(splitBlocks('aX\n\nb\n\nc\n')))
];
// A block's positions are own properties, so a copy carries them: the renderer
// spreads one into the DOM factory, and a prototype getter would not survive that.
const copied = { ...reworded[0] };
reuse.push(
  copied.lineStart === reworded[0].lineStart &&
    copied.charEnd === reworded[0].charEnd &&
    copied.text === reworded[0].text
);
if (reuse.every(Boolean)) {
  console.log('ok   an edit above keeps the blocks below');
} else {
  failures += 1;
  console.log(`FAIL an edit above keeps the blocks below\n     ${JSON.stringify(reuse)}`);
}

console.log(failures === 0 ? 'all block rules hold' : `${failures} rule(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
