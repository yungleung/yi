# Punctuation in Plain Edits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the punctuation of ordinary prose — a full stop, a comma, a colon, a quote, a
hyphen, a digit — is a plain keystroke like a letter and a space, whenever the
characters around it cannot make it mean something else. That is the last item P10's
handoff left: on the fixture note's big block a full stop costs ~46 ms (27 ms of
rebuild, 9 ms of parse) against the fast path's 4 ms.

**Architecture:** the whole change is in the rule (`syntax/plain_edit.ts`), which stays
pure and total: a wider alphabet, and three guards that alphabet makes necessary — the
one autolink a run of these characters can spell (`www.`), the line's own *beginning*
(where `1` and `.` make a list), and a two-space run (which does not render as the
characters say). Nothing else in the editor changes: the fast path, the write into one
text node, and the deferred check are all where they were. The gate that keeps the rule
honest (`test/checks/check-plain-edit.mjs`) starts using the editor's own pipeline rather
than a stand-in, so the property is about *this* editor's parse.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** the "what is left" note in `docs/superpowers/plans/2026-09-23-spaces-in-plain-edits.md`,
and `docs/roadmap.md`.

## Global Constraints

- **The rule may fall back as often as it likes; it may not be wrong.** Every accepted
  edit must leave the parse alone — enforced by `check-plain-edit.mjs`, which now runs
  the editor's own `parseMarkdown`, and by the probes that read the block's DOM.
- The alphabet is a *documented* set: one fact about markdown syntax has one home, and
  this module is the home of which characters can change how markdown reads.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green on
  a freshly started app.
- Commit style: `feat(…): …`, `fix(…): …`, `test(…): …`, `docs: …`, and a `merge:`
  commit.

---

## Part 1 — the design

### 1.1 What is measured, not guessed

The rule's facts are facts about the parser, so they were measured with the editor's own
pipeline (`parseMarkdown` + `nodeShape`) over a seeded fuzz: 20 documents (paragraphs,
lists, headings, quotes, tables, description lists, frontmatter, fenced and indented
code, footnotes, URLs, CJK) × 4 alphabets × 4 seeds × 220 edits, every accepted edit
compared with the parse it produced. The result decides the guards below: with them, 19
587 accepted edits and **0** parse changes; without the marker guard, **16** of ~5 000
change the parse; without the autolink guard, **1**.

The facts the guards stand on:

- `hello example.com` is a paragraph: a bare domain is *not* an autolink in this
  pipeline. `see www.example.org now` **is**: `www.` is the one autolink a run of these
  characters can spell (a scheme needs `/`, an email `@`, and neither is plain).
- A link's *extent* is a node, so both directions matter: inserting a `.` after `www`
  starts one, and deleting a character out of `www.example` ends one.
- `1 x` is prose and `1. x` is a list; `- well` is a list and `-+ well` is prose; a
  table's `| --- | --- |` is its delimiter and `| --. -- |` is a paragraph. All three are
  the *line's beginning*, which the rule's line-edge guard does not cover: the caret is
  inside the marker's own characters, one character in from the edge.
- A `:` is a description-list marker only at a line's beginning (`term\n: detail`), which
  is the same guard.
- Two spaces in a line do not render as the characters say (`nodes/text.ts:
  preserveSpaces` renders the second as a no-break space) and two at a line's end are a
  hard break.

### 1.2 The alphabet

```ts
/**
 * What a plain edit may consist of: letters, digits, spaces, and the punctuation that
 * means itself in every inline position. What is *not* here is the point: every marker
 * (`*`, `_`, `` ` ``, `[`, `]`, `(`, `)`, `<`, `>`, `&`, `\`, `$`, `^`, `|`, `{`, `}`,
 * `#`, `~`, `=`, `@`, `/`) can open or close something with a plain character beside it,
 * so it keeps going the ordinary way.
 */
