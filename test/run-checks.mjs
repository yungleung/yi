/**
 * Runs every Node-only check and fails when any of them does.
 *
 * A check bundles one module with rolldown and asserts on it in Node: no
 * browser, no Tauri app, milliseconds. Anything rule-shaped belongs here — see
 * `test/README.md` for the index and `docs/testing.md` for the methodology.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('./checks/', import.meta.url));
const checks = readdirSync(directory)
  .filter((name) => name.endsWith('.mjs'))
  .sort();

const failed = [];
for (const name of checks) {
  const run = spawnSync(process.execPath, [join(directory, name)], { stdio: 'inherit' });
  if (run.status !== 0) {
    failed.push(name);
  }
}

console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
