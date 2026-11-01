/**
 * Whether the app asks the reader for a workspace (`services/workspace/setup.ts`) in Node: a fresh
 * install is asked, a reader who has a workspace or has already answered is not, and the workspace
 * the app makes for them has a name.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-workspace-setup-'));
const bundle = await rolldown({ input: 'src/services/workspace/setup.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'workspace_setup.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { DEFAULT_WORKSPACE_NAME, needsWorkspaceQuestion } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check(
  'a fresh install is asked',
  needsWorkspaceQuestion({ workspace: null, workspace_asked: false }),
  true
);
check(
  'an empty workspace is no workspace',
  needsWorkspaceQuestion({ workspace: '', workspace_asked: false }),
  true
);
check(
  'a reader with a workspace is never asked',
  needsWorkspaceQuestion({ workspace: '/notes', workspace_asked: false }),
  false
);
check(
  'and one who has answered is never asked',
  needsWorkspaceQuestion({ workspace: null, workspace_asked: true }),
  false
);
check('the workspace the app makes is called Yi', DEFAULT_WORKSPACE_NAME, 'Yi');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('workspace setup: all checks passed');
