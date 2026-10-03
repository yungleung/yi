/**
 * Checks where a write inside a display formula goes, in Node: the `$$` fences
 * keep their own lines, so a character typed at either edge of the content lands
 * in the content instead of on a fence.
 *
 * The rule is a pure function of the formula's text and the caret's offset, so it
 * can be asserted without a browser; `display-math-empty.js` proves the same
 * through the editor's key path.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/syntax/math_edits.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-math-edits-'));
const file = join(directory, 'math_edits.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { mathTypedWrite, mathNewlineWrite } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// What the editor does: the rule when it names a write, the ordinary insert when
// it does not — which is how the two halves stay one behaviour.
const typed = (text, at, letter) =>
  mathTypedWrite(text, at, letter) ?? { from: at, to: at, replacement: letter, caret: at + letter.length };
const entered = (text, at) => mathNewlineWrite(text, at) ?? { from: at, to: at, replacement: '\n', caret: at + 1 };
const applied = (text, write) =>
  `${text.slice(0, write.from)}${write.replacement}${text.slice(write.to)}`;

// A formula with no content gets a line of its own for the character, whichever
// edge of its empty content the caret sits at.
const empty = '$$\n$$';
check(
  'a character typed after the opening `$$` of an empty formula makes its own line',
  applied(empty, typed(empty, 2, 'Q')),
  '$$\nQ\n$$'
);
check(
  'and so does one typed before the closing `$$`',
  applied(empty, typed(empty, 3, 'Q')),
  '$$\nQ\n$$'
);
check(
  'the caret lands after the character, inside the content line',
  typed(empty, 3, 'Q').caret,
  '$$\nQ'.length
);
check(
  'a formula written on one line takes the character between the fences',
  applied('$$$$', typed('$$$$', 2, 'Q')),
  '$$\nQ\n$$'
);
check(
  'a blank line already inside the formula takes the character where it is',
  applied('$$\n\n$$', typed('$$\n\n$$', 3, 'Q')),
  '$$\nQ\n$$'
);
check(
  'typing at that formula’s content edge takes its first line',
  applied('$$\n\n$$', typed('$$\n\n$$', 2, 'Q')),
  '$$\nQ\n$$'
);
check(
  'and a formula with two blank lines keeps the other one',
  applied('$$\n\n\n$$', typed('$$\n\n\n$$', 2, 'Q')),
  '$$\nQ\n\n$$'
);
check(
  'a formula that is not closed yet puts the line after the opening `$$`',
  applied('$$\n', typed('$$\n', 2, 'Q')),
  '$$\nQ\n'
);

// `Enter` in a formula with no content makes the blank content line, rather than
// splitting the fences onto two lines with the caret between them.
check('Enter in a one-line empty formula leaves a blank content line',
  applied('$$$$', entered('$$$$', 2)),
  '$$\n\n$$');
check('Enter in an empty formula written over two lines does the same',
  applied(empty, entered(empty, 2)),
  '$$\n\n$$');
check('Enter before the closing `$$` does the same as after the opening one',
  applied(empty, entered(empty, 3)),
  '$$\n\n$$');
check('and the caret sits on the line it made', entered(empty, 2).caret, '$$\n'.length);
check('Enter where a content line already exists is the ordinary newline',
  mathNewlineWrite('$$\n\n$$', 3), null);
check('and the same at that formula’s content edge',
  mathNewlineWrite('$$\n\n$$', 2), null);

// A formula that has content keeps it: an edge write joins the content's own
// first or last line instead of opening a new one.
const filled = '$$\n\\frac{a}{b}\n$$';
const closing = filled.lastIndexOf('$$');
check(
  'a character typed after the opening `$$` of a filled formula joins its first line',
  applied(filled, typed(filled, 2, 'Q')),
  '$$\nQ\\frac{a}{b}\n$$'
);
check(
  'one typed before the closing `$$` joins its last line',
  applied(filled, typed(filled, closing, 'Q')),
  '$$\n\\frac{a}{b}Q\n$$'
);
check(
  'and the new character is what the caret follows',
  typed(filled, closing, 'Q').caret,
  filled.indexOf('\\frac') + '\\frac{a}{b}Q'.length
);

// The author's own text is left where they put it.
check('typing in the middle of the content is an ordinary insert',
  mathTypedWrite(filled, filled.indexOf('a}{') + 1, 'Q'), null);
check('typing between the `$`s of the opening fence is the author’s own business',
  mathTypedWrite(filled, 1, 'x'), null);
check('typing before the formula is not this rule’s',
  mathTypedWrite(filled, 0, 'x'), null);
check('a paragraph of text is not a formula', mathTypedWrite('Q\n$$', 0, 'x'), null);
check('Enter where the content already holds a line is the ordinary newline',
  mathNewlineWrite(filled, closing), null);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('math edits: all checks passed');
