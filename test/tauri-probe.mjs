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
 * A probe that needs a file in this checkout — `versioning-fake-git.js` points the
 * app at `test/probes/fake-git.sh` — finds the checkout in `window.__probePaths`.
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
/** Where this checkout is, for a probe that has to name one of its files. */
const probePaths = { checkout: fileURLToPath(new URL('..', import.meta.url)) };
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
  window.__probePaths = ${JSON.stringify(probePaths)};
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

/**
 * What this run's calls cost, so "the app is slow" and "the probe took a while" can be
 * told apart: every call opens its own WebSocket, and the call that runs the probe holds
 * *the probe's* whole life (every `t.load` and every sleep in it), which would otherwise
 * swamp the numbers. The bridge's own calls are the ones that say whether the app is
 * answering; the probe's is reported separately, and a failure in either is named.
 * Printed once, after the probe's result.
 */
const calls = [];
process.on('exit', () => {
  if (calls.length === 0) {
    return;
  }
  const bridgeCalls = calls.filter((entry) => entry.kind === 'bridge');
  const probeCalls = calls.filter((entry) => entry.kind === 'probe');
  const times = bridgeCalls.map((entry) => entry.ms).sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const failed = calls.filter((entry) => !entry.ok).length;
  const probe = probeCalls[0];
  console.log(
    `bridge: ${times.length} calls, median ${Math.round(median * 10) / 10} ms, ` +
      `max ${Math.round(times[times.length - 1] * 10) / 10} ms` +
      (failed === 0 ? '' : `, ${failed} failed`) +
      (probe ? `; the probe itself ${Math.round(probe.ms)} ms` : '')
  );
});

