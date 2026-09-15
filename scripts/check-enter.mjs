/**
 * Checks the line-editing rules in Node: what `Enter` inserts at the end of a
 * block and how typing on an empty paragraph materialises. The rules are pure
 * functions of the raw text, so they can be asserted without a browser; the
 * app probes cover what the rendered result looks like.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

// The editing modules import the caret layer, which touches the DOM at import
// time; the rules under test never do.
globalThis.document = {
  addEventListener() {},
  createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }),
  querySelectorAll: () => [],
  querySelector: () => null,
  createRange: () => ({})
};
globalThis.window = {
  getSelection: () => null,
  addEventListener() {},
  // The editing modules pull in the bibliography manager through the caret
  // layer; it only needs these to exist at import time.
  __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    invoke: async () => null
  }
};

const bundle = await rolldown({
  input: 'src/ui/markdown/editing/blank_lines.ts',
  logLevel: 'silent'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-enter-'));
const file = join(directory, 'blank_lines.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { paragraphSplit, emptyLineInsertion, characterRemoval, itemContinuation } = await import(file);

/** Applies an insertion the way the commands do, and reports the result. */
const insert = (text, offset, inserted) => `${text.slice(0, offset)}${inserted}${text.slice(offset)}`;

const cases = [
  ['a paragraph break needs two newlines', paragraphSplit('alpha beta\n', 5).insert, '\n\n'],
  ['a break reuses a newline that is already there', paragraphSplit('a\nb', 1).insert, '\n'],
  [
    'a break before a line counts the newline in front of it',
    paragraphSplit('a\nb', 2).insert,
    '\n'
  ],
  [
    'a break that is already there inserts nothing',
    paragraphSplit('a\n\nb', 3).insert,
    ''
  ],
  ['typing between blocks takes a newline with it', emptyLineInsertion('a\n\n\nb', 3, 'x'), 'x\n'],
  ['typing at the end of the file does not', emptyLineInsertion('a\n\n', 2, 'x'), 'x'],
  ['typing on a leading empty line takes a newline', emptyLineInsertion('\na', 0, 'x'), 'x\n']
];

let failures = 0;
const check = (name, actual, expected) => {
  if (actual === expected) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
};

for (const [name, actual, expected] of cases) {
  check(name, actual, expected);
}

// Enter at the end of a paragraph: one newline, which is what turns the run
// after the block into one that carries an empty paragraph.
const paragraphEnd = insert('first line\n\nsecond line\n', 10, '\n');
check(
  'Enter at the end of a middle paragraph adds exactly one newline',
  paragraphEnd,
  'first line\n\n\nsecond line\n'
);
check(
  'typing on the new empty line keeps the next paragraph apart',
  insert(paragraphEnd, 12, emptyLineInsertion(paragraphEnd, 12, 'x')),
  'first line\n\nx\n\nsecond line\n'
);

// A blank list item: the marker goes and an empty paragraph takes its place.
const listItem = 'a\n- \nb';
const cleared = `${listItem.slice(0, 2)}${listItem.slice(4)}`;
check(
  'clearing a blank item leaves an empty line between the two blocks',
  insert(cleared, 2, '\n'),
  'a\n\n\nb'
);

// Deleting the character typed on an empty line takes the materialised
// newline back with it.
const typed = 'a\n\nx\n\nb\n';
const removal = characterRemoval(typed, 3, 4);
check(
  'deleting the last character of a materialised paragraph also drops its line',
  `${typed.slice(0, removal.from)}${typed.slice(removal.to)}`,
  'a\n\n\nb\n'
);
check(
  'a plain character delete is left alone',
  JSON.stringify(characterRemoval('hello', 2, 3)),
  JSON.stringify({ from: 2, to: 3 })
);

// Enter inside a list item starts a sibling item of the same kind.
check('a bullet item continues with a bullet', JSON.stringify(itemContinuation('- item')), JSON.stringify('\n- '));
check(
  'an indented ordered item keeps its marker and indentation',
  JSON.stringify(itemContinuation('  2. two')),
  JSON.stringify('\n  2. ')
);
check(
  'a task item continues unchecked',
  JSON.stringify(itemContinuation('- [x] done')),
  JSON.stringify('\n- [ ] ')
);
check('a blank item does not continue the list', JSON.stringify(itemContinuation('- ')), 'null');
check('plain text does not continue a list', JSON.stringify(itemContinuation('text')), 'null');

console.log(failures === 0 ? 'all line rules hold' : `${failures} rule(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
