# Agent instructions for this repository

These are the rules an AI agent should follow here. `docs/ai-context.md` is the full
brief — read it first; this file is the short version and the non-negotiables.

## Test with the app, not just the compiler

- Drive the running app through the Tauri MCP bridge: `npm run tauri dev` in one
  terminal, `npm run probe -- test/probes/<name>.js` in another. The harness is
  `test/tauri-probe.mjs`; a probe is a single expression returning
  `{ checks, failed }` and using the helpers in `test/probes/lib.js`.
- `npm run check` covers pure rules in Node and must stay green; the probes cover
  what a compiler cannot see (caret placement, typing, scrolling, rendering).
- A dev app left running for hours degrades (document loads go from ~0.3 s to
  ~10 s and probes time out). Restart it before blaming a probe.

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

- Behaviour changes need a test that fails without them; say which one proves it.
- Commit style: `type(scope): subject`, lower case, imperative.
- Update `docs/ai-context.md` when a rule, path or command changes — it is the entry
  point for the next agent.
