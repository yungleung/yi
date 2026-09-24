# Accepted, For Now

**Goal:** make the roadmap's ledger agree with the phase handoffs. `docs/roadmap.md`'s open
list says it is empty — every *leftover* is closed — but three things were still only in
handoffs: two residues the plain-edit phase named and P18's note about the description-list
line reader. They are decisions taken, not work forgotten, so they get a section of their own
("Accepted, for now") rather than an entry in a list that would then never empty.

**Architecture:** documentation, plus one probe change — and the probe change is the phase's
real content, because writing a residue down means measuring it first.

**Spec:** `docs/roadmap.md`, and P17's handoff (`2026-09-24-punctuation-in-plain-edits.md`).

## What was measured, and what it corrected

P17's handoff named two residues in one sentence: a caret at the very start of a list item's
or a heading's text goes the ordinary path, and a table cell's text is plain only away from
its edges. Measured on a fresh app, typing one letter at each of those places:

| Case | Path | Cost |
| --- | --- | --- |
| list item, at the start of its text | **fast** | 2 ms |
| heading, at the start of its text | **fast** | — |
| table cell, at the start of its text | **ordinary** | 10 ms |
| table cell, in the middle of its text | fast | 3 ms |
| table cell, at the end of its text | fast | — |

So the first residue **is wrong**: a list item's or a heading's text starts *past* its marker,
which is not a line edge, and the write half takes it. The claim came from a measurement that
looked the block up by a hard-coded line number 0 while blocks are numbered from 1 — it
compared against `undefined` and read every case as a rebuild. (The same broken lookup cost
an hour during P24, which is where it was noticed.) The table cell's residue is real but
narrower than it was written: it is about the **start** of a cell's text.

Both are now in `test/probes/typing-cost-by-kind.js` as `text start` cases, beside the cell's
middle, so the ledger's claims are the probe's own numbers rather than a paragraph's.

## What the roadmap now says

- **Accepted, for now** — the table cell's text start (the fast path's one boundary in a
  cell, with what changing it would take), and the description-list line reader being a
  description of `remark-deflist`'s shape rather than of markdown's.
- A short correction under it, so the wrong claim in P17's handoff is answered where a reader
  meets it, and appended to that handoff as well.
- The one thing deliberately not in the section, because it is not a residue but a decision
  waiting on the user: the shape of a fast path for raw blocks, at the end of "Measure before
  deciding".

## Evidence

- `npx tsc --noEmit` clean; `npm run check` 22/22.
- A freshly started app and `npm run probe:all`: 76/76 probes, 7 skipped — with
  `typing-cost-by-kind.js` reporting through the stash as its cost-probe siblings do (its
  script is just over the bridge's 5 s budget, which its header now says).
