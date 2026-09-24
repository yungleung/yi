# Roadmap

What is planned next, and what is closed, in the order the phase handoffs left it.
Every line names the handoff it comes from; numbers are from the probes named in
those handoffs, on the 323 KB fixture note's last block (4760 characters, 189
elements) unless it says otherwise.

## Closed

- **A piece table for the text** (P5's first follow-on). Landed in P6:
  `document/text_store.ts` is the text, `getText()` materialises a version.
- **The plain keystroke's parse** (P7's "the parse"). Landed in P9: a plain
  keystroke asks the block's parse for nothing; the deferred check parses once a
  burst, and the ordinary path parses what it renders. A plain keystroke went from
  11 ms to 4 ms.
- **Virtualising inside a block** (P6's fourth item). Its goal is met without its
  mechanism: that block costs 4 ms per plain keystroke against 36–40 ms before P7,
  with no rebuild. Chunking inside a block stays out, for the reasons in P7 §1.4 (a
  block is one unit of layout: line boxes, one `<ul>`, one `<table>`). It would need
  a new motive — a single block too large even to write into cheaply.
- **Spaces in the plain-edit rule.** Landed in P10: a space between two words is
  written like a letter — 4 ms on that block against 40 ms before, with one geometry
  read — because the rule now looks at the runs on *both* sides of the edit (a space
  glued to a URL's left turns it into an autolink) and refuses a run of two spaces.
  `docs/superpowers/plans/2026-09-23-spaces-in-plain-edits.md` has the numbers and
  the cases that stay refused: a destination, a label, a line edge, a marker.
- **The footnote gap.** Landed in P13: a marker is a revealable node now, so a click
  opens its label as its source and the label can be typed in, while Ctrl-click (and
  the `contextmenu` macOS delivers it as) jumps to the note.
- **Footnote interaction** (P13's and P14's leftovers). Landed in P15, as
  `docs/superpowers/plans/2026-09-24-footnote-interaction.md`: a definition's label
  renders the characters the author wrote (`[^label]`) and is editable where it sits —
  one click rule for both anchors, a plain click edits and Ctrl-click or ⌘-click jumps —
  and the preview card can be read and followed: it takes the pointer, waits a 250 ms
  grace after the pointer is on neither it nor its marker, and opens a link in a note
  through the app's opener instead of letting the webview navigate.
- **Undo ergonomics** (P5's second and third follow-ons). Landed in P12: an edit
  carries the caret it started from and the one it left, so undo returns to where the
  author was; and a run of typing or deleting is one step, with a letter (`\p{L}`, any
  script's) as the step boundary and `STEP_LIMIT` as the cap for scripts that write no
  spaces. `docs/superpowers/plans/2026-09-24-undo-ergonomics.md` has the rule.
- **Undo across kinds, and the selection an edit replaced** (P12's two leftovers).
  Landed in P16, as `docs/superpowers/plans/2026-09-24-undo-marks-and-runs.md`: a
  Backspace that takes back the run's *own* last character trims the run rather than
  starting a step — type a word, delete part of it, and one undo takes what is left,
  while a word typed and deleted whole leaves no step at all — and an edit remembers
  its author as a *mark* rather than an offset, so undoing an edit that replaced a
  selection puts the selection back, ready to be typed over.
- **Punctuation and digits in the plain-edit rule** (P10's leftover). Landed in P17, as
  `docs/superpowers/plans/2026-09-24-punctuation-in-plain-edits.md`: the rule accepts a
  letter, a digit, a space or the punctuation that means itself, and gains the three
  guards that alphabet needs — the `www.` autolink a run of them can spell, a line's own
  beginning (`1 x` + `.` is a list), and a two-space run, which does not render as the
  characters say. On the fixture note's big block a full stop went from **46 ms to
  5 ms**, against 47 ms for an asterisk; the gate now parses with the editor's own
  pipeline instead of a stand-in.
- **The parse crash P17's fuzz found** (a citation in a description detail). Landed in
  P18, as `docs/superpowers/plans/2026-09-24-description-list-nodes.md`: the list plugin
  rebuilds a paragraph with a CommonMark-only writer, which threw on every node the
  editor adds to a line — a citation, a wikilink, inline math, a footnote reference — so
  the note did not open; the same write-back was also used to *locate* the list, and an
  entity coming back decoded made the offset repair give up silently. Terms and details
  now parse, hold those nodes with absolute offsets, and the path has the check and the
  probe it never had. The check's corpus caught a **plain-edit bug** on the way: a
  character typed between the two spaces of a hard break deleted the break.
- **The footnote reference P18 left behind.** Landed in P19, as
  `docs/superpowers/plans/2026-09-25-footnotes-in-description-lists.md`: a `[^1]` in a
  description term or detail rendered as its own text, because a term and a detail are
  re-parsed from their own lines and markdown reads a reference only when its definition
  is in the same parse. The fragment now borrows the document's definitions the way a
  whole block does — through the same `footnotes.ts` rule, which moved out of `state.ts`
  so both callers read it from its one home — and the borrowed lines are dropped again.
- **Marks for the whole-document commands** (P16's last leftover). Landed in P20, as
  `docs/superpowers/plans/2026-09-25-marks-for-commands.md`: `state.setText` takes marks,
  so undoing bold gives the word back *selected* and undoing "replace all" puts the match
  the find bar was on back under the selection, rather than leaving the caret wherever it
  happened to be afterwards.
- **A line index for the text (lazy block offsets).** Landed in P11, as a block
  offset index rather than a line index — the measurement showed the string
  materialisation P6 worried about is free (V8 hands back a sliced string) and the
  cost was `blocks.ts: moved()`, which rewrote every block below the edit: **484 of
  484 blocks for a character typed at the top** of the fixture note, against a
  handful now, and the count no longer grows with the document (2 of 1933 in a note
  four times as long). The wall clock at this size is inside the probe's noise; this
  was the last O(blocks)-per-keystroke shape, and the win is the shape.
- **The definition's own label** (P15's and P19's leftover). Landed as its own phase,
  `docs/superpowers/plans/2026-09-25-a-definition-label-you-can-edit.md`: the
  `[^label]` a definition is named by is a revealable node of its own now — while the
  caret is in it, it is built as its own markdown source, the way a marker is — and it
  maps through the *definition's* offset, which the old hand-written `data-text-from="0"`
  only got right when the definition started its own block. Measured on the app before
  the fix: in `[^1]: first\n[^2]: second` a Backspace typed into the *second* label took
  a character of the **first** definition, and in ` [^1]: note` (markdown allows up to
  three leading spaces) it landed one character early. `test/probes/footnote-jump-back.js`
  holds both cases, the reveal, the exact-click caret and the ⌘-click jump.

## Open, in the order to take them

The roadmap's own list is empty: every item the phase handoffs left is either closed
above or waiting in "measure before deciding". What the closed items left behind, in
the order I would take them, is in each phase's handoff — and it is empty: every leftover
the handoffs named is closed above, and what is left is the "measure before deciding"
column below.

## Measure before deciding

- **What a session costs.** Measured in P21, as
  `docs/superpowers/plans/2026-09-25-what-a-session-costs.md`: the app does **not** get
  slower while it stays open. Over a whole suite (~15 minutes, 76 probes) a load of the
  314 KB fixture note stayed at ~330 ms (fresh: 331 ms), the page mounted the same 27
  blocks every time, a fresh state's first-block parse stayed at 2–5 ms, and 120 bridge
  round trips stayed at a 2.9 ms median with no failures. What reads as decay is the
  bridge's **5 s** budget for one script — a 6 s probe is cut off at ~5005 ms and
  recovered from its stash — and `test/probes/load-cost.js` plus the harness's
  `bridge: …` line are what tell the two apart.

- **Where typing is slow** (the item this column used to call "the ordinary path's parse").
  Measured in P23 (`.../2026-09-25-where-typing-is-slow.md`) and P24
  (`.../2026-09-25-code-you-can-type-into.md`). By kind, one letter in the same place: a
  paragraph 2 ms, a heading 1 ms, a list item 1 ms, a table cell 3 ms, a one-line fenced code
  block 4–6 ms — all the fast path — and a **4.7 KB fenced block 25–34 ms**, the ordinary
  path, with display math not writable into at all (its source is highlighted, so no single
  text node holds the word). The rule is not what refuses a code block: the *write* half needs
  one tagged text node, which every raw rendering lacks (highlight.js spans for code and
  math, a revealed source for a link). So the cost is not the occasional structural keystroke
  but **every keystroke inside a raw block**.
  **The design P23 named was built and measured out**: a write that re-renders the block's
  own markup in place keeps the element and the highlighting, but it costs the same — 31 ms
  against the rebuild's 25 ms — because the `innerHTML` swap invalidates exactly the layout
  the element swap did (highlight.js is only 5–8 ms of it). The other shape is measured in
  the item below; `test/probes/typing-cost-by-kind.js` keeps these numbers honest, detached
  build included.
- **What a local write into highlighted code would cost, and show.** Measured in P26, as
  `docs/superpowers/plans/2026-09-25-the-stale-highlight.md`. The shape: write the character
  into the text node *inside* the highlighted span that holds it — the plain write's own
  patch — and refresh the highlight when the burst stops, on the deferred check's existing
  timer. Measured in the running app, with the app's own renderer as the reference for what a
  fresh render would produce (`test/probes/code-local-write.js`):

  | Typed | Write | Stale characters on screen | Re-highlight when the burst ends |
  | --- | --- | --- | --- |
  | a letter in an identifier / a string / a comment | 2–4 ms | **0** — the markup is identical | 1–2 ms |
  | a digit in an identifier | 3 ms | **0** | 1–2 ms |
  | a backtick inside a string, a slash inside a comment | 3–4 ms | **0** | 1–2 ms |
  | **a quote in an identifier** | 4 ms | **62** (`language-js` where it should be `hljs-string`) | 1 ms |
  | **a quote closing a string** | 2 ms | **27** (the tail of the line back to code) | 1 ms |

  **The recommendation is to build it.** Ordinary typing in a code block — letters, digits,
  and anything that does not open or close a token — would be invisible, and a keystroke
  would cost 2–4 ms instead of 25–34, with one 1–2 ms re-highlight per burst. The visible
  cost is narrow and named: the moment a delimiter *changes* how the rest of the line is
  read — a quote opening or closing a string, a comment starting — that rest keeps the old
  colours until the burst stops (~200 ms of idle, the deferred check's timer). That is the
  decision the numbers were gathered for, and it is the user's to take.

  **It was built, and measured out — the simulation above was optimistic.** The write is in
  `main`'s history for one afternoon (P27: `2026-09-25-code-you-can-type-into-now.md`); it
  works — a code keystroke takes the fast path, the block and its `<code>` element survive,
  the markup is repaired when the burst stops and the caret survives that — but it does **not**
  cost less in the app: **28 ms against the rebuild's 30 ms** on the same 80-line block. The
  table above measures the *patch alone* (a text node and one height read, 2–4 ms); the app's
  path also measures the block, restores the caret and lets the page lay out again, which is
  where the milliseconds are. So the shape is not worth its visible trade-off and was
  reverted. What the keystroke in a code block *is* spending 15–30 ms on is still open: not
  the parse, not the block swap, and not its horizontal overflow container (forcing
  `overflow-x: visible` by hand took 18 ms to 15). The next measurement is to find it — most
  likely with the same shape as P21 and P26: measure the parts, in the app, before designing
  anything.
- **Deriving the parse for a plain edit.** Possible — the new tree is the old one
  with the positions moved and one leaf rewritten — but it would put trees in the
  parse cache that the parser did not produce, and the deferred check would then
  have to parse freshly to stay a check. No keystroke this thread does not already
  free.
- **The deferred check's parse** (once a burst; 9 ms for that block) is the safety
  net's price, not a defect.
- **`table-picker-insert.js` stalls the bridge** — closed in P22, and it was never the
  picker. The probe before it, `table-menu-open.js`, opens the table's **native** context
  menu, which blocks the webview until something closes it; it lacked the
  `@needs-foreground-window` marker its sibling `table-menu.js` carries, so `probe:all` ran
  it and every later call waited seconds. The marker is on it now,
  `test/checks/probe-markers.mjs` fails until a probe that opens a menu says so, and
  `docs/testing.md` has the symptom.

## Accepted, for now

Not tasks: each of these is a residue a phase handoff named and left on purpose, with what
changing it would take. They are written down here so the ledger above and the handoffs agree
— "the open list is empty" means these are decisions taken, not work forgotten.

- **A caret at the very start of a table cell's text takes the ordinary path.** Its middle is
  the fast path (3 ms) and so is its end; its start is not (10 ms, a rebuild) —
  `test/probes/typing-cost-by-kind.js` measures all three. Changing it means teaching
  `editing/typed_text.ts: plainRun` about a caret that sits on the cell's boundary rather than
  inside one text node.
- **The description-list line reader describes the plugin's shape.**
  `syntax/parser.ts: readDescriptionLines` holds for the two forms `remark-deflist` makes —
  a term with its `: ` detail on the next line, and the same pair split by a blank line — and
  for the lists the plugin merges. It is a description of that plugin, not of markdown, so it
  is the first thing to look at if the plugin's rule ever changes (P18, P19).

One claim that *was* in this section, and in P17's handoff, turned out to be wrong when it was
finally measured: **a caret at the very start of a list item's or a heading's text is not the
ordinary path** — both are the fast path (2 ms, block and text node kept,
`test/probes/typing-cost-by-kind.js`'s two `text start` cases). P17's measurement had looked
the block up by a hard-coded line number 0, and blocks are numbered from 1, so it compared
against `undefined` and read every case as a rebuild.

One thing deliberately *not* in this list, because it is not a residue but a visible change
waiting on a decision: the shape of a fast path for raw blocks — a local write into the
highlighted span, re-highlighted when a burst stops — at the end of "Measure before deciding".

## Where a code block's keystroke goes

Measured across P28 and P29, in `docs/superpowers/plans/2026-09-25-keystroke-parts.md` and
`.../2026-09-25-the-spans-behind-the-layout.md`, by timing the app's own methods from inside a
probe (`test/probes/keystroke-parts.js`, `test/probes/code-markup-layout.js`):

| One letter, 80-line fenced code block | Cost |
| --- | --- |
| the app as it stands (a rebuild) | **31 ms**, of which `renderChanged` 24 (the detached build 11, the fresh layout the rest) and the parse 4 of twelve cached lookups |
| writing into the highlighted text node instead of rebuilding (P27) | **28 ms** — no win: the layout after a change in place is what is left |
| that change, with each line in its own block box | **8 ms** of layout instead of 17 — no visible change |
| that change, with the spans gone (plain text) | **1 ms** |
| typing in a paragraph, for comparison | **3 ms** |

Three designs were built and reverted on these numbers: re-rendering the markup in place (P24),
writing into the highlighted text node (P27), and per-line block boxes (P29). The first two
kept the colours and cost the same as the rebuild; the third halves an *in-place* change's
layout but the app's keystroke is a rebuild, which lays a fresh element out in full, so it helps
nothing today.

**What is left is one option, and it is a visible one:** *no highlighting while a burst runs* —
1 ms a keystroke in the unhighlighted state, with the colours restored when the typing stops
(one render, ~5–20 ms, on the deferred check's timer). The colours would be **absent** for the
length of a burst, not merely stale, which is a bigger change than P26 measured; everything
cheaper than that is measured out, so this is the decision, and it is the user's.
