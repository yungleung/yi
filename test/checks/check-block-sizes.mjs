/**
 * Checks the renderer's arithmetic in Node: what a block is worth in pixels, the
 * sums the window and the spacers are built from, and which blocks a scroll
 * position mounts.
 *
 * The arithmetic is a pure function of the document's blocks and their heights —
 * the DOM only measures and writes — so it is asserted here instead of watched
 * through a probe.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-block-sizes-'));

/** Bundles one module and imports it, the way every check loads its subject. */
async function bundleModule(input, name) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const { BlockSizes, LINE_HEIGHT, PARAGRAPH_SKIP } = await bundleModule(
  'src/ui/markdown/block_sizes.ts',
  'block_sizes'
);
const { VIEWPORT_MARGIN, windowRange, spacerHeights } = await bundleModule(
  'src/ui/markdown/viewport_window.ts',
  'viewport_window'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** A block as the arithmetic reads it: its source, and where it starts. */
const block = (text, lineStart = 1) => ({ text, lineStart });
// A trailing newline is an empty last line, which is what the estimate counts.
const one = block('a\n');
const two = block('b\nc\n');
const three = block('d');
const blocks = [one, two, three];
const estimate = (text) => text.split('\n').length * LINE_HEIGHT + PARAGRAPH_SKIP;

const sizes = new BlockSizes((candidate) => candidate.text);
check('a block is its lines plus the paragraph skip', sizes.heightOf(two), 3 * LINE_HEIGHT + 8);
check('a one-line block is measured the same way', sizes.heightOf(three), estimate('d'));

sizes.remember(one, 100);
check('a remembered height wins over the estimate', sizes.heightOf(one), 100);
sizes.remember(two, 0);
check('a height of nothing is not remembered', sizes.heightOf(two), estimate('b\nc\n'));

// The page is drawn at a scale (`markdown_editor.ts: fitPage`), and the estimate is made of
// the page's own line height and paragraph skip — so it takes that scale, or the document's
// total height moves as blocks are measured and a reader at the bottom is clamped up a page.
const halved = new BlockSizes((candidate) => candidate.text);
halved.setScale(0.5);
check('a page drawn at half size estimates half the height', halved.heightOf(two), estimate('b\nc\n') / 2);
halved.remember(two, 100);
check('a height measured on that page is its own', halved.heightOf(two), 100);
halved.setScale(0.25);
check(
  'and a height measured before the scale changed is not a measurement of it',
  halved.heightOf(two),
  estimate('b\nc\n') / 4
);

check('the document is its blocks', sizes.totalHeight(blocks), 100 + 80 + 32);
check('one block is one block', sizes.totalHeight([one]), 100);
check('no blocks is no height', sizes.totalHeight([]), 0);
check('a block starts where the ones above end', sizes.offsetOf(blocks, 2), 100 + 80);
check('the first block starts at nothing', sizes.offsetOf(blocks, 0), 0);
check('past the end is the end of the document', sizes.offsetOf(blocks, 9), 212);

// A document taller than the margin, so a scroll position has to choose.
const tall = new BlockSizes((candidate) => candidate.text);
const many = Array.from({ length: 30 }, (_, index) => block(`line ${index}\n`));
for (const item of many) {
  tall.remember(item, 100);
}
check('at the top the margin reaches thirteen blocks down', windowRange(tall, many, 0, 100), [0, 13]);
check('scrolled to 2000 the window starts at block seven', windowRange(tall, many, 2000, 100), [
  7,
  29
]);
check('the whole document mounts when the margin covers it', windowRange(sizes, blocks, 0, 100), [
  0,
  2
]);
// A reader below the end the *estimates* describe: a long document of unmeasured blocks, and a
// scroll past what their line counts add up to. The window is the end the reader is at — the
// blocks the viewport and its margins can fill from the last one back — and not the whole
// document (which is what the fixture note mounted at one keystroke, measured: 484 blocks).
const estimated = new BlockSizes((candidate) => candidate.text);
const long = Array.from({ length: 200 }, (_, index) => block(`line ${index}\n`));
check('scrolled past the estimates, the window is the end', windowRange(estimated, long, 13000, 100), [
  155,
  199
]);
check(
  'and a document the estimates call shorter than the window still mounts whole',
  windowRange(estimated, many, 13000, 100),
  [0, 29]
);

const spacers = spacerHeights(sizes, blocks, { first: 1, last: 1 });
check('the top spacer is everything above the window', spacers.top, 100);
check('the bottom spacer is everything below it', spacers.bottom, 32);
check(
  'the spacers and the window account for the whole document',
  spacers.top + (sizes.offsetOf(blocks, 2) - sizes.offsetOf(blocks, 1)) + spacers.bottom,
  sizes.totalHeight(blocks)
);
const tallSpacers = spacerHeights(tall, many, { first: 7, last: 29 });
check('scrolled to the end, the bottom spacer is empty', tallSpacers, { top: 700, bottom: 0 });
check('an empty window has no spacers', spacerHeights(sizes, blocks, { first: 0, last: -1 }), {
  top: 0,
  bottom: 0
});

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('block sizes: all checks passed');
