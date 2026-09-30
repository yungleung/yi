/**
 * Where a card floats (`ui/floating/placement.ts`) in Node: below what it points at when there is
 * room, above it when there is not, inside the window on every side, and in the corner when it
 * points at nothing.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-placement-'));
const bundle = await rolldown({ input: 'src/ui/floating/placement.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'placement.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { besidePlacement } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const window = { width: 1000, height: 800 };
const card = { width: 288, height: 160 };
const box = (left, top, height = 18) => ({ left, top, width: 2, height });

check('a card sits under what it points at', besidePlacement(box(400, 100), card, window), {
  left: 400,
  top: 124
});
check('and above it when there is no room below', besidePlacement(box(400, 700), card, window), {
  left: 400,
  top: 534
});
check('never past the right edge', besidePlacement(box(990, 100), card, window).left, 704);
check('nor past the left', besidePlacement(box(2, 100), card, window).left, 8);
check(
  'and a window too short for either keeps it at the top',
  besidePlacement(box(400, 700), { width: 288, height: 790 }, window).top,
  8
);
check('a card with nothing to point at hangs in the bottom-right corner', besidePlacement(null, card, window), {
  left: 704,
  top: 634
});

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('placement: all checks passed');
