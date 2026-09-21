/**
 * Re-copies the fixture workspace from the maintainer's own notes folder.
 *
 * The committed copies under `test/fixtures/workspace/` are what tests read;
 * this script exists so they can be refreshed without hand-copying files, and
 * so the list of fixtures lives in one place. Set `YI_FIXTURE_SOURCE` to point
 * at a different notes folder.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.env.YI_FIXTURE_SOURCE ?? join(homedir(), 'Documents/ZettlrNotes');
const workspace = fileURLToPath(new URL('./workspace/', import.meta.url));

/** Every fixture: its path inside the source workspace, relative to this one. */
const fixtures = [
  ['Unfiled/虚无与生发.md', 'notes/Unfiled/虚无与生发.md'],
  ['Game Theory/6 Bayesian Game.md', 'notes/Game Theory/6 Bayesian Game.md'],
  ['Essays/Language and Thought.md', 'notes/Essays/Language and Thought.md'],
  [
    'Physics/Theoretic Mechanics/Geometric and Kinematic Foundations of Lagrangian Mechanics.md',
    'notes/Physics/Theoretic Mechanics/Geometric and Kinematic Foundations of Lagrangian Mechanics.md'
  ],
  [
    'Western Philosophy/Hannah Arendt/The Human Condition.md',
    'notes/Western Philosophy/Hannah Arendt/The Human Condition.md'
  ],
  ['zotero.bib', 'zotero.bib']
];

if (!existsSync(source)) {
  console.error(`fixture source not found: ${source}\nSet YI_FIXTURE_SOURCE to your notes folder.`);
  process.exit(1);
}

let missing = 0;
for (const [from, to] of fixtures) {
  const origin = join(source, from);
  if (!existsSync(origin)) {
    console.error(`missing in the source workspace: ${from}`);
    missing += 1;
    continue;
  }
  const target = join(workspace, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(origin, target);
  console.log(`copied ${from}`);
}

if (missing > 0) {
  console.error(`${missing} fixture(s) missing; nothing else was changed`);
  process.exit(1);
}
console.log(`fixtures refreshed from ${source}`);
