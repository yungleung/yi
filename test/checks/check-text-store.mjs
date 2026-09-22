/**
 * Checks the text store against a plain string, because that is the only
 * statement about it that can be made exhaustively: after any sequence of edits
 * the store must hold exactly what a string held, and reading a range must agree
 * with that string.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/document/text_store.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-text-store-'));
const file = join(directory, 'text_store.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { TextStore } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const store = new TextStore();
let reference = '';
const edits = [
  [0, 0, 'hello'],
  [5, 5, '\n\nworld'],
  [2, 4, 'X'],
  [0, 1, ''],
  [0, 0, 'start '],
  [12, 12, '\n\nmore paragraphs\n\nand one more'],
  [3, 9, ''],
  [0, 0, 'Ünïcöde — with an em dash and 汉字']
];
for (const [from, to, text] of edits) {
  store.replace(from, to, text);
  reference = reference.slice(0, from) + text + reference.slice(to);
  check(`the store is the string after ${JSON.stringify([from, to, text])}`, store.toString(), reference);
}

check('a range read agrees with the string', store.slice(4, 30), reference.slice(4, 30));
check('a range read at the very end', store.slice(reference.length - 3, reference.length), reference.slice(-3));
check('an empty range reads empty', store.slice(5, 5), '');
check('a range beyond the end is clamped', store.slice(reference.length - 2, reference.length + 99), reference.slice(-2));

const trailing = new TextStore('abc');
trailing.replace(99, 120, '!');
check('an edit past the end is clamped like the string', trailing.toString(), 'abc!');
trailing.replace(1, 99, '');
check('an edit that runs past the end truncates', trailing.toString(), 'a');

const typing = new TextStore('a paragraph that already exists');
for (let index = 0; index < 50; index += 1) {
  typing.replace(typing.length, typing.length, 'x');
}
check('fifty typed characters are the text', typing.toString(), `a paragraph that already exists${'x'.repeat(50)}`);
check('and they appended rather than fragmenting', typing.pieceCount(), 2);

const edited = new TextStore('one two three');
edited.replace(4, 7, 'TWO');
check('an edit in the middle keeps three pieces at most', edited.pieceCount() <= 3, true);
check('and reads correctly across the seam', edited.slice(0, edited.length), 'one TWO three');

const rewritten = new TextStore('the whole first draft');
rewritten.replace(0, rewritten.length, 'the second draft');
check('a whole-document replacement leaves one piece', rewritten.pieceCount(), 1);
rewritten.compact();
check('and compact() keeps the text', rewritten.toString(), 'the second draft');
check('with nothing to compact afterwards', rewritten.pieceCount(), 1);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('text store: all checks passed');