const PLAIN = /^[\p{L}\p{N} .,;:!?'"%+-]*$/u;
```

The set is deliberately *smaller* than "everything that is inert in prose": `=` is left
out (a setext underline is made of it), `@` and `/` are left out (an email and a URL
need them), and `~`/`$`/`|` are markers elsewhere. `+` and `-` are list markers only at a
line's beginning, which the marker guard answers.

### 1.3 The guards

**The run, both ways, both sides.** The runs on either side of the edit must be plain
*and* must not hold `www.`: the rule checks the run the caret is in and the run after the
edit, in the text *before* the edit and in the text *after* it — because a character put
into a run can start a link and a character taken out of one can end it.

**The line's beginning.** While everything from the line's start to the caret is marker
material — blanks, digits, or `+ - * . : > # ` ~ = |` — a typed character can complete a
block marker. The edit is allowed only past a *complete* marker:

```ts
/** Characters a block marker can be made of (see `document/blocks.ts`). */
const MARKER_MATERIAL = /^[ \t\d+\-*.:>#`~=|]*$/;
/** A marker and the space that ends it: past this, the content has begun (`# x`, `1. x`, `- x`, `> x`). */
const MARKER_PREFIX = /^ {0,3}(?:[-+*]|\d{1,9}[.)]|#{1,6}|>|:)\s+/;
```

So typing at the start of a list item's or a heading's *text* stays a plain edit
(`MARKER_PREFIX` matches `1. `), while `1 x` + `.` — a list about to be made — and a
table's delimiter row do not.

**Two spaces.** The line the edit lands in must not hold `  ` afterwards. This replaces
the two space checks P10 wrote (`/ {2}/.test(inserted)`, `spacesAt(...).length > 1`):
those missed the run a `. ` insertion *straddles*, which is a hard break
(`ax, \n` + `. ` → `ax,.  \n`) — the fuzz found it three times.

### 1.4 What the rule must still refuse

| Edit | Why |
| --- | --- |
| `.` after `1` at a line's beginning | `1 x` becomes a list |
| a letter at a line's beginning | a heading, a quote, a fence, a rule |
| anything inside `www.example` | the autolink's extent is a node |
| any character in a line's marker material (`| -- \|`, `    ` code) | the line's own shape |
| `*`, `` ` ``, `[`, `\` anywhere | markers, as today |
| next to a marker (`a*b`, `[x]`) | the marker is waiting for a character |
| at a line edge, or above a setext underline | as today |
| anything that would leave `  ` in its line | the render, not the parse |

---

## Part 2 — tasks

### Task 1: the rule, and the gate that keeps it honest

**Files:**
- Modify: `src/ui/markdown/syntax/plain_edit.ts`
- Modify: `test/checks/check-plain-edit.mjs`

**Interfaces:**

- Produces: the same `isPlainEdit(before, from, to, inserted)` signature; the alphabet
  and the three guards change. No new exports.

- [x] **Step 1: The rule**

As §1.2 and §1.3, with the module header rewritten around the new alphabet: what a
character may be, what the three guards are for, and the measurement that decided them.

- [x] **Step 2: The gate uses the editor's own parse**

`check-plain-edit.mjs` currently shapes text with `unified().use(remarkParse).use(remarkGfm)`
— a stand-in that has none of the editor's plugins (description lists, math, wikilinks,
frontmatter) and none of its repairs. It bundles `parser.ts` instead and shapes with
`parseMarkdown` + `nodeShape`, which is what the renderer compares. The fuzz above is
that gate, widened: 4 walks, 4 seeds, 20 documents.

One thing to write down rather than trip over: a **citation inside a description
detail** makes `fixDescriptionPositions` throw (it stringifies with a processor that has
no citation handler). No walk may type `@`; the bug goes in the roadmap, not in this
phase.

- [x] **Step 3: The named cases**

Flip the two the phase changes (`a full stop is not plain`, `a digit is not plain`) and
add the refusals of §1.4 that are new — `1 x` + `.`, a delimiter row, `www.` both ways,
the straddling space — plus the acceptances that are the point (a full stop at the end
of a word, a comma between two words, a digit mid-line).

```bash
npm run check
```

- [x] **Step 4: Commit**

```bash
git add src/ui/markdown/syntax/plain_edit.ts test/checks/check-plain-edit.mjs
git commit -m "feat(plain edit): punctuation and digits are plain keystrokes"
```

### Task 2: the probes, and the numbers

**Files:**
- Modify: `test/probes/typed-text.js`
- Modify: `test/probes/plain-edit-parse.js`
- Modify: `test/probes/block-rebuild-cost.js`

**Interfaces:**

- Produces: no new names; the refusals the probes stage become characters that still
  refuse (`*`), and the fast cases gain the punctuation.

- [x] **Step 1: `typed-text.js`**

A full stop is now the fast path: the block, its text node and the page all stay put,
and the document holds the character. The refusal case stays a `*` (and the header's
"an asterisk, a full stop" loses the full stop).

- [x] **Step 2: `plain-edit-parse.js`**

The contrast is read as "a structural keystroke asks the caret lookup, parses and
rebuilds" — staged with `*` now, and a comma and a full stop join the plain rounds.

- [x] **Step 3: `block-rebuild-cost.js`**

The third round types a `*` rather than a full stop, so the pair of costs is still
reported; the full stop joins the fast rounds. Record what a full stop costs now on the
fixture note's big block (it was 46 ms) for the handoff.

- [x] **Step 4: Run them**

```bash
npm run probe -- --fixture default-document.md test/probes/typed-text.js
npm run probe -- --fixture default-document.md test/probes/plain-edit-parse.js
npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
  test/probes/block-rebuild-cost.js
