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
const {
  editStaysInsideShownSource,
  isSourceBlock,
  moveShownSource,
  setShownRange,
  shownSourceText,
  shownSourceWithinBlock,
  sourceEntryOffset,
  withRenderFrame
} = await import(file);

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

// A shown range moves with an edit the way any other offset does: an edit inside it
// moves it, one after it does not (`syntax/edit_range.ts: shiftOffset`). The case
// that matters is a deletion inside a block that shows its own text: without the
// move the range ends up past the block, `isSourceBlock` answers false, and the
// block comes back as its rendering the next time it is built without a fresh
// decision (a window sync, a rebuild).
setShownRange({ from: formula.charStart, to: formula.charEnd });
moveShownSource({ from: formula.charStart + 4, to: formula.charStart + 5, replacement: '' });
check(
  'a deletion inside the shown range leaves the block its own source',
  isSourceBlock({ ...formula, charEnd: formula.charEnd - 1 }),
  true
);
setShownRange({ from: formula.charStart, to: formula.charStart + 4 });
moveShownSource({ from: formula.charEnd, to: formula.charEnd, replacement: 'zz' });
check('an edit after the shown range leaves it where it is', shownSourceWithinBlock(formula), 0);
setShownRange(null);

// A source is half-open for the text it contains, while the caret may still
// rest at either edge. An insertion at an edge therefore belongs to the text
// around the node and must take the ordinary rebuild path; an insertion inside
// it remains a local source edit.
setShownRange({ from: 10, to: 20 });
check(
  'an insertion inside the shown source stays local',
  editStaysInsideShownSource({ from: 15, to: 15, replacement: 'x' }),
  true
);
check(
  'an insertion at the source start leaves it',
  editStaysInsideShownSource({ from: 10, to: 10, replacement: 'x' }),
  false
);
check(
  'an insertion at the source end leaves it',
  editStaysInsideShownSource({ from: 20, to: 20, replacement: 'x' }),
  false
);
check(
  'an edit beyond the source leaves it',
  editStaysInsideShownSource({ from: 21, to: 21, replacement: 'x' }),
  false
);
check(
  'a deletion that touches the source end leaves it',
  editStaysInsideShownSource({ from: 19, to: 20, replacement: '' }),
  false
);
check(
  'a replacement that reaches the source end leaves it',
  editStaysInsideShownSource({ from: 15, to: 20, replacement: 'x' }),
  false
);
check(
  'an insertion at an end that can grow stays local',
  editStaysInsideShownSource(
    { from: 20, to: 20, replacement: 'x' },
    { start: false, end: true }
  ),
  true
);
check(
  'an insertion at a start that can grow stays local',
  editStaysInsideShownSource(
    { from: 10, to: 10, replacement: 'x' },
    { start: true, end: false }
  ),
  true
);
setShownRange(null);

// A quote or fenced Div can show a source nested inside it, such as a
// footnote label. That partial range keeps the container rendered; only the
// complete block range replaces it with source mode.
const quote = block('> quote[^1]\n> [^1]: note', 0, 'quote');
setShownRange({ from: 8, to: 12 });
check('a source nested in a quote leaves the container rendered', isSourceBlock(quote), false);
setShownRange({ from: quote.charStart, to: quote.charEnd });
check('a complete quote range shows the container source', isSourceBlock(quote), true);
setShownRange(null);

// Where a click on the rendering enters the text: the end of the body's last
// line that has content. The delimiters are not drawn, so the caret has to land
// inside the body, and blank lines at its end are not content.
check('a multi-line formula enters at the end of its last content line',
  sourceEntryOffset('$$\n\\frac{a}{b}\n$$'), '$$\n\\frac{a}{b}\n$$'.indexOf('\n$$'));
check('a longer formula likewise',
  sourceEntryOffset('$$\n\\frac{a}{b}\n+ c\n$$'), '$$\n\\frac{a}{b}\n+ c\n$$'.indexOf('\n$$'));
check('blank lines at the end of the content are not the content',
  sourceEntryOffset('$$\n+ c\n\n\n$$'), '$$\n+ c\n\n\n$$'.indexOf('\n\n\n$$'));
check('a formula on one line enters before its closing `$$`',
  sourceEntryOffset('$$E = mc^2$$'), '$$E = mc^2$$'.length - 2);
check('an empty formula enters inside its body',
  sourceEntryOffset('$$\n$$'), '$$\n'.length);
check('a formula that never closes enters at its end',
  sourceEntryOffset('$$\n\\frac{a}{b}\n'), '$$\n\\frac{a}{b}\n'.length - 1);

// What a source view shows: the block's own text over the shown range, not a
// re-serialization of the node. Markdown spells the same thing more than one
// way — `* * *` is a rule, `***` is the same rule — and a view built from the
// canonical spelling is a different length, which is what would put a caret
// inside the marker instead of at its end.
const rule = block('above\n\n* * *\n\nbelow', 0, 'paragraph');
setShownRange({ from: 7, to: 12 });
check(
  'the source text is the characters in the document',
  withRenderFrame(rule, () => shownSourceText()),
  '* * *'
);
check('outside a render frame there is no text to take', shownSourceText(), null);
check(
  'a range that names a longer text than the block has is not sliced',
  withRenderFrame(rule, () => {
    setShownRange({ from: 0, to: 400 });
    return shownSourceText();
  }),
  null
);
setShownRange(null);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('math source: all checks passed');
