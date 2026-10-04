/**
 * Checks where a write inside a fenced block goes, in Node: the delimiter lines keep
 * their own lines, so a character typed at the *end* of the body lands at the end of
 * the body's own last line instead of on the closing delimiter's.
 *
 * A display formula is one of the three fenced blocks, and the spellings it is
 * written in are why its body's start is worth a case of its own. The rule is a pure
 * function of the block's text and the caret's offset, so it can be asserted without
 * a browser; `display-math-empty.js` and `code-edge-typing.js` prove the same through
 * the editor's key path.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/syntax/fence_edits.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-fence-edits-'));
const file = join(directory, 'fence_edits.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { fenceTypedWrite, fenceNewlineWrite } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// What the editor does: the rule when it names a write, the ordinary insert when
// it does not — which is how the two halves stay one behaviour.
const typed = (text, at, letter) =>
  fenceTypedWrite(text, at, letter) ?? { from: at, to: at, replacement: letter, caret: at + letter.length };
const entered = (text, at) => fenceNewlineWrite(text, at) ?? { from: at, to: at, replacement: '\n', caret: at + 1 };
const applied = (text, write) =>
  `${text.slice(0, write.from)}${write.replacement}${text.slice(write.to)}`;

// The other two fenced blocks: a delimiter that is a line rather than `$$`, the same rule.
const code = '```js\na\n```';
const closingFence = code.indexOf('\n```');
check(
  'a character typed at the end of a code body joins its last line',
  applied(code, typed(code, closingFence, 'Q')),
  '```js\naQ\n```'
);
check(
  'and does not land on the closing fence’s own line',
  applied(code, typed(code, closingFence, 'Q')).endsWith('Q```'),
  false
);
check(
  'the same in a frontmatter block',
  applied('---\ntitle: a\n---', typed('---\ntitle: a\n---', 13, 'Q')),
  '---\ntitle: aQ\n---'
);
check(
  'a body with no line yet takes a line of its own',
  applied('```js\n```', typed('```js\n```', 6, 'Q')),
  '```js\nQ\n```'
);

// A formula with no content gets a line of its own for the character.
const empty = '$$\n$$';
check(
  'a character typed at an empty formula’s content edge makes its own line',
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
  'and a formula with two blank lines keeps the other one',
  applied('$$\n\n\n$$', typed('$$\n\n\n$$', 3, 'Q')),
  '$$\nQ\n\n$$'
);
check(
  'a formula that is not closed yet needs no line made for it',
  applied('$$\n', typed('$$\n', 3, 'Q')),
  '$$\nQ'
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
  fenceNewlineWrite('$$\n\n$$', 3), null);
check('and the same at that formula’s content edge',
  fenceNewlineWrite('$$\n\n$$', 2), null);

// A formula that has content keeps it: an edge write joins the content's own
// first or last line instead of opening a new one.
const filled = '$$\n\\frac{a}{b}\n$$';
const closing = filled.lastIndexOf('$$');
check(
  'a character typed at a filled formula’s first content line joins it',
  applied(filled, typed(filled, 3, 'Q')),
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
  fenceTypedWrite(filled, filled.indexOf('a}{') + 1, 'Q'), null);
check('typing between the `$`s of the opening fence is the author’s own business',
  fenceTypedWrite(filled, 1, 'x'), null);
check('typing before the formula is not this rule’s',
  fenceTypedWrite(filled, 0, 'x'), null);
check('a paragraph of text is not a formula', fenceTypedWrite('Q\n$$', 0, 'x'), null);
check('Enter where the content already holds a line is the ordinary newline',
  fenceNewlineWrite(filled, closing), null);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('fence edits: all checks passed');
