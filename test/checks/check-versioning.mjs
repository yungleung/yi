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

// The stamp is the reader's local time, so the check pins the zone it runs in.
process.env.TZ = 'UTC';

const directory = mkdtempSync(join(tmpdir(), 'yi-versioning-'));
const bundle = await rolldown({ input: 'src/services/versioning.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'versioning.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const {
  consentFrom,
  versionMessage,
  versionLocation,
  versionStamp,
  versionedNow,
  versionsState,
  versionsVisible,
  versioningPlan
} = await import(file);

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
  separate_git_dir: '/app-data/repos/notes',
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
check('an answer belongs to the workspace it was given for', consentFrom({ versioning: true, versioning_workspace: '/notes' }, '/somewhere-else'), 'unasked');
check('a workspace the reader said yes to reads as yes', consentFrom({ versioning: true, versioning_workspace: '/notes' }, '/notes'), 'yes');
check('and one they said no to reads as no', consentFrom({ versioning: false, versioning_workspace: '/notes' }, '/notes'), 'no');
check('a version is stamped in the reader’s own time', versionStamp(Date.UTC(2026, 9, 1, 20, 5) / 1000), '2026-10-01 20:05');
check(
  'a version without a comment is the message it always was',
  versionMessage('A note', new Date(2026, 9, 1, 9, 5), ''),
  { subject: 'A note · 2026-10-01 09:05', body: null }
);
check(
  'and a comment is the body, trimmed, the subject untouched',
  versionMessage('A note', new Date(2026, 9, 1, 9, 5), '  why I rewrote it  '),
  { subject: 'A note · 2026-10-01 09:05', body: 'why I rewrote it' }
);
check(
  'a comment of nothing but spaces is no comment',
  versionMessage('A note', new Date(2026, 9, 1, 9, 5), '   '),
  { subject: 'A note · 2026-10-01 09:05', body: null }
);
/** One version row, for the cases about what a list is. */
const row = { hash: 'abc', at: 1790855254, subject: 'A note · 2026-10-01 20:15', body: '' };
check(
  'the versions button belongs in the status bar where the reader agreed to versions',
  versionsVisible({ versioning: true, versioning_workspace: '/notes' }, '/notes'),
  true
);
check(
  'and nowhere else — not even a folder they once agreed about',
  versionsVisible({ versioning: true, versioning_workspace: '/notes' }, '/other'),
  false
);
check(
  'a note with no file has no versions to show',
  versionsState({ path: null, repository: true, versions: [], newestText: null }),
  { kind: 'no-file' }
);
check(
  'a workspace nothing has made a repository in says so',
  versionsState({ path: '/notes/a.md', repository: false, versions: [], newestText: null }),
  { kind: 'no-repository' }
);
check(
  'and otherwise the list is the versions that were read, for that path',
  versionsState({ path: '/notes/a.md', repository: true, versions: [row], newestText: 'a\n' }),
  { kind: 'ready', path: '/notes/a.md', versions: [row], newestText: 'a\n' }
);
check('what is on screen is in a version when the two texts are the same', versionedNow('a\n', 'a\n'), true);
check('and it is not when they differ', versionedNow('a\n', 'b\n'), false);
check('and a note with no versions behind it is not in one either', versionedNow(null, 'b\n'), false);
check(
  'their repository is the path the words about a synced folder name',
  versionLocation(
    facts({ repository: { here: true, above: true, toplevel: '/notes' }, cloud: 'cloud-storage' }),
    plan({ repository: { here: true, above: true, toplevel: '/notes' }, cloud: 'cloud-storage' }, 'yes')
  ),
  '/notes'
);
check(
  'and the git directory outside the folder is the path ours names',
  versionLocation(facts({ cloud: 'cloud-storage' }), plan({ cloud: 'cloud-storage' }, 'yes')),
  '/app-data/repos/notes'
);
check('a repository made in the workspace itself has no path to name', versionLocation(facts(), plan({}, 'yes')), null);
check('nothing to name for a plan that touches nothing', versionLocation(facts(), plan({}, 'no')), null);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('versioning: all checks passed');
