/**
 * Checks the code-block indent in Node: what Tab and Shift+Tab do to a caret
 * and to a selection inside a fenced code block, and that the fences
 * themselves are never touched.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/syntax/code/edits.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-code-'));
const file = join(directory, 'edits.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { codeIndentEdit } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const applied = (text, edit) =>
  edit === null ? null : text.slice(0, edit.from) + edit.replacement + text.slice(edit.to);

const block = ['```ts', 'const a = 1;', 'const b = 2;', '```'].join('\n');
const caretInA = block.indexOf('a = 1') + 6;

check('Tab types two spaces at the caret',
  applied(block, codeIndentEdit(block, caretInA, caretInA, false)),
  block.slice(0, caretInA) + '  ' + block.slice(caretInA));
check(
  'Shift+Tab takes two spaces back off the line',
  applied('```ts\n  const a = 1;\n```', codeIndentEdit('```ts\n  const a = 1;\n```', 7, 7, true)),
  '```ts\nconst a = 1;\n```'
);
check('Shift+Tab at column 0 does nothing',
  codeIndentEdit('```ts\nconst a = 1;\n```', 6, 6, true), null);
check('Shift+Tab takes away a single space when that is all there is',
  applied('```ts\n const a = 1;\n```', codeIndentEdit('```ts\n const a = 1;\n```', 6, 6, true)),
  '```ts\nconst a = 1;\n```');

// A selection indents whole lines, and never eats the selected text.
const selected = codeIndentEdit(block, 6, block.length - 4, false);
check('a selection indents every line it touches',
  applied(block, selected),
  ['```ts', '  const a = 1;', '  const b = 2;', '```'].join('\n'));
check('the opening fence is left alone',
  applied(block, codeIndentEdit(block, 0, 20, false)).startsWith('```ts'),
  true);
check('the closing fence is left alone',
  applied(block, codeIndentEdit(block, 0, block.length, false)).endsWith('\n```'),
  true);
check('the selected text is never replaced',
  applied(block, codeIndentEdit(block, 6, 18, false)).includes('const a = 1;'),
  true);

const indented = ['```ts', '  const a = 1;', '  const b = 2;', '```'].join('\n');
check('a selection outdents every line it touches',
  applied(indented, codeIndentEdit(indented, 6, indented.length - 4, true)),
  block);
check('a blank line inside the selection stays empty',
  applied('```ts\n\nconst a = 1;\n```', codeIndentEdit('```ts\n\nconst a = 1;\n```', 6, 20, false)),
  '```ts\n\n  const a = 1;\n```');

// A display formula is indented the same way, between its own delimiters.
const math = ['$$', '\\frac{a}{b}', '+ c', '$$'].join('\n');
const mathCaret = math.indexOf('+ c') + 1;
check('Tab types two spaces inside a display formula',
  applied(math, codeIndentEdit(math, mathCaret, mathCaret, false)),
  math.slice(0, mathCaret) + '  ' + math.slice(mathCaret));
check('a caret on a `$$` line is left alone', codeIndentEdit(math, 1, 1, false), null);
check('a selection inside a formula indents its lines but not the `$$` lines',
  applied(math, codeIndentEdit(math, 3, math.length - 3, false)),
  ['$$', '  \\frac{a}{b}', '  + c', '$$'].join('\n'));
const indentedMath = ['$$', '  \\frac{a}{b}', '$$'].join('\n');
check('Shift+Tab takes the indentation back off a formula line',
  applied(indentedMath, codeIndentEdit(indentedMath, 4, 4, true)),
  ['$$', '\\frac{a}{b}', '$$'].join('\n'));
check('an indented `$$` line is not outdented either',
  codeIndentEdit(['  $$', 'x', '  $$'].join('\n'), 3, 3, true), null);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('code edits: all checks passed');
