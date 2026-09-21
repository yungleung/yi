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
`emptyLines`, `report`, `sleep`).

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

- **Editing a probe reloads the page** (Vite watches the repo). Wait ~10 s after
  editing before running it, or the probe runs against a half-loaded page.
- **Two writes to one source file in the same moment leave Vite serving the first
  transform** — its cache key is the file's mtime — and a page reload keeps serving
  it, so the app runs a module the file on disk no longer holds. `touch` the file,
  then `npm run probe -- --reload`. A probe reporting something impossible (a
  `ReferenceError` for a function you just wrote) is usually this, not the app.
- A probe that outlives the bridge's budget still leaves its last `t.report(...)` in
  `window.__probeSteps`; the harness prints it as *"recovered after the bridge timed
  out"*. That is a result, not a failure — but check the app is fresh, because a
  long-running dev app gets slow and makes every probe look broken.
- Probes are one per page load when they depend on the demo document: use `--reload`
  between them, or `--with-doc`/`--fixture` to load what they need.

## The fixture workspace

`test/fixtures/workspace/` is a committed notes folder: the demo document, a
two-entry bibliography, the notes the demo document links to, a math-heavy note and
a 323 KB note. Probes that need it say `@needs-workspace` in their header, are
skipped by `npm run probe:all`, and are run by name with `--with-workspace`. The
README in that folder records what each file is for and its licence; `npm run
fixtures` refreshes the copies from your own notes folder.

## Adding a test

1. Rule-shaped? `test/checks/check-<area>.mjs`: bundle the module, assert, print
   `all checks passed` or the failures.
2. Behaviour in the app? `test/probes/<area>.js`: header with what it covers
   (`@covers`, `@fixture`, `@needs-workspace`), a single expression, `checks` and
   `failed` in the result.
3. Either way: run it, watch it fail without your change, then make it pass. A test
   written after the fix proves nothing.