/** Sends one script and resolves with the bridge's reply. */
async function call(script, timeoutMs = 20000, kind = 'bridge') {
  const started = performance.now();
  const ws = await connect();
  const reply = await new Promise((resolve) => {
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
  calls.push({ ms: performance.now() - started, ok: reply.success === true, kind });
  return reply;
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

/**
 * Puts the app in English before a probe runs.
 *
 * A probe asserts *behaviour*, and it asserts it in English: a button it looks for by
 * `aria-label` is `Image`, a status it reads is `Saved`. The app itself follows the reader's
 * system locale when the config names no language (`src/services/language.ts`), so on a machine
 * whose locale is not English every one of those assertions would fail for a reason that has
 * nothing to do with the code under test. This is the harness's business, like the document it
 * loads and the workspace it points at; `test/probes/localization.js` is where the language
 * itself is tested, and it sets and restores what it needs.
 */
async function ensureEnglish() {
  const reply = await call(
    `(async () => {
       // What matters is the language the window is *in*, not what the config spells: an empty
       // setting means the reader's system locale, and on a machine already in English there is
       // nothing to change — and changing it would reload the page, which costs the *next* probe
       // the better part of its five seconds.
       if (document.documentElement.lang === 'en') {
         return null;
       }
       const config = await window.__TAURI_INTERNALS__.invoke('get_config');
       const previous = config.language ?? '';
       await window.__TAURI_INTERNALS__.invoke('set_config', {
         cfg: {
           ...config,
           language: 'en',
           config_version: await window.__TAURI_INTERNALS__.invoke('get_current_config_version')
         }
       });
       location.reload();
       return previous;
     })()`,
    15000
  );
  if (reply.success && typeof reply.data === 'string') {
    await sleep(2500);
    await waitForEditor();
    if (!(await helpersReady())) {
      await installHelpers();
    }
    return reply.data;
  }
  return null;
}
const languageBeforeProbing = await ensureEnglish();

/** Puts the language back where it was found, the way the workspace is put back. */
async function restoreLanguage(previous) {
  if (previous === null) {
    return;
  }
  await call(
    `(async () => {
       const config = await window.__TAURI_INTERNALS__.invoke('get_config');
       await window.__TAURI_INTERNALS__.invoke('set_config', {
         cfg: {
           ...config,
           language: ${JSON.stringify(previous)},
           config_version: await window.__TAURI_INTERNALS__.invoke('get_current_config_version')
         }
       });
       location.reload();
       return 'restored';
     })()`,
    15000
  );
  // The reload has to settle before the next probe starts: a page that is still building its shell
  // answers slowly, and a probe measures in the five-second budget it is given.
  await sleep(2500);
  await waitForEditor();
  if (!(await helpersReady())) {
    await installHelpers();
  }
}

/** Runs the probe, installing the helpers again if the page lost them. */
async function runProbe() {
  // Clear any earlier probe's stash, and put back the one seam a probe can leave set on the app
  // itself: `versioning_use_git` — a global in the Rust process, which a page reload does not
  // clear. A run cut off by the bridge then costs the next probe nothing, and the stash it left is
  // never mistaken for the previous one's result.
  await call(
    `(async () => {
       window.__probeResult = undefined;
       window.__probeSteps = undefined;
       try {
         await window.__TAURI_INTERNALS__.invoke('versioning_use_git', { git: null });
       } catch (error) {
         // A build without the versioning seam has nothing to put back.
       }
       return null;
     })()`
  );
  return await call(wrappedProbe, 20000, 'probe');
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

/** How long the app's own session write can still be in flight once a probe has reported. */
const SESSION_SAVE_SETTLE_MS = 900;

/** A session with nothing in it: the state a reader who has never opened a document starts on. */
const EMPTY_SESSION = '{"version":1,"current":null,"documents":[]}';

/**
 * The session file's text, as the app's own command reads it — the JSON text of that text, or the
 * text `null` when the app has never written a session at all. `null` means the *read* failed.
 */
async function readSessionText() {
  const reply = await call(
    `(async () => JSON.stringify(await window.__TAURI_INTERNALS__.invoke('load_session')))()`,
    15000
  );
  if (!reply.success) {
    return null;
  }
  const text = String(reply.data);
  try {
    JSON.parse(text);
  } catch {
    // A reply that is not the JSON text of a session is a *read* that failed, not one to hand
    // back: a harness that threw here would read as the probe failing.
    return null;
  }
  return text;
}

/** Writes the session's own text through the app's own command. */
async function writeSessionText(text) {
  await call(
    `(async () => {
       await window.__TAURI_INTERNALS__.invoke('save_session', { session: ${JSON.stringify(text)} });
       return 'session written';
     })()`,
    15000
  );
}

/**
 * Puts the session file back the way it was found, so a run leaves the reader's own documents
 * alone. A probe loads documents into a dev app that is the maintainer's, and one that types into
 * them leaves its copy in the session — which the *next* start would then restore over the notes
 * the reader had open.
 *
 * The app writes its session on a debounce (800 ms after the last edit or scroll,
 * `src/services/session.ts`), so a write the probe scheduled can land *after* this restore: that
 * window is waited out first, and the file is read back once and written again if the app had a
 * write of its own still in flight. A run that began with no session leaves the app's own empty
 * one, which is the state a reader who has never opened a document starts on.
 */
async function restoreSession(previous) {
  if (previous === null) {
    return;
  }
  const found = JSON.parse(previous);
  const wanted = found === null ? EMPTY_SESSION : String(found);
  await sleep(SESSION_SAVE_SETTLE_MS);
  await writeSessionText(wanted);
  const writtenBack = await readSessionText();
  if (writtenBack === null || JSON.parse(writtenBack) !== wanted) {
    await writeSessionText(wanted);
  }
}

// A probe that needs the workspace open gets it, and the maintainer's own
// workspace is put back once the probe has reported. The session is read up
// here for the same reason: the documents the reader had open are put back
// whatever the probe did with them.
const previousConfig = withWorkspace ? await useFixtureWorkspace() : null;
const previousSession = await readSessionText();

/**
 * A probe's own verdict, as the harness reads it: a probe returns `{ checks, failed }`,
 * so a probe with a non-empty `failed` list has *failed*, and the exit status has to say
 * so — otherwise `npm run probe:all` counts every probe that ran as one that passed. A
 * probe that only measures returns its numbers, with no `failed` key, and is read as one
 * that passed.
 */
function failedChecks(data) {
  const failed = data && typeof data === 'object' ? data.failed : null;
  return Array.isArray(failed) ? failed.map(String) : [];
}

/** Prints a finished probe's result, and exits as its verdict. */
function reportResult(result) {
  console.log(JSON.stringify(result, null, 2));
  const failed = failedChecks(result);
  if (failed.length > 0) {
    console.error(`the probe failed ${failed.length} of its checks:\n  ${failed.join('\n  ')}`);
    process.exit(1);
  }
  process.exit(0);
}

let reply = await runProbe();
if (!reply.success && /window\.__t|t\.(report|blocks|load)/.test(String(reply.error))) {
  await installHelpers();
  reply = await runProbe();
}
await restoreConfig(previousConfig);
await restoreSession(previousSession);
await restoreLanguage(languageBeforeProbing);
if (reply.success) {
  reportResult(reply.data);
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
    console.log(
      '(recovered after the bridge timed out; the probe had already run — the bridge gives a ' +
        'script 5 s, so this is what a longer probe always looks like, and the bridge: line ' +
        'below says whether the app was answering while it ran)'
    );
    reportResult(state.result);
  }
  if (state && state.steps !== null) {
    console.error(JSON.stringify(state.steps, null, 2));
    console.error('(the probe did not finish; the steps above are what it reported)');
    process.exit(1);
  }
}

console.error(JSON.stringify(reply, null, 2));
process.exit(1);
