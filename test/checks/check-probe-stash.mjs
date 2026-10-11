/**
 * What a probe's run may read back as its own from the page's stash (`test/probe_stash.mjs`):
 * the frame it stamped with its own run, and nothing else — not another run's frame, and not
 * a value written without one, which is the shape a probe cut off under the old harness left
 * behind (`test/README.md`, "a probe's evidence is its own").
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-probe-stash-'));
const bundle = await rolldown({ input: 'test/probe_stash.mjs', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'probe_stash.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { frameFor, ownFrame } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const mine = 'run-a';
const result = { checks: [{ name: 'a probe report', pass: true }], failed: [] };

check('a run reads back its own result', ownFrame(frameFor(mine, result), mine), result);
check('and its own steps', ownFrame(frameFor(mine, { step: 1 }), mine), { step: 1 });
check(
  'but not a result another run stashed',
  ownFrame(frameFor('run-b', result), mine),
  null
);
check(
  'nor a value written without a run on it, which is what the old harness read',
  ownFrame({ checks: [], failed: [], marker: 'a probe that outlived its own run' }, mine),
  null
);
check('nor an absent one', ownFrame(null, mine), null);
check('nor a frame that holds no result', ownFrame({ run: mine }, mine), null);
check('and a falsy report is still a report', ownFrame(frameFor(mine, 0), mine), 0);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('all checks passed');
