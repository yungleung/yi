# The Stale Highlight, Measured

**Goal:** give the raw-block decision its numbers. P24 built the write that re-renders a code
block's markup in place and measured it out (31 ms against the rebuild's 25). The other shape
is to write the character into the text node *inside* the highlighted span — the plain write's
own 0–1 ms patch — and let the highlight be refreshed when the burst stops, the way the
deferred check already parses once a burst. That would take a keystroke in a 4.7 KB code block
from 25–34 ms to about one millisecond, and cost this: while a burst is running, the colours
are the ones the *previous* text produced. Whether that is visible is measurable, and this
phase measures it — in the running app, with the app's own highlighter, without changing any
editor code.

**Architecture:** one probe. It patches the text node a fast path would patch (by hand, in the
page), times that, then compares the element it left with a render of the same document by the
app's own block factory — the same comparison the renderer's own refusals are built on — and
reports how many characters of the visible text carry the wrong styling, and what the
repair would cost when the burst ends.

**Spec:** P24's handoff (`2026-09-25-code-you-can-type-into.md`), and the last item of
`docs/roadmap.md`'s "Measure before deciding".

## Global Constraints

- **No editor code changes.** The write is simulated in the page; the app is only read.
- The comparison is against the app's own renderer (`create_block.ts`), not against
  highlight.js called directly: what a fresh render *would* produce is the app's answer.
- The probe reports; the decision is the user's. (If it says ordinary typing is invisible and
  only token-changing characters show, the recommendation is to build it; if it says
  ordinary typing shows too, the residue stays accepted.)
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green on a
  freshly started app.

---

## Part 1 — what the probe measures

Per case: a character typed at the middle of a word, in a small JS block with an identifier,
a string, a comment and a number.

| Report | How |
| --- | --- |
| `writeMs` | the patch of the text node plus one height read — what a fast path would do |
| `identical` | whether the patched element's markup equals a fresh render of the same document |
| `staleCharacters` | how many characters of the visible text are styled differently from that fresh render |
| `where` | the first character that differs, with the two class chains, so a reader can see it |
| `repairMs` | the detached build of the edited block — what the burst's end would pay once |

Cases: a letter in an identifier, in a string, in a comment; a digit in an identifier; a quote
inside an identifier; a backtick inside a string; a slash that turns the line into a comment.
The first four should be invisible (the token they land in does not change), the last three
should not.

## Part 2 — tasks

### Task 1: the probe

**Files:**
- Add: `test/probes/code-local-write.js`
- Modify: `test/README.md` (the count and the name)

```bash
npm run probe -- --fixture default-document.md test/probes/code-local-write.js
```

### Task 2: the recommendation, in the roadmap

**Files:**
- Modify: `docs/roadmap.md` (the last item of "Measure before deciding")

### Task 3: Acceptance, handoff, merge

```bash
npx tsc --noEmit
npm run check                                   # 22/22 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 77/77 probes, 7 skipped
```

```bash
git add docs/roadmap.md test/probes/code-local-write.js test/README.md \
  docs/superpowers/plans/2026-09-25-the-stale-highlight.md
git commit -m "test(typing): what a local write into highlighted code would cost"
git checkout main
git merge --no-ff codex/local-write-measured -m "merge: the stale highlight, measured (typing)"
git rev-parse HEAD^{tree} codex/local-write-measured^{tree}   # must be equal
```
