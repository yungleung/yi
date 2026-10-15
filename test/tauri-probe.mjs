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
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownFrame } from './probe_stash.mjs';

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
/** Where a run keeps the config it found, so a run that dies can be tidied up after. */
const configSnapshot = join(tmpdir(), 'yi-probe-config.json');
/** And the session it found, for the same reason — see `openTheSession`. */
const sessionSnapshot = join(tmpdir(), 'yi-probe-session.json');
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
/**
 * What this run stamps its own stash with.
 *
 * The bridge gives one script five seconds, and a probe that outlives it keeps running while
 * the harness polls the page for what it stashed. That stash is one slot for the whole page,
 * so a report has to say which run made it: the wrapper below captures this token in its own
 * script's scope — a later run can overwrite the global but not that — and only a frame
 * carrying it is read back (`test/probe_stash.mjs`). Measured without it: a probe that stashed
 * a result three seconds after its own run was over, and a probe that then outlived the bridge
 * and never reported at all, printed the *first* probe's result as recovered and exited 0 —
 * a false pass, which in a sweep is worse than a failure.
 */
const runToken = `${process.pid.toString(36)}-${Date.now().toString(36)}`;
// A probe that loads a document and then reads layout can outlive the
// bridge's budget while the page is still settling. The wrapper stashes the
// result, so a timed-out probe is still readable a moment later.
const wrappedProbe = probe
  ? `(async () => {
  const run = ${JSON.stringify(runToken)};
  window.__probeRun = run;
  window.__probeResult = undefined;
  window.__probeSteps = undefined;
  // Every report this run makes is stamped with it, so a probe that outlives the bridge
  // cannot leave steps a later run would read as its own.
  const report = window.__t.report;
  window.__t.report = (value) => {
    window.__probeSteps = { run, value };
    return report(value);
  };
  window.__probePaths = ${JSON.stringify(probePaths)};
  window.__probeDoc = ${JSON.stringify(documentText)};
  ${documentText === null ? '' : 'await window.__t.load(window.__probeDoc);'}
  const value = await (
${probe}
  );
  window.__probeResult = { run, value };
  return value;
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
      ' && typeof window.__t.app === "function" && typeof window.__t.pdfText === "function"',
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
// Before the language (and before anything else that writes the config): the config this run found
// is written down for a run that may die, and a run that died is tidied up after (`openTheConfig`).
// It is read *here* rather than beside the session below, because `ensureEnglish` writes the
// language into the config — a note written after that would heal a crashed run's language, not the
// reader's.
const previousConfig = await openTheConfig();
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
  // The seams a probe can leave set on the app itself go back before the probe runs:
  // `versioning_use_git`, `export_use_pandoc` and `export_use_curl` are globals in the Rust process,
  // which a page reload does not clear.
  // The page's own stash is *not* cleared here — a run's frames say which run made them
  // (`test/probe_stash.mjs`), and a clear sent in another script raced the probe it was meant
  // to tidy up after.
  await call(
    `(async () => {
       try {
         await window.__TAURI_INTERNALS__.invoke('versioning_use_git', { git: null });
       } catch (error) {
         // A build without the versioning seam has nothing to put back.
       }
       try {
         await window.__TAURI_INTERNALS__.invoke('export_use_pandoc', { pandoc: null });
       } catch (error) {
         // Nor a build without the export seam.
       }
       try {
         await window.__TAURI_INTERNALS__.invoke('export_use_curl', { curl: null });
       } catch (error) {
         // Nor the seam a fetched picture goes through.
       }
       return null;
     })()`
  );
  await holdTheOpener();
  return await call(wrappedProbe, 20000, 'probe');
}

/**
 * Takes the opener's system hand away before the probe runs, and keeps what the app asked it to
 * open in `window.__probeOpenedUrls` (the URL is in the request's own body).
 *
 * The app posts every command through the page's `fetch`, which is the outer edge a probe can
 * reach (`window.__TAURI_INTERNALS__.invoke` is non-writable). It matters because a probe that
 * clicks over prose can land on a link, and the app — rightly — asks the system to open it: the
 * system's browser then takes the front, and every probe after that measures an occluded page
 * (measured: four frame-dependent probes failed at the five-second line while a browser held the
 * front, and passed once the app was in front again — `test/README.md`, "the app's window has to
 * be in front"). A probe that checks the opener itself (`footnote-preview.js`,
 * `link-cmd-click.js`) installs its own stand-in over this one and still sees the call.
 */
async function holdTheOpener() {
  await call(
    `(async () => {
       window.__probeRealFetch = window.__probeRealFetch ?? window.fetch;
       window.__probeOpenedUrls = [];
       window.fetch = async (input, init) => {
         const url = decodeURIComponent(
           typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
         );
         if (!url.includes('plugin:opener')) {
           return await window.__probeRealFetch.call(window, input, init);
         }
         window.__probeOpenedUrls.push({
           url,
           body: typeof init?.body === 'string' ? init.body : String(init?.body ?? '')
         });
         return new Response('null', {
           status: 200,
           headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
         });
       };
       return null;
     })()`,
    8000
  );
}

/**
 * Gives the opener's system hand *back*, once the run is over.
 *
 * The hold above is installed for the probe's own sake — a probe that clicks over prose can land on
 * a link, and the browser that opens then takes the window's front, which makes every probe after it
 * measure an occluded page. What it must not do is outlive the run: this is the app the *reader* is
 * using, and while the hold stands their own ⌘-click on a link asks the stub and no browser ever
 * opens — measured, after a sweep: `String(window.fetch).includes('__probeOpenedUrls')` was true in
 * the running page, and false again one run after this was added.
 *
 * A probe that stands in for the opener itself restores *this* fetch (or its own) when it is done,
 * and the hold is installed again before every run, so nothing here is lost by taking it back.
 */
async function releaseTheOpener() {
  await call(
    `(async () => {
       if (typeof window.__probeRealFetch === 'function') {
         window.fetch = window.__probeRealFetch;
       }
       window.__probeRealFetch = undefined;
       return null;
     })()`,
    8000
  );
}

/** The app's config as its own JSON text, or null when the page cannot answer. */
async function readConfigText() {
  const reply = await call(
    "(async () => JSON.stringify(await window.__TAURI_INTERNALS__.invoke('get_config')))()",
    15000
  );
  return reply.success ? String(reply.data) : null;
}

/**
 * Points the app's config at the fixture workspace, so wikilinks and citations
 * in a probe resolve against the committed notes.
 */
async function useFixtureWorkspace() {
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
}

/**
 * Puts back the config a run that died left behind, and keeps this run's own copy of what it
 * found.
 *
 * A probe changes the app's config: the settings probes do it on purpose, and one that points the
 * app at a folder of its own does it to work at all. The harness puts back what it found once the
 * probe has reported — and none of that happens when the run dies first. Measured, after a sweep
 * whose app had died: `get_config` still named a workspace the fixtures' notes are not in, and five
 * probes that silently depend on the fixtures (`completion-wikilink`, `document-stack`,
 * `document-stack-ask`, `document-stack-restore`, `settings-push-on-open`) failed *identically on
 * `main` and on the branch under test*, on a freshly started app, until the workspace was put back.
 *
 * So the config a run finds is written down before the probe runs and the note is removed when the
 * run is over: a note still there means the run that wrote it never finished, and its config goes
 * back into the app before this run reads anything — with a line saying so, because a reader who
 * changed their own settings after such a crash would otherwise see them revert unexplained.
 */
async function openTheConfig() {
  let left = null;
  try {
    left = readFileSync(configSnapshot, 'utf8');
  } catch {
    left = null;
  }
  if (left !== null) {
    console.error(
      'a run died before it could put the config back: writing back the config from before that ' +
        'run, then measuring with it (' +
        configSnapshot +
        ')'
    );
    await restoreConfig(left);
  }
  const found = (await readConfigText()) ?? left;
  if (found !== null) {
    writeFileSync(configSnapshot, found);
  }
  return found;
}

/** The run is over and the config is back: nothing is left for the next run to tidy up. */
function forgetTheConfig() {
  rmSync(configSnapshot, { force: true });
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

/**
 * Makes the app's *live* session the one its file now holds — the half `restoreSession` cannot do.
 *
 * `restoreSession` puts the *file* back, and the app only reads that file at a start: the session
 * the probes left in memory is the one still on screen, with its current document and its stack. A
 * probe that then opens the note that session already holds is handed nothing — the session answers
 * *already open*, the editor keeps whatever the harness loaded as the starting document, and a probe
 * that exports "the document on screen" exports the wrong one (measured: `export-pandoc-arguments`
 * ran twice in a row exported the demo document's text while `session.current()` named its own note).
 * So the file is read back the way a start reads it (`documentSession.load`), which is what the next
 * probe should be looking at: the reader's own documents, or none — and never the last probe's.
 */
async function reloadSession() {
  await call(
    `(async () => {
       try {
         const { documentSession } = await window.__t.app('/src/services/session.ts');
         await documentSession.load();
       } catch (error) {
         // A page whose helpers are gone has no session to read; the file is what matters.
       }
       return 'session read';
     })()`,
    8000
  );
}

/**
 * Leaves the app with **no** documents open, and the file with the reader's.
 *
 * A probe drives a document of its own: the harness hands it a starting document and the probe loads
 * whatever it needs. A live session that still holds a document therefore fights all of that — the
 * starting document arrives as *already open*, which is a question, and a question card over the
 * page is a probe that measures nothing (measured: a card was up at the start of *every* run once
 * the session was restored into the app rather than cleared, and `typed-text` failed 27 of its
 * checks). So the *empty* session is written and the app is told to read it, and then the reader's
 * own session goes back into the file — which the app does not read again until its next start,
 * where the reader's documents are exactly what it should find.
 */
async function emptyTheAppSession() {
  await writeSessionText(EMPTY_SESSION);
  await reloadSession();
}

/**
 * Puts back the session a run that died left behind, and keeps this run's own copy of what it
 * found — the config's arrangement (`openTheConfig`), for the documents.
 *
 * A probe loads documents into a dev app that is the maintainer's, and the harness puts the session
 * file back once the probe has reported. A run that dies first leaves the probe's documents in the
 * file, and every later run then reads *that* as the reader's session and puts it back — measured
 * after a sweep this harness killed: the file named a versioning probe's note, the app restored it
 * at every start, and the reader's own session was gone.
 */
async function openTheSession() {
  let left = null;
  try {
    left = readFileSync(sessionSnapshot, 'utf8');
  } catch {
    left = null;
  }
  if (left !== null) {
    console.error(
      'a run died before it could put the session back: writing back the session from before that ' +
        'run, then measuring with it (' +
        sessionSnapshot +
        ')'
    );
    await writeSessionText(left);
  }
  const found = await readSessionText();
  if (found !== null) {
    writeFileSync(sessionSnapshot, found);
  }
  return found;
}

/**
 * The reader's own **export settings files**, which a probe may edit: `export-pdf-scripts.js` writes the
 * font line the card gives into the copy the app reads, and puts it back — but a page reload or an app
 * restart in the middle of a run takes that promise with it (measured: a reload while that probe was
 * running left two `mainfont:` lines in the maintainer's own `export.pdf.yaml`). They are the reader's
 * files like the config and the session are, so they are backed up the same way: the app names its paths
 * (`export_kinds`), everything of the shape `export.<kind>.yaml` is read and written down before the
 * probe runs, and a note left behind means a run died and its files go back before this one measures.
 */
const exportSettingsSnapshot = join(tmpdir(), 'yi-probe-export-settings.json');

/** The paths the app itself names for the files it writes. */
async function exportSettingsPaths() {
  const reply = await call(
    `(async () => {
       const kinds = await window.__TAURI_INTERNALS__.invoke('export_kinds');
       return JSON.stringify(
         kinds.kinds.map((kind) => kind.config_path).filter((path) => typeof path === 'string' && path !== '')
       );
     })()`,
    15000
  );
  if (!reply.success) {
    return [];
  }
  try {
    return JSON.parse(String(reply.data));
  } catch {
    return [];
  }
}

/** Puts the files a run that died left behind back, and keeps this run's own copy of what it finds. */
async function openTheExportSettings() {
  let left = null;
  try {
    left = JSON.parse(readFileSync(exportSettingsSnapshot, 'utf8'));
  } catch {
    left = null;
  }
  if (left !== null) {
    console.error(
      'a run died before it could put the export settings back: writing them back, then measuring (' +
        exportSettingsSnapshot +
        ')'
    );
    await restoreTheExportSettings(left);
  }
  const found = {};
  for (const path of await exportSettingsPaths()) {
    try {
      found[path] = readFileSync(path, 'utf8');
    } catch {
      // A file that is not there is not one a probe can have changed.
    }
  }
  if (Object.keys(found).length > 0) {
    writeFileSync(exportSettingsSnapshot, JSON.stringify(found));
  }
  return found;
}

/** The run is over and the files are back: nothing is left for the next run to tidy up. */
function forgetTheExportSettings() {
  rmSync(exportSettingsSnapshot, { force: true });
}

/** Writes each file back as it was read — the reader's own edit, restored exactly. */
async function restoreTheExportSettings(previous) {
  if (!previous) {
    return;
  }
  for (const [path, text] of Object.entries(previous)) {
    try {
      writeFileSync(path, text);
    } catch (error) {
      console.error(`could not put ${path} back: ${error}`);
    }
  }
}

/** The run is over and the session is back: nothing is left for the next run to tidy up. */
function forgetTheSession() {
  rmSync(sessionSnapshot, { force: true });
}

// A probe that needs the workspace open gets it here, once the language is settled (that reloads
// the page, and the workspace is set through it). The config itself was read up top, and goes back
// once the probe has reported, whatever the probe did with it. The session is read up here for the
// same reason: the documents the reader had open are put back whatever the probe did with them.
if (withWorkspace) {
  await useFixtureWorkspace();
}
const previousSession = await openTheSession();
// After the session, before the probe: a probe may edit the reader's export settings, and this run is
// never the one that leaves them changed.
const previousExportSettings = await openTheExportSettings();

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
forgetTheConfig();
// The app is left holding no documents, and the file the reader's own: `emptyTheAppSession`.
await emptyTheAppSession();
await restoreSession(previousSession);
forgetTheSession();
await restoreTheExportSettings(previousExportSettings);
forgetTheExportSettings();
await restoreLanguage(languageBeforeProbing);
await releaseTheOpener();
if (reply.success) {
  reportResult(reply.data);
}

// The page keeps working after the bridge gives up; poll for the stashed result
// while it settles. Only a probe that *finished* — one whose wrapper returned —
// counts as recovered: `__probeSteps` holds whatever the probe reported on the
// way, so treating that as success once hid a probe that threw half-way through.
// And only *this* run's frames count: what is stashed is stamped with the run that
// wrote it, because a probe that outlived the bridge is still running while the next
// probe drives the page, and its report is not the next probe's (measured before this:
// one run printed another's result as recovered and exited 0).
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
  const result = state ? ownFrame(state.result, runToken) : null;
  if (result !== null) {
    // The probe is over however it reported, so the opener's hand goes back here too.
    await releaseTheOpener();
    console.log(
      '(recovered after the bridge timed out; the probe had already run — the bridge gives a ' +
        'script 5 s, so this is what a longer probe always looks like, and the bridge: line ' +
        'below says whether the app was answering while it ran)'
    );
    reportResult(result);
  }
  const steps = state ? ownFrame(state.steps, runToken) : null;
  if (steps !== null) {
    console.error(JSON.stringify(steps, null, 2));
    console.error('(the probe did not finish; the steps above are what it reported)');
    process.exit(1);
  }
}

console.error(JSON.stringify(reply, null, 2));
process.exit(1);