```

- [x] **Step 5: Commit**

```bash
git add test/probes/typed-text.js test/probes/plain-edit-parse.js test/probes/block-rebuild-cost.js
git commit -m "test(plain edit): the punctuation probes and their numbers"
```

### Task 3: Acceptance, docs, handoff

- [x] **Step 1: The docs**

`docs/architecture.md`'s "One keystroke" passage says what the rule accepts now and why
the three guards exist; `docs/adding-a-node.md`'s fast-path step says the same in one
line; `docs/roadmap.md` closes P10's leftover and records the parser crash the fuzz
found.

- [x] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 20/20 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 72/72 probes
```

- [x] **Step 3: The handoff, and the commit**

Append to this plan: the alphabet, the three guards with the facts behind them, the
numbers from the probes, the gate's move to the editor's own parse, and what is left.

```bash
git add docs/architecture.md docs/adding-a-node.md docs/roadmap.md \
  docs/superpowers/plans/2026-09-24-punctuation-in-plain-edits.md
git commit -m "docs: close the punctuation handoff"
```

- [x] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/plain-punctuation -m "merge: punctuation and digits are plain keystrokes (plain edit)"
git rev-parse HEAD^{tree} codex/plain-punctuation^{tree}   # must be equal
```

Keep the branch, and report the tree hash.

---

## Handoff — what this phase left

**P10's last item is closed: the punctuation of a sentence is a plain keystroke.** On
the fixture note's big block (the same one P9, P10 and P11 measured) a full stop went
from **46 ms to 5 ms**, next to 4 ms for a letter and a space and 47 ms for an asterisk.

### The rule

`syntax/plain_edit.ts` accepts a letter, a digit, a space, and `, . ; : ! ? ' " % + -`.
What is *not* in the alphabet is the point — `*`, `_`, `` ` ``, `[`, `]`, `(`, `)`, `<`,
`>`, `&`, `\`, `$`, `^`, `|`, `{`, `}`, `#`, `~`, `=`, `@`, `/` each need a plain
character beside them to make something, so they keep going the ordinary way — and the
three things a run of the accepted ones can *still* do are guards:

- **`www.`** — the one autolink they can spell (a scheme needs `/`, an email `@`).
  `touchedRun` reads the run the edit touched as one span, in the text on both sides of
  the edit, because a character put into a run can start the link and one taken out of it
  can end it. That second half is what the gate found after the first version looked
  only at the run *after* the edit: deleting the space before `www.` ends the link.
- **the line's own beginning** — `MARKER_MATERIAL` (`blanks, digits, + - * . : > # ` ~
  = |`) with `MARKER_PREFIX` (`- x`, `1. x`, `## x`, `> x`, `: x`): typing inside a
  marker's own characters can finish it (`1 x` + `.` is a list, and a table's delimiter
  row is not a row once it has a full stop), while a caret past a marker that is already
  there is in the content.
