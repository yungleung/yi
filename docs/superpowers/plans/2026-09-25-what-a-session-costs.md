# What a Session Costs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** replace a belief with a measurement. `docs/ai-context.md` and `AGENTS.md` both
say a dev app left running for hours degrades — "document loads go from ~0.3 s to ~10 s and
probes time out" — and every phase since has been written against that fear (restart the
app before blaming a probe). Measured, it is not what happens.

**Architecture:** no editor code changes. A probe measures the app's own cost per load over
a session, the harness reports what its own calls cost, and the harness stops leaving a
timed-out probe's script running in the page — which is what actually makes the *next* call
slow, because the bridge runs one script at a time.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** the "measure before deciding" column of `docs/roadmap.md`, and the warning in
`docs/ai-context.md`.

## Global Constraints

- The measurement is a probe (`test/probes/load-cost.js`) and a line the harness prints —
  no editor behaviour changes, so nothing in the acceptance protocol moves.
- What is written down must be what was measured, with the documents and the run lengths
  named: no more "hours" folklore.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green on a
  freshly started app.
- Commit style: `test(…): …`, `fix(…): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — what was measured

The 323 KB fixture note, on one app instance, kept running throughout:

| Measurement | Fresh app | After a whole suite (~15 min, 76 probes) |
| --- | --- | --- |
| Load, 8× the same 314 266-character note | 334/331/332/331/336/332/329/324 ms | 325/325/319/326/323/323/325/350 ms |
| DOM after each load | 27 mounted blocks, 1 root, 1 caret | the same, every round |
| A fresh state's first-block parse | 2/1/2 ms | 5/3/3 ms |
| 120 bridge round trips, no probe running | median 2.9 ms, p90 4.1 ms, 0 failed | median 2.9 ms, p90 3.9 ms, max 59 ms, 0 failed |

Flat, in both directions, over a session long enough to span a whole suite. What is *not*
flat is the tail of a *probe run*: on the same app, `load-cost.js`'s own run reported
`bridge: 4 calls, median 54.3 ms, max 3143 ms`, and `block-rebuild-cost.js`
`bridge: 5 calls, median 8.4 ms, max 5015.4 ms, 1 failed` — a call waiting **seconds**.

The reason is in the harness's own history: a probe that outlives the bridge's budget
(`execute_js` is cut off at 20 s) leaves its script *running in the page*, and the bridge
runs one script at a time, so the next call queues behind it. Every probe after a slow one
pays for it, which is exactly "the app got slow"; the app was never slow. The
"recovered after the bridge timed out; the probe had already run" note, the stale result
the harness once printed for a *previous* probe, and the probe that timed out late in a
suite are all the same mechanism.

## Part 2 — the design

1. **`test/probes/load-cost.js`** (new): eight loads of the document the runner gave, the
   mounted/root/caret counts after each, and a fresh state's first-block parse for
   attribution. `@needs-large-document`, so the suite runs it against the 323 KB note.
2. **The harness says what its calls cost**: `test/tauri-probe.mjs` times each call and
   prints one line after the probe's result —
   `bridge: 12 calls, median 3.1 ms, max 61 ms`. A stalled call is then visible in the
   probe's own output instead of being blamed on the app.
3. **The harness cleans up after a timeout**: before exiting on the timeout path (either
   way — recovered or not), it reloads the page, so the lingering script cannot make the
   *next* probe slow. The next harness installs the helpers again if it has to (`--install`
   is already automatic when they are missing).
4. **The docs stop saying "hours"**: `docs/ai-context.md`'s warning and `AGENTS.md`'s line
   carry the measured numbers and the real failure mode.

---

## Part 3 — tasks

### Task 1: the two measurements

**Files:**
- Add: `test/probes/load-cost.js`
- Modify: `test/tauri-probe.mjs`
- Modify: `test/README.md` (the count and the new name)

**Interfaces:**

- Produces: the probe's report (`loadMs`, `loadMedian`, `loadGrowth`, `parseMs`, `sizes`)
  and the harness's trailing `bridge: …` line.

- [x] **Step 1: The probe** (as implemented; header rewritten around what it measures and
  why the trend, not the level, is the claim).

- [x] **Step 2: The harness line**, printed from an `exit` hook so every path carries it,
  and counted per call with the connect time folded in.

```bash
npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
  test/probes/load-cost.js
