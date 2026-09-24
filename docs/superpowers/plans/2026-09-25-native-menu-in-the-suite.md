# The Native Menu a Probe Leaves Open

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the one real stall P21 found. `table-picker-insert.js` reported
`bridge: 7 calls, median 8005.8 ms, max 9504.2 ms, 5 failed` in the acceptance suite — the
app stopped answering the *bridge* for eight to nine seconds, while the probe's own script
took 1.3 s. Run alone, the same probe is `median 8.8 ms`.

**The cause is the probe before it.** `table-menu-open.js` right-clicks a table cell, which
opens the table's **native** context menu, and a native menu blocks the webview until
something closes it — which a scripted run cannot do. Its sibling `table-menu.js` does the
same thing and carries `@needs-foreground-window`, so `probe:all` skips it and says why:
*"it opens the table menu, which a scripted run cannot close"*. `table-menu-open.js` makes
the same promise and has no marker, so the suite runs it and every probe after it pays.

**Fix:** the marker, the check that would have caught the omission, and the rule written
down where the next author of a probe will look.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** P21's handoff and the picker entry in `docs/roadmap.md`.

## Global Constraints

- Nothing in the editor changes: this is the probe suite's own hygiene.
- `npm run check` gains the check and stays green; `npm run probe:all` keeps its numbers
  (76/76, 6 skipped → 7 skipped) and loses the stall.
- Commit style: `fix(probes): …`, `test(checks): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — the design

1. **The marker.** `table-menu-open.js` gets `@needs-foreground-window` in its header, with
   the same sentence its sibling carries. `run-probes.mjs` already skips on that string, so
   the suite stops opening the menu; the probe is still runnable by name with the window in
   front, which is what it is for (its header says the screenshot script captures what is
   on screen).
2. **The check.** `test/checks/probe-markers.mjs`: a probe that dispatches a `contextmenu`
   event opens a native menu, so it must carry `@needs-foreground-window`. It reads the
   probes' sources, the way `headers.mjs` reads the modules', and it fails today on
   `table-menu-open.js` — which is the point of adding it.
3. **The rule.** `docs/testing.md`'s "Rules that save you time" gains the symptom: a
   `bridge:` line whose *median* is seconds while the probe's own time is small means a
   native menu is open — nothing is slow, the webview is blocked — and the fix is the
   marker, not a restart.

---

## Part 2 — tasks

### Task 1: the marker, and the check that would have caught it

**Files:**
- Modify: `test/probes/table-menu-open.js`
- Add: `test/checks/probe-markers.mjs`
- Modify: `test/README.md` (the check count in the pure-checks table)

- [x] **Step 1: The check, failing**

Write `probe-markers.mjs` first and run it: it must fail on `table-menu-open.js`.

- [x] **Step 2: The marker**

Its header gains `@needs-foreground-window` (and the reason, in the header's own voice).
`npm run check` then passes.

- [x] **Step 3: The docs rule**

`docs/testing.md`: the symptom and what it means.

- [x] **Step 4: Commit**

```bash
git add test/probes/table-menu-open.js test/checks/probe-markers.mjs test/README.md docs/testing.md
git commit -m "fix(probes): the probe that leaves a native menu open is marked"
```

### Task 2: Acceptance, roadmap, handoff

- [x] **Step 1: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 22/22 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 76/76 probes, 7 skipped
```

And the `bridge:` lines: no probe should show a multi-second *median* any more (the nine
5 s budget cut-offs stay — they are probes that sleep, not stalls).

- [x] **Step 2: The docs**

`docs/roadmap.md`: the picker entry closes with what it was.

- [x] **Step 3: The handoff, and the commit**

```bash
git add docs/roadmap.md docs/superpowers/plans/2026-09-25-native-menu-in-the-suite.md
git commit -m "docs: close the native menu handoff"
```

- [x] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/native-menu-probe -m "merge: the native menu a probe leaves open (probes)"
git rev-parse HEAD^{tree} codex/native-menu-probe^{tree}   # must be equal
```

Keep the branch, and report the tree hash.

---

## Handoff — what this phase left

**The stall was never the picker.** P21's outlier is closed, and the cause was one missing
marker in the probe before it.

### What it was

`table-menu-open.js` right-clicks a table cell, which opens the table's **native** context
menu. A native menu blocks the webview until something closes it, and a scripted run
cannot — its sibling `table-menu.js` does the same thing and says so in its header
(*"the table menu, which a scripted run cannot close"*), carrying
`@needs-foreground-window` so `probe:all` skips it. `table-menu-open.js` had the same
behaviour and no marker, so the suite ran it, and `table-picker-insert.js` — the probe
after the *skipped* sibling — paid: `bridge: 7 calls, median 8005.8 ms, max 9504.2 ms,
5 failed` while its own script took 1.3 s.

Run alone, the picker probe was always fine (`median 8.8 ms`), which is what sent the
first look at the picker itself.

### What changed

- `table-menu-open.js` carries `@needs-foreground-window`, with the reason beside it. It is
  still runnable by name with the window in front, which is what it is for — its header
  says the screenshot script captures what is on screen.
- `test/checks/probe-markers.mjs` (new, the 22nd check): a probe that builds a
  `contextmenu` MouseEvent must carry that marker, or the check fails and says what would
  happen. It read 0 probes at first — my pattern matched `dispatchEvent(new MouseEvent(…))`
  and both probes build the event first — so the check itself was measured against the two
  probes it is about: it fails on `table-menu-open.js` and passes once the marker is there.
- `docs/testing.md`: the symptom, in the rules that save time. A `bridge:` line with a
  seconds-long *median* and a small probe time means an open native menu — nothing is slow,
  the webview is blocked — and the fix is the marker, not a restart.

### Evidence

- `npx tsc --noEmit` clean; `npm run check` **22/22**.
- A freshly started app and `npm run probe:all`: **75/75 probes, 7 skipped** (the picker's
  neighbour is now one of the skipped), with **no bridge line above a 100 ms median** —
  `table-picker-insert.js` is `bridge: 3 calls, median 6.2 ms, max 53.9 ms; the probe
  itself 1331 ms`, against `median 8005.8 ms` in P21's run.
- The nine probes whose own script crosses the bridge's 5 s budget are unchanged and still
  recovered (`1 failed`, `the probe itself ~5007 ms`) — that is P21's finding, not a stall.
