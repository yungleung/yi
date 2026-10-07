# Testing

Two layers, plus your eyes. The split is deliberate: anything that is a pure
function of the text is tested without a browser, and anything that depends on the
DOM, the caret or the renderer is tested in the running app.

| Layer | Where | Run it with | Use it for |
| --- | --- | --- | --- |
| Pure checks | `test/checks/*.mjs` | `npm run check` | block splitting, editing rules, source-entry offsets, layering and header scans |
| DOM probes | `test/probes/*.js` | `npm run probe -- test/probes/<name>.js` | caret placement, typing, clicks, scrolling, rendering, source mode |
| Manual | the app | `npm run tauri dev` | anything visual: spacing, fonts, how a widget reads |

## Pure checks

A check bundles one module with [rolldown](https://rolldown.rs/) and asserts on it in
Node — no browser, no app, milliseconds. `test/run-checks.mjs` runs all of them and
exits non-zero on the first failure. Anything rule-shaped belongs here: if you can
write the behaviour as "given this text and this offset, the edit is this", it is a
check, not a probe.

## DOM probes

A probe is one JavaScript expression, evaluated in the running app through the Tauri
MCP bridge by `test/tauri-probe.mjs`. It returns `{ checks, failed }` (or a report
object for a measurement), and it uses the helpers the harness installs
(`window.__t`: `load`, `click`, `key`, `raw`, `blocks`, `caretRect`, `gaps`,
`emptyLines`, `report`, `sleep`). The harness reads that verdict and exits non-zero
when `failed` is not empty, which is what makes `npm run probe:all` count a probe
with a failed check as failed — until 2026-09-25 it only counted probes that *ran*,
so two of them had been failing quietly for a while (`docs/roadmap.md`).

```bash
npm run tauri dev                                   # terminal 1
npm run probe -- --install                          # once per page load
npm run probe -- test/probes/boundary-caret.js      # terminal 2
```

Harness flags:

| Flag | What it does |
| --- | --- |
| `--install` | Installs the probe helpers into the page (do it after every reload). |
| `--reload` | Reloads the editor page. The editor's handlers go stale after many document swaps. |
| `--with-doc FILE` | Loads a markdown file into the editor before the probe runs. |
| `--fixture REL` | The same, resolved inside `test/fixtures/workspace/`. |
| `--with-workspace` | Points the app's config at the fixture workspace (so wikilinks and citations resolve) and restores the previous config afterwards. |

### Rules that save you time

- **`raw()` leaves the document selected.** Reading the whole text is Select All + Copy, and the app
  paints the selection a moment after the command — so a probe that reads the document and then
  types *without clicking* replaces the whole document with what it typed (measured: `raw()` then
  `t.key('x')` leaves `'x'`). It is the app behaving as any editor does over a live selection, not a
  bug: click the line you mean to type in first, as a reader would. `click-away-deselects.js` holds
  the pair — a selection is live after Select All, and a click outside takes it away.
- **Editing a probe reloads the page** (Vite watches the repo). Wait ~10 s after
  editing before running it, or the probe runs against a half-loaded page.
- **Two writes to one source file in the same moment leave Vite serving the first
  transform** — its cache key is the file's mtime — and a page reload keeps serving
  it, so the app runs a module the file on disk no longer holds. `touch` the file,
  then `npm run probe -- --reload`. A probe reporting something impossible (a
  `ReferenceError` for a function you just wrote) is usually this, not the app.
- **The bridge gives one script 5 s** (measured: a 3 s probe answers, a 6 s one is cut
  off at ~5005 ms). A probe that outlives it still leaves its last `t.report(...)` in
  `window.__probeSteps`, and the harness prints it as *"recovered after the bridge timed
  out"* — a result, not a failure, and not the app being slow: the `bridge: …` line the
  harness prints beside it says what the app's own calls cost (median ~3 ms on an idle
  app, whatever the probe's length). Split a probe that needs longer than 5 s, or make
  its rounds cheaper; `test/probes/load-cost.js` is the probe that says whether the app
  itself has started to cost more.
- **A `bridge:` line with a seconds-long *median* is an open native menu.** Nothing is
  slow: the webview is blocked, and the menu it is blocked on cannot be closed by a
  script. The tell is the probe's own time beside it (small) against the calls (seconds
  apiece), and the culprit is the probe *before*: one that right-clicked. It must carry
  `@needs-foreground-window` so `probe:all` skips it — `probe-markers.mjs` fails until it
  does, and `table-menu-open.js` is why that check exists.
- Probes are one per page load when they depend on the demo document: use `--reload`
  between them, or `--with-doc`/`--fixture` to load what they need.
- **A probe cannot stand in for the app's IPC.** `window.__TAURI_INTERNALS__` and
  its `invoke`, `ipc` and `postMessage` are defined non-writable and
  non-configurable, so assigning over them fails silently and the probe records
  nothing. Every command is posted with the page's `fetch` to
  `ipc://localhost/<cmd>` (percent-encoded, e.g. `ipc://localhost/plugin%3Aopener%7Copen_url`),
  so wrap `window.fetch`, record what you need, answer the command yourself, and
  restore the original in a `finally` — `test/probes/footnote-preview.js` does this to
  check a link is opened by the app without opening a browser.
- **A synthetic key cannot type into a `contenteditable`.** An untrusted key event does
  not insert text, so a probe that drives an inline edit types the way the browser does:
  `document.execCommand('insertText', false, 'X')` after focusing the element and setting
  the selection — `test/probes/tree-rename.js` does exactly that.
- **A native menu and a native dialog cannot be driven by a probe** (nor read: nothing can
  choose an item of one but a person). Their *contents* belong in a pure model with a Node
  check (`check-table-menu.mjs`, `check-tree-menu.mjs`), the *actions* behind them are
  functions a probe runs directly (`runCommand`, `tree_ops.ts`), and the popup or the
  question itself is a person's check — say so where the model is checked.

## The fixture workspace

`test/fixtures/workspace/` is a committed notes folder: the demo document, a
two-entry bibliography, the notes the demo document links to, a math-heavy note and
a 323 KB note. Probes that need it say `@needs-workspace` in their header, are
skipped by `npm run probe:all`, and are run by name with `--with-workspace`. The
README in that folder records what each file is for and its licence; `npm run
fixtures` refreshes the copies from your own notes folder.

**The fixture is a test's, never the reader's.** The app you develop against is the maintainer's
own: its config names their workspace, their bibliography and their layout, and its session holds
the documents they had open. So a run that points it at this folder — or at a folder a probe made —
backs both up before it starts and puts both back when it ends. `--with-workspace` already does the
config half (`test/tauri-probe.mjs` snapshots `get_config` and writes it back afterwards), and the
session half is the probe's own: read `loadSessionText` before, put it back with `saveSessionText`
in the probe's `finally` (`src/api/session.ts`), or the reader's next start restores the tests'
documents over the ones they had. A fixture is disposable *as a fixture* — `npm run fixtures`
refreshes it from the maintainer's notes — while the reader's own folder is never a test's.

## Adding a test

1. Rule-shaped? `test/checks/check-<area>.mjs`: bundle the module, assert, print
   `all checks passed` or the failures.
2. Behaviour in the app? `test/probes/<area>.js`: header with what it covers
   (`@covers`, `@fixture`, `@needs-workspace`), a single expression, `checks` and
   `failed` in the result.
3. Either way: run it, watch it fail without your change, then make it pass. A test
   written after the fix proves nothing.