- **two spaces** — `preserveSpaces` renders the second as a no-break space and the two at
  a line's end are a hard break. The scope is the *line*, which replaces P10's two
  checks: they missed the run an edit straddles (`ax, \n` + `. ` is a hard break).

The three guards were not guessed. A seeded fuzz over 20 documents × 4 alphabets × 4
seeds (paragraphs, lists, headings, quotes, tables, description lists, frontmatter,
fenced and indented code, footnotes, CJK, URLs) comparing every accepted edit's parse
before and after found them: without the marker guard 16 of ~5 000 accepted edits change
the parse, without the autolink guard 1, and the space guard's straddling case three
times. With all three, 19 587 accepted edits and none.

### The gate

`check-plain-edit.mjs` now shapes text with the editor's **own** pipeline
(`syntax/parser.ts: parseMarkdown`) instead of `remarkParse + remarkGfm` — which had none
of the editor's plugins (description lists, math, wikilinks, frontmatter, citations) and
none of its repairs, so "the parse" in that check was not this editor's parse. It runs
three walks (letters, the new punctuation, the structural characters) over 17 documents
and 2 306 accepted edits, and each accepted edit must leave the shape alone *and* parse
to the old tree with the edit in the one leaf it lands in.

**The fuzz also found a bug that is not this phase's:** a citation inside a description
detail makes `syntax/parser.ts: fixDescriptionPositions` throw (it stringifies with a
processor that has no citation handler), so no walk types `@`. It is in
`docs/roadmap.md`'s open list.

### The probes

- `typed-text.js`: a full stop and a comma keep the block, the text node and the
  document, and read no rect; the refusal it stages is an asterisk. It keeps the number
  of cases it had, because the fuller version timed out inside the bridge's budget late
  in a suite run — a long-running app makes every case slower, and this probe sits
  closest to the edge. Splitting the deferred-check section out is the next step if it
  ever times out again.
- `plain-edit-markers.js` (new): the punctuation the rule refuses *because of a marker* —
  a full stop after the `1` of `1 x` (the line becomes a list), a full stop inside a
  `www.` run, and a Backspace that would leave `--` under `title` — each rebuild the
  block and still reach the document. These moved out of `typed-text.js` because they
  perturbed its staged section from a distance (the staged shape was consumed by a
  pending check), and they are a subject of their own: what the rule refuses in the app,
  as opposed to what the fast path writes.
- `plain-edit-parse.js`: the contrast between the plain and the ordinary path is staged
  with `*`; a comma and a full stop join the plain rounds.
- `block-rebuild-cost.js`: the rounds are a letter, a space, a full stop (all fast) and
  an asterisk (ordinary): **4–6 / 4–5 / 5 / 47 ms** on that block across two runs, with
  one height read for the fast ones and eight for the asterisk.

### Evidence

- `npx tsc --noEmit` clean; `npm run check` 20/20 (the plain-edit check reports 2 306
  accepted edits).
- A freshly started app and `npm run probe:all`: **73/73 probes, 6 skipped**.

### What is left

- `docs/roadmap.md`'s open list: the citation-in-a-detail parse crash the fuzz found, and
  P16's boundary (the two whole-document commands record no marks for undo).
- The rule's own residue, both conservative: a caret at the very start of a list item's
  or a heading's text goes the ordinary path — the rule allows it (it is past a complete
  marker) but the write half still refuses that boundary — and a table cell's text is
  plain only away from its edges, because a `|` is not in the alphabet.

**Correction, later.** The first of those two residues was measured again when the roadmap
finally listed it, and it is wrong: a caret at the very start of a list item's or a heading's
text is **the fast path** (2 ms, block and text node kept — `test/probes/typing-cost-by-kind.js`,
its two `text start` cases). The measurement behind the claim looked the block up by a
hard-coded line number 0 while blocks are numbered from 1, so it compared against `undefined`
and read every case as a rebuild. The table cell's residue is real, but it is about the
*start* of a cell's text, not its edges: a cell's middle and end are the fast path, its start
is not.
