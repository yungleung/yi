/**
 * Runs a probe script inside the running editor through the Tauri MCP bridge.
 *
 * Usage: node test/tauri-probe.mjs --install     (once per page load)
 *        node test/tauri-probe.mjs test/probes/<name>.js   (or: npm run probe -- test/probes/<name>.js)
 *        node test/tauri-probe.mjs --reload      (reload the editor page)
 *        node test/tauri-probe.mjs --with-doc FILE test/probes/<name>.js
 *        node test/tauri-probe.mjs --fixture REL  test/probes/<name>.js
 *        node test/tauri-probe.mjs --with-workspace test/probes/<name>.js
 *
 * `--with-doc` loads a markdown file into the editor before the probe runs.
 * Use it instead of the workspace tree for measurements: the tree's file
 * navigation reloads and scans enough of the app that the page stalls, and a
 * probe then measures nothing.
 *
 * `--fixture` is `--with-doc` resolved inside `test/fixtures/workspace/`, so a
 * probe can name a real note without depending on where this checkout lives.
 *
 * `--with-workspace` points the app's config at the fixture workspace for the
 * run (wikilinks and citations then resolve) and puts the previous config back
 * afterwards, so running a probe never changes the maintainer's own workspace.
 *
 * The probe is a plain script evaluated in the webview; it may return a value
 * (or a promise) which is printed as JSON. Helpers are installed separately
 * (`--install`), so every probe is sent verbatim.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage =
  'usage: node test/tauri-probe.mjs <probe.js> | --install | --reload\n' +
  '       [--with-doc FILE | --fixture REL] [--with-workspace]';
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(usage);
  process.exit(2);
}
const flags = new Set(args.filter((argument) => argument.startsWith('--')));
const positional = args.filter((argument) => !argument.startsWith('--'));
if (!['--install', '--reload'].some((flag) => flags.has(flag)) && positional.length === 0) {
  console.error(usage);
  console.error('usage: node test/tauri-probe.mjs <probe.js> | --install | --reload');
  process.exit(2);
}

// The bridge evaluates the script it is given and only reports a value when
// that script is one expression; anything else falls back to a slow path that
// can outlive the bridge's budget. So the helpers are installed once, on their
// own, and every probe is sent verbatim and written as a single expression,
// e.g. `(async () => ({ ... }))()`. The editor's event handlers also go stale
// after many document swaps, which is what `--reload` is for.
const installing = flags.has('--install');
const reloading = flags.has('--reload');
const withDoc = flags.has('--with-doc');
const withFixture = flags.has('--fixture');
const withWorkspace = flags.has('--with-workspace');
const fixturesRoot = fileURLToPath(new URL('./fixtures/workspace', import.meta.url));
const documentArgument = withDoc || withFixture ? positional[0] : null;
const probeFile = withDoc || withFixture ? positional[1] : positional[0];
const probe = installing || reloading ? null : readFileSync(probeFile, 'utf8');
// A probe that does not parse is still sent, and comes back as a bridge
// timeout — which reads like a slow app, or like a native window holding the
// page. Fail here instead, naming the file: `table-menu.js` carried a stray
// `* @needs-foreground-window` line outside its comment block for a while, and
// probe:all skipped it by that very string without ever parsing the file.
if (probe !== null) {
  try {
    new Function(`return (${probe})`);
  } catch (error) {
    console.error(`${probeFile} does not parse: ${error.message}`);
    process.exit(2);
  }
}
const documentText = documentArgument
  ? readFileSync(withFixture ? join(fixturesRoot, documentArgument) : documentArgument, 'utf8')
  : null;
// A probe that loads a document and then reads layout can outlive the
// bridge's budget while the page is still settling. The wrapper stashes the
// result, so a timed-out probe is still readable a moment later.
const wrappedProbe = probe
  ? `(async () => {
  window.__probeResult = undefined;
  window.__probeSteps = undefined;
  window.__probeDoc = ${JSON.stringify(documentText)};
  ${documentText === null ? '' : 'await window.__t.load(window.__probeDoc);'}
  window.__probeResult = await (
${probe}
  );
  return window.__probeResult;
})()`
  : null;

async function connect() {
  for (let port = 9223; port < 9233; port += 1) {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', () => reject(new Error(`port ${port} refused`)), {
          once: true
        });
      });
      return ws;
    } catch {
      /* try the next port */
    }
  }
  throw new Error('no MCP bridge on 9223-9232 — is `npm run tauri dev` running?');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends one script and resolves with the bridge's reply. */
async function call(script, timeoutMs = 20000) {
  const ws = await connect();
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.close();
      resolve({ success: false, error: 'timeout waiting for the bridge' });
    }, timeoutMs);
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 'req-1') {
        return;
      }
      clearTimeout(timer);
      ws.close();
      resolve(message);
    });
    ws.send(
      JSON.stringify({
        id: 'req-1',
        command: 'execute_js',
        args: { script, windowLabel: 'main' }
      })
    );
  });
}

