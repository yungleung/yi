/**
 * Runs every probe that needs no fixture workspace, one after another.
 *
 * Every probe is given a document to start from, because most of the suite is
 * about the demo document and a probe that runs after another one would
 * otherwise inherit whatever that one left open:
 *
 * - `@needs-source-workspace` — skipped: it drives the workspace tree, so it
 *   needs the maintainer's own notes folder open.
 * - `@needs-large-document` — run against the 323 KB fixture note.
 * - everything else — run against the fixture demo document.
 *
 * A probe whose header contains `@needs-workspace` is skipped too: it needs the
 * app *pointed at* the fixtures (wikilinks, citations) and is run by name with
 * `--with-workspace`. Requires `npm run tauri dev` in another terminal.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('./probes/', import.meta.url));
const harness = fileURLToPath(new URL('./tauri-probe.mjs', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/workspace/', import.meta.url));
const demoDocument = join(fixtures, 'default-document.md');
const largeDocument = join(fixtures, 'notes/Western Philosophy/Hannah Arendt/The Human Condition.md');

const probes = readdirSync(directory)
  .filter((name) => name.endsWith('.js') && name !== 'lib.js')
  .sort();

const failed = [];
let skipped = 0;

// Every probe has to parse, whether or not this run starts it: a marker that
// lands outside the header comment leaves the file a syntax error,
// `probe:all` skips it on that very string, and by the time anyone runs it by
// name the bridge answers with a timeout instead of the typo. It has happened
// twice (`table-menu.js`, `scroll-cost.js`), so it is checked here.
const broken = [];
for (const name of probes) {
  try {
    new Function(`return (${readFileSync(join(directory, name), 'utf8')})`);
  } catch (error) {
    broken.push(`${name}: ${error.message}`);
  }
}
if (broken.length > 0) {
  console.error(`probes that do not parse:\n${broken.join('\n')}`);
  process.exit(1);
}

for (const name of probes) {
  const header = readFileSync(join(directory, name), 'utf8');
  if (
    header.includes('@needs-workspace') ||
    header.includes('@needs-source-workspace') ||
    header.includes('@needs-foreground-window')
  ) {
    console.log(`\n=== ${name} (skipped: run it by name with the documents it needs)`);
    skipped += 1;
    continue;
  }
  console.log(`\n=== ${name}`);
  const document = header.includes('@needs-large-document') ? largeDocument : demoDocument;
  const run = spawnSync(process.execPath, [harness, '--with-doc', document, join(directory, name)], {
    stdio: 'inherit'
  });
  if (run.status !== 0) {
    failed.push(name);
  }
}

const ran = probes.length - skipped;
console.log(`\n${ran - failed.length}/${ran} probes passed (${skipped} skipped)`);
if (failed.length > 0) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
