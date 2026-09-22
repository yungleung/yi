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

// Is there an app to drive? Without this, a stopped dev server reports all
// sixty-odd probes as failures — a wall of red that says nothing about the code
// (it happened, and cost a suite run). One connection attempt, one clear message.
async function bridgeIsUp() {
  for (let port = 9223; port < 9233; port += 1) {
    const reachable = await new Promise((resolve) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      const settle = (value) => {
        socket.close();
        resolve(value);
      };
      socket.addEventListener('open', () => settle(true), { once: true });
      socket.addEventListener('error', () => settle(false), { once: true });
      setTimeout(() => settle(false), 2000);
    });
    if (reachable) {
      return true;
    }
  }
  return false;
}
if (!(await bridgeIsUp())) {
  console.error(
    'no Tauri MCP bridge on 9223-9232 — start the app first:\n  npm run tauri dev'
  );
  process.exit(1);
}

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
