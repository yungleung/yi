/**
 * Runs every probe that needs no fixture workspace, one after another.
 *
 * A probe whose header comment contains `@needs-workspace` is skipped: those
 * need the app pointed at the fixture workspace (`--with-workspace`) and are
 * run by name. Requires `npm run tauri dev` in another terminal.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('./probes/', import.meta.url));
const harness = fileURLToPath(new URL('./tauri-probe.mjs', import.meta.url));
const probes = readdirSync(directory)
  .filter((name) => name.endsWith('.js') && name !== 'lib.js')
  .filter((name) => !readFileSync(join(directory, name), 'utf8').includes('@needs-workspace'))
  .sort();

const failed = [];
for (const name of probes) {
  console.log(`\n=== ${name}`);
  const run = spawnSync(process.execPath, [harness, join(directory, name)], { stdio: 'inherit' });
  if (run.status !== 0) {
    failed.push(name);
  }
}

console.log(`\n${probes.length - failed.length}/${probes.length} probes passed`);
if (failed.length > 0) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