```

- [x] **Step 3: Commit**

```bash
git add test/probes/load-cost.js test/tauri-probe.mjs test/README.md
git commit -m "test(probes): what a load costs, and what the bridge costs"
```

### Task 2: the harness cleans up after a timeout

**Files:**
- Modify: `test/tauri-probe.mjs`

- [x] **Step 1: Reload on the timeout path**

One helper, called before each exit on the timeout path: `location.reload()` through the
bridge, best effort (a short timeout, errors ignored), with a comment saying why — the
script the bridge gave up on is still running, and the next call would queue behind it.

- [x] **Step 2: Prove it**

Run a probe that deliberately outlives the budget (a scratch file in `/private/tmp` that
sleeps past 20 s), then a normal probe, and check the harness's `bridge:` line for the
second one: with the reload it is milliseconds; without it, seconds.

```bash
node test/tauri-probe.mjs /private/tmp/yi-slow-probe.js     # times out
npm run probe -- --fixture default-document.md test/probes/load-cost.js
```

- [x] **Step 3: Commit**

```bash
git add test/tauri-probe.mjs
git commit -m "fix(probes): a timed-out probe reloads the page"
```

### Task 3: Acceptance, docs, handoff

- [x] **Step 1: The docs**

`docs/ai-context.md` (the warning under "Before claiming a change works") and `AGENTS.md`
(the same sentence) get the measured numbers and the real failure mode;
`docs/roadmap.md` records the measurement under "measure before deciding".

- [x] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 21/21 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 76/76 probes, 6 skipped
```

And, in the suite's output, the `bridge:` lines: none of them should show a call waiting
seconds (that is the acceptance for the reload helper).

- [x] **Step 3: The handoff, and the commit**

```bash
git add docs/ai-context.md AGENTS.md docs/roadmap.md \
  docs/superpowers/plans/2026-09-25-what-a-session-costs.md
git commit -m "docs: close the session cost handoff"
```

- [x] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/session-cost -m "merge: what a session costs, measured (probes)"
git rev-parse HEAD^{tree} codex/session-cost^{tree}   # must be equal
```

Keep the branch, and report the tree hash.

---

## Handoff — what this phase left

**The app does not get slower while it stays open; a probe can be longer than the bridge
allows, and that is what "probes time out" always was.** Two entry-point files carried the
opposite as advice; both now carry the measurement.

### What was measured

The 323 KB fixture note, one app instance kept running for the whole comparison:

| Measurement | Fresh app | After a whole suite (~15 min, 76 probes) |
| --- | --- | --- |
| Load, 8× the 314 266-character note | 334/331/332/331/336/332/329/324 ms | 325/325/319/326/323/323/325/350 ms |
| What the page mounted | 27 blocks, 1 root, 1 caret | the same, every round |
| A fresh state's first-block parse | 2/1/2 ms | 5/3/3 ms |
| Bridge round trips, no probe running | 120: median 2.9 ms, p90 4.1 ms, 0 failed | 120: median 2.9 ms, p90 3.9 ms, max 59 ms, 0 failed |

Flat, both ways. The last row was measured with a scratch script, not a probe, because a
probe's own length is part of what it reports.

### The budget that actually bites

Measured with three scratch probes: a script that sleeps 3 s answers, one that sleeps 6 s
is cut off at **~5005 ms**, and so is one that sleeps 8 s. The bridge gives a script 5 s.
The harness waits 20 s and then polls for the stash, which is why a longer probe still
*reports* — as `recovered after the bridge timed out` — and why the phase notes that read
like app decay were really a probe outliving that budget.

In a full suite this is not rare: **nine** probes are cut off that way and recovered —
`block-rebuild-cost`, `display-math-source`, `edit-cost`, `inline-math-source`,
`paste-blocks`, `revealable-flows`, `typed-text`, `undo-run-taken-back`,
`undo-selection-return` — every one of them a probe that sleeps a lot, with the app's own
calls at a 6–12 ms median while it happens. Before this phase that was invisible: a probe
that took 5.0 s and one that took 30 s looked the same.

### What was added

- `test/probes/load-cost.js`: eight loads of the document the runner gave, what the page
  has mounted after each, and a fresh state's first-block parse. `@needs-large-document`,
  so the suite runs it against the 323 KB note. The trend is the claim.
- The harness prints, per run,
  `bridge: 4 calls, median 8.6 ms, max 54.2 ms, 1 failed; the probe itself 5018 ms` — the
  bridge's own calls and the probe's life separated, because the call that carries a probe
  holds the whole probe. A stalled call is now visible in a probe's own output.
- The harness's recovery note says the budget out loud, and `docs/testing.md` carries it
  with how to respond: split a probe that needs longer than 5 s.
- `docs/ai-context.md` and `AGENTS.md`: the "hours / 10 s loads" warning is replaced by the
  numbers above and by what to actually do when a probe "times out".

### The one outlier, for the next phase

`table-picker-insert.js` is the only probe whose *infrastructure* calls are slow: in the
acceptance suite `bridge: 7 calls, median 8005.8 ms, max 9504.2 ms, 5 failed; the probe
itself 1328 ms`. Its own script is 1.3 s — the app stopped answering the *bridge* for
eight to nine seconds around it. Recorded in `docs/roadmap.md` rather than chased here:
the harness line is what made it visible, and it wants a measurement of its own (the
picker panel and the table it inserts are the only things that probe does).

### Evidence

- `npx tsc --noEmit` clean; `npm run check` **21/21**.
- A freshly started app and `npm run probe:all`: **76/76 probes, 6 skipped**, with 85
  `bridge:` lines and only the nine budget cut-offs plus the picker outlier among them.
