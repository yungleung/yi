# Agent instructions for this repository

These are the rules an AI agent should follow here. `docs/ai-context.md` is the full
brief — read it first; this file is the short version and the non-negotiables.

## Test with the app, not just the compiler

- Drive the running app through the Tauri MCP bridge: `npm run tauri dev` in one
  terminal, `npm run probe -- test/probes/<name>.js` in another. The harness is
  `test/tauri-probe.mjs`; a probe is a single expression returning
  `{ checks, failed }` and using the helpers in `test/probes/lib.js`.
- **Restart the app after creating a branch.** The dev app is a running process holding the
  modules it loaded; a branch change swaps the files under it, and what answers a probe is then
  some mixture of the two. Restart `npm run tauri dev` on the new branch and only then measure —
  a probe run against a stale app says nothing about the branch.
- `npm run check` covers pure rules in Node and must stay green; the probes cover
  what a compiler cannot see (caret placement, typing, scrolling, rendering).
- Measured, a long-running dev app does not degrade: over a whole suite (~15 minutes,
  76 probes) a load of the 314 KB fixture note stayed at ~330 ms and a bridge call at
  ~3 ms (`test/probes/load-cost.js` reports both, and the harness prints its own
  `bridge: …` line per run). What looks like decay is the bridge's **5 s** budget for
  one script: a longer probe is cut off and recovered from its stash, and the harness
  says so. Split a probe that needs longer; restarting the app is not the fix.
- Setting the bridge up from scratch — the MCP server and CLI that drive the app,
  and the skills this project uses — is `README.md` → *AI agents*.
- **The fixture workspace is a test's, never the reader's.** A dev app holds the maintainer's
  config (their workspace, their bibliography) and their session (the documents they had open), so a
  run that points it at the fixtures backs both up first and restores both afterwards —
  `get_config`/`set_config` for the config (`--with-workspace` does this for you) and
  `loadSessionText`/`saveSessionText` (`src/api/session.ts`) for the session, which nothing else
  does — and a probe that writes works in a folder of its own under `$HOME`.

## Design rules

- Keep the layers honest: no DOM in the syntax modules, no reaching upwards.
- One fact has one home; if you find the same rule twice, merge it and say so.
- Apply SOLID boundaries and established design patterns when they clarify ownership or remove real
  duplication. Do not add a pattern, wrapper, or abstraction only for ceremony.
- Design for change: a module should have one reason to change, expose the smallest stable interface
  its consumers need, and depend on a named port rather than reaching across feature boundaries.
- Prefer composition and explicit dependencies over inheritance, hidden globals, mode flags, and
  cross-feature imports. Small focused modules are better than large files with several jobs.
- Keep commands, events, and state distinct. Commands are typed requests for work; events are typed
  facts emitted after authoritative state changes; the state owner remains the source of truth.
- New UI, built-in-AI, and MCP actions must use the same command contract. Do not add a second
  editing API. Normal typing and IME input stay on the synchronous text path, and same-window facts
  do not make an unnecessary round trip through Tauri.
- Design a new feature by naming its state owner, command inputs and results, emitted facts,
  permissions, failure modes, and tests before implementing it. Avoid speculative generic layers.
- Refactorings preserve behaviour unless the task explicitly asks for a behaviour change. Prove
  the boundary with a focused test first, then run the affected app probes.
- When writing a method or function, include a compact concrete example whenever it can explain the
  purpose or contract more clearly than prose alone. Show an input and result, a before-and-after
  state, or a failure it prevents. Do not leave a maintainer with only a restatement of the goal.
  Skip examples only when the function is genuinely obvious without one.
- Every module header says what the file is for, what it may import, and the
  invariant it upholds — `docs/writing-comments.md` has the shape, and
  `test/checks/headers.mjs` fails without it.
- Read `docs/architecture.md` before touching the caret, offsets or source mode —
  those four offset flavours are where the bugs live.
- Prefer a small, well-named module over a large one; if a unit needs a paragraph to
  explain itself, it is doing too much.
- Organize modules by owned domain and capability. A folder must represent shared state,
  lifecycle, an operation family, or a provider/consumer boundary; do not create generic
  `shared/`, `utils/`, `misc/` or `common/` folders.
- A domain exposes one explicit public entrypoint (`index.ts` or Rust `mod.rs`) with named exports.
  Do not add wildcard facade exports or compatibility barrels.
- Do not repeat the parent domain in a child filename: `session/model.ts`, not
  `session/session_model.ts`. Role names such as `model`, `rules`, `state`, `contracts`, `dialog`
  and `flow` are encouraged when they explain ownership.
- Cross-domain consumers import the public domain entrypoint. Deep imports belong to the owning
  domain or a test that deliberately targets an internal rule.
- Keep the approved stable facades (`src/api/*`, `src/commands/*`,
  `src/ui/markdown/markdown_editor.ts`, the two entrypoints and Rust command paths) intentional;
  move their internals without creating a second old-path API.

The approved command/event architecture and its phased migration are described in
`docs/superpowers/specs/2026-10-31-human-maintainable-command-event-architecture-design.md`.
Until each phase lands, follow that contract for new code and do not create a parallel registry,
event vocabulary, or editing API.

## Working style

- **Never commit to `main`.** Every change is made on a branch of its own — `codex/<slug>`
  unless told otherwise — and lands on `main` by a merge, so a feature or a fix is
  reviewable as one thing and `main` only ever moves by a merge.
- **Never merge without being asked.** Committing is part of the work: write the change, prove
  it, and commit it on the branch. Landing it on `main` is the maintainer's call — a merge waits
  for them to ask for it, in that turn. What is reported before that is what changed, which test
  fails without it, and what was measured.
- **Prove the final tree once.** Before a merge, run `npx tsc --noEmit`, `cargo test`,
  `npm run check`, and the probes affected by the change. Run `npm run probe:all` when the
  tree to be merged has not already passed it — especially after `main` moved, a conflict,
  or a dependency, toolchain, capability or bridge change. A new merge commit does not justify
  repeating the full suite when its tree hash is the one that already passed.
- Behaviour changes need a test that fails without them; say which one proves it.
- Commit style: `type(scope): subject`, lower case, imperative.
- Update `docs/ai-context.md` when a rule, path or command changes — it is the entry
  point for the next agent.
