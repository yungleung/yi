/**
 * What the app should do about versions (`services/versioning.ts`) in Node: the reader's consent
 * turned into a plan over the facts of the machine and the folder — nothing without consent, their
 * repository as it is, never nested inside another, a separate git directory where a cloud drive
 * could reach `.git`, and none of it without git.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-versioning-'));
const bundle = await rolldown({ input: 'src/services/versioning.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'versioning.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { versioningPlan } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
/** Facts with everything uninteresting, so each case says only what it is about. */
const facts = (over = {}) => ({
  git: '/usr/bin/git',
  repository: { here: false, above: false, toplevel: null },
  cloud: 'none',
  ...over
});
const plan = (over, consent) => versioningPlan(facts(over), consent);

check('unasked consent asks, and plans nothing yet', plan({}, 'unasked'), {
  use: 'none',
  separateGitDir: false,
  ask: 'consent',
  blocked: null
});
check('declining is remembered and touches nothing', plan({}, 'no'), {
  use: 'none',
  separateGitDir: false,
  ask: null,
  blocked: null
});
check(
  'their repository is used as it stands',
  plan({ repository: { here: true, above: true, toplevel: '/notes' } }, 'yes'),
  { use: 'theirs', separateGitDir: false, ask: null, blocked: null }
);
check(
  'a folder inside a repository is never nested into',
  plan({ repository: { here: false, above: true, toplevel: '/code' } }, 'yes'),
  { use: 'theirs', separateGitDir: false, ask: null, blocked: null }
);
check(
  'a cloud-synced folder gets a separate git directory, after the warning',
  plan({ cloud: 'cloud-storage' }, 'yes'),
  { use: 'init', separateGitDir: true, ask: 'cloud-risk', blocked: null }
);
check(
  'iCloud is the same case',
  plan({ cloud: 'icloud' }, 'yes'),
  { use: 'init', separateGitDir: true, ask: 'cloud-risk', blocked: null }
);
check(
  'a folder we cannot read enough to be sure about gets the safe one',
  plan({ cloud: 'unknown' }, 'yes'),
  { use: 'init', separateGitDir: true, ask: 'cloud-risk', blocked: null }
);
check('a local folder is initialised as normal', plan({}, 'yes'), {
  use: 'init',
  separateGitDir: false,
  ask: null,
  blocked: null
});
check('and without git, nothing is possible', plan({ git: null }, 'yes'), {
  use: 'none',
  separateGitDir: false,
  ask: null,
  blocked: 'no-git'
});
check(
  'their repository is used even where a cloud drive could reach it',
  plan({ repository: { here: true, above: true, toplevel: '/notes' }, cloud: 'cloud-storage' }, 'yes'),
  { use: 'theirs', separateGitDir: false, ask: 'cloud-risk', blocked: null }
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('versioning: all checks passed');
