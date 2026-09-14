/**
 * Runs a probe script inside the running editor through the Tauri MCP bridge.
 *
 * Usage: node scripts/tauri-probe.mjs --install     (once per page load)
 *        node scripts/tauri-probe.mjs scripts/probes/<name>.js
 *        node scripts/tauri-probe.mjs --reload      (reload the editor page)
 *
 * The probe is a plain script evaluated in the webview; it may return a value
 * (or a promise) which is printed as JSON. Helpers are installed separately
 * (`--install`), so every probe is sent verbatim.
 */
import { readFileSync } from 'node:fs';

const argument = process.argv[2];
if (!argument) {
  console.error('usage: node scripts/tauri-probe.mjs <probe.js> | --install | --reload');
  process.exit(2);
}

// The bridge evaluates the script it is given and only reports a value when
// that script is one expression; anything else falls back to a slow path that
// can outlive the bridge's budget. So the helpers are installed once, on their
// own, and every probe is sent verbatim and written as a single expression,
// e.g. `(async () => ({ ... }))()`. The editor's event handlers also go stale
// after many document swaps, which is what `--reload` is for.
const installing = argument === '--install';
const reloading = argument === '--reload';
const probe = installing || reloading ? null : readFileSync(argument, 'utf8');
// A probe that loads a document and then reads layout can outlive the
// bridge's budget while the page is still settling. The wrapper stashes the
// result, so a timed-out probe is still readable a moment later.
const wrappedProbe = probe
  ? `(async () => { window.__probeResult = undefined; window.__probeSteps = undefined; window.__probeResult = await (\n${probe}\n); return window.__probeResult; })()`
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

// Clear any earlier probe's stash first, so a timed-out run can never be
// mistaken for the previous one's result.
await call('window.__probeResult = undefined; window.__probeSteps = undefined; null');
const reply = await call(wrappedProbe);
if (reply.success) {
  console.log(JSON.stringify(reply.data, null, 2));
  process.exit(0);
}

// The page keeps working after the bridge gives up; poll for the stashed
// result while it settles.
for (let attempt = 0; attempt < 6; attempt += 1) {
  await sleep(4000);
  const recovered = await call('window.__probeResult ?? window.__probeSteps ?? null', 8000);
  if (recovered.success && recovered.data !== null && recovered.data !== undefined) {
    console.log(JSON.stringify(recovered.data, null, 2));
    console.log('(recovered after the bridge timed out; the probe had already run)');
    process.exit(0);
  }
}

console.error(JSON.stringify(reply, null, 2));
process.exit(1);
