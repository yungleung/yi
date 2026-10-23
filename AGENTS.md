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
- Every module header says what the file is for, what it may import, and the
  invariant it upholds — `docs/writing-comments.md` has the shape, and
  `test/checks/headers.mjs` fails without it.
- Read `docs/architecture.md` before touching the caret, offsets or source mode —
  those four offset flavours are where the bugs live.
- Prefer a small, well-named module over a large one; if a unit needs a paragraph to
  explain itself, it is doing too much.

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
