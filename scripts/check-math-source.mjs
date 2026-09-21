/**
 * Checks the display formula's source view in Node: which block shows its own
 * text, and where a click on a formula's rendering puts the caret.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/source_mode.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-math-'));
const file = join(directory, 'source_mode.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { isSourceBlock, setShownRange, sourceEntryOffset } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** A block the way `splitBlocks` describes one. */
const block = (text, charStart, kind = 'displayMath') => ({
  kind,
  lineStart: 1,
  lineEnd: 1 + text.split('\n').length - 1,
  charStart,
  charEnd: charStart + text.length,
  text
});

// A block shows its own text while the shown source lies in it — which is how
// a display formula's block becomes its text — and never otherwise: a range
// that names a different block shows nothing, and a paragraph has no source
// text of its own to show.
const formula = block('$$\n\\frac{a}{b}\n$$', 10);
const other = block('$$\n\\frac{a}{b}\n$$', 40);
check('nothing is shown to start with', isSourceBlock(formula), false);
check('showing a range reports the change', setShownRange({ from: 10, to: 26 }), true);
check('the block the range names shows its own text', isSourceBlock(formula), true);
check('an identical block elsewhere does not', isSourceBlock(other), false);
check('showing the same range again is no change', setShownRange({ from: 10, to: 26 }), false);
check(
  'a block that grew around the shown range still shows it',
  isSourceBlock(block('$$\n\\frac{a}{b}\n+ c\n$$', 10)),
  true
);
check('showing nothing reports the change', setShownRange(null), true);
check('and the block renders its view again', isSourceBlock(formula), false);
check('a paragraph never shows a source of its own', isSourceBlock(block('text', 0, 'paragraph')), false);
check(
  'nor does a block that holds only part of the range',
  (setShownRange({ from: 0, to: 400 }), isSourceBlock(formula)),
  false
);
setShownRange(null);

// Where a click on the rendering enters the text: the end of the last line
// that has content. The closing `$$` is its own line, and the caret must not
// sit between that line and the text above it.
check('a multi-line formula enters at the end of its last content line',
  sourceEntryOffset('$$\n\\frac{a}{b}\n$$'), '$$\n\\frac{a}{b}\n$$'.indexOf('\n$$'));
check('a longer formula likewise',
  sourceEntryOffset('$$\n\\frac{a}{b}\n+ c\n$$'), '$$\n\\frac{a}{b}\n+ c\n$$'.indexOf('\n$$'));
check('blank lines at the end of the content are not the content',
  sourceEntryOffset('$$\n+ c\n\n\n$$'), '$$\n+ c\n\n\n$$'.indexOf('\n\n\n$$'));
check('a formula on one line enters before its closing `$$`',
  sourceEntryOffset('$$E = mc^2$$'), '$$E = mc^2$$'.length - 2);
check('an empty formula enters at the end of its opening line',
  sourceEntryOffset('$$\n$$'), 2);
check('a formula that never closes enters at its end',
  sourceEntryOffset('$$\n\\frac{a}{b}\n'), '$$\n\\frac{a}{b}\n'.length - 1);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('math source: all checks passed');