if (installing) {
  // Installing the helpers is a multi-statement script: the bridge's slow path
  // runs it and can report a timeout, so a failure here is expected.
  await call(readFileSync(new URL('./probes/lib.js', import.meta.url), 'utf8'), 12000);
  console.log('helpers installed');
  process.exit(0);
}

if (reloading) {
  await call("(async () => { location.reload(); return 'reloading'; })()", 5000);
  console.log('reloading');
  process.exit(0);
}

/** Installs the helpers, waiting out the slow path the bridge uses for them. */
async function installHelpers() {
  await call(readFileSync(new URL('./probes/lib.js', import.meta.url), 'utf8'), 15000);
  await sleep(1000);
}

/** Whether the page still has the helpers installed. */
async function helpersReady() {
  // The helper surface is checked, not just its presence: a page that still has
  // an older lib.js would fail a probe on a helper that is not there yet.
  const reply = await call(
    'typeof window.__t === "object" && typeof window.__t.blocks === "function"' +
      ' && typeof window.__t.app === "function"',
    8000
  );
  return reply.success && reply.data === true;
}

/** Waits until the editor has rendered, which a reload interrupts. */
async function waitForEditor(attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const reply = await call('Boolean(document.querySelector(".prose"))', 8000);
    if (reply.success && reply.data === true) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

// A probe that throws because the helpers are missing would report nothing at
// all, which is what a page reload between installing and probing looks like —
// an editor change or a dev-server restart does exactly that. Install (or
// reinstall) first, and retry once if the page reloaded underneath the probe.
if (!(await helpersReady())) {
  await installHelpers();
}
await waitForEditor();

/** Runs the probe, installing the helpers again if the page lost them. */
async function runProbe() {
  // Clear any earlier probe's stash first, so a timed-out run can never be
  // mistaken for the previous one's result.
  await call('window.__probeResult = undefined; window.__probeSteps = undefined; null');
  return await call(wrappedProbe);
}

/**
 * Points the app's config at the fixture workspace, so wikilinks and citations
 * in a probe resolve against the committed notes. Returns the previous config
 * as JSON text, for {@link restoreConfig}.
 */
async function useFixtureWorkspace() {
  const previous = await call(
    "(async () => JSON.stringify(await window.__TAURI_INTERNALS__.invoke('get_config')))()",
    15000
  );
  await call(
    `(async () => {
       const cfg = {
         workspace: ${JSON.stringify(fixturesRoot)},
         bibliography_file: ${JSON.stringify(join(fixturesRoot, 'zotero.bib'))},
         csl_style: '',
         config_version: await window.__TAURI_INTERNALS__.invoke('get_current_config_version')
       };
       await window.__TAURI_INTERNALS__.invoke('set_config', { cfg });
       await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
         event: 'workspace_changed',
         payload: cfg.workspace
       });
       return 'workspace set';
     })()`,
    15000
  );
  await sleep(1500);
  return previous.success ? String(previous.data) : null;
}

/** Puts the app's config back the way it was before the probe ran. */
async function restoreConfig(previous) {
  if (!previous) {
    return;
  }
  await call(
    `(async () => {
       const cfg = ${previous};
       await window.__TAURI_INTERNALS__.invoke('set_config', { cfg });
       await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
         event: 'workspace_changed',
         payload: cfg.workspace
       });
       return 'workspace restored';
     })()`,
    15000
  );
}

// A probe that needs the workspace open gets it, and the maintainer's own
// workspace is put back once the probe has reported.
const previousConfig = withWorkspace ? await useFixtureWorkspace() : null;

let reply = await runProbe();
if (!reply.success && /window\.__t|t\.(report|blocks|load)/.test(String(reply.error))) {
  await installHelpers();
  reply = await runProbe();
}
await restoreConfig(previousConfig);
if (reply.success) {
  console.log(JSON.stringify(reply.data, null, 2));
  process.exit(0);
}

// The page keeps working after the bridge gives up; poll for the stashed result
// while it settles. Only a probe that *finished* — one whose wrapper returned —
// counts as recovered: `__probeSteps` holds whatever the probe reported on the
// way, so treating that as success once hid a probe that threw half-way through.
for (let attempt = 0; attempt < 8; attempt += 1) {
  await sleep(4000);
  const recovered = await call(
    'JSON.stringify({ result: window.__probeResult ?? null, steps: window.__probeSteps ?? null })',
    8000
  );
  let state = null;
  try {
    state = recovered.success ? JSON.parse(recovered.data) : null;
  } catch {
    state = null;
  }
  if (state && state.result !== null) {
    console.log(JSON.stringify(state.result, null, 2));
    console.log('(recovered after the bridge timed out; the probe had already run)');
    process.exit(0);
  }
  if (state && state.steps !== null) {
    console.error(JSON.stringify(state.steps, null, 2));
    console.error('(the probe did not finish; the steps above are what it reported)');
    process.exit(1);
  }
}

console.error(JSON.stringify(reply, null, 2));
process.exit(1);
