/**
 * Checks the decision a patch is built on: which of a block's children an edit
 * left alone. Pure, so Node can drive the cases a keystroke, a paste and a
 * deletion produce, and the ones a naive positional match gets wrong.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/document/block_children.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-block-children-'));
const file = join(directory, 'block_children.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { reusePlan } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const child = (type, source, shape = '') => ({ type, source, shape });

check('nothing changed: every child keeps its element', reusePlan(
  [child('paragraph', 'a'), child('paragraph', 'b')],
  [child('paragraph', 'a'), child('paragraph', 'b')]
), [0, 1]);
check('one child edited: only that one is built again', reusePlan(
  [child('text', 'a'), child('emphasis', 'b'), child('text', 'c')],
  [child('text', 'a'), child('emphasis', 'B'), child('text', 'c')]
), [0, -1, 2]);
check('a child inserted in front: the others keep their elements', reusePlan(
  [child('text', 'a'), child('text', 'b')],
  [child('text', 'new'), child('text', 'a'), child('text', 'b')]
), [-1, 0, 1]);
check('a child deleted: the rest still match', reusePlan(
  [child('text', 'a'), child('text', 'b'), child('text', 'c')],
  [child('text', 'a'), child('text', 'c')]
), [0, 2]);
check('the same source under another type is another node', reusePlan(
  [child('text', 'x')],
  [child('emphasis', 'x')]
), [-1]);
check('a node that starts showing its own source is built again', reusePlan(
  [child('link', '[a](b)'), child('text', 'after')],
  [child('link', '[a](b)', 'source'), child('text', 'after')]
), [-1, 1]);
check('and one that stops showing it is built again too', reusePlan(
  [child('link', '[a](b)', 'source')],
  [child('link', '[a](b)')]
), [-1]);
check('a child is handed out once', reusePlan(
  [child('text', 'both')],
  [child('text', 'both'), child('text', 'both')]
), [0, -1]);
check('two identical children keep one element each', reusePlan(
  [child('text', 'both'), child('text', 'both')],
  [child('text', 'both'), child('text', 'both')]
), [0, 1]);
check('an empty block parses nothing', reusePlan([], []), []);
check('a block that had nothing gets everything built', reusePlan([], [child('text', 'a')]), [-1]);
check('a block that lost everything builds nothing', reusePlan([child('text', 'a')], []), []);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('block children: all checks passed');
