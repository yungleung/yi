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
- **A line index for the text (lazy block offsets).** Landed in P11, as a block
  offset index rather than a line index — the measurement showed the string
  materialisation P6 worried about is free (V8 hands back a sliced string) and the
  cost was `blocks.ts: moved()`, which rewrote every block below the edit: **484 of
  484 blocks for a character typed at the top** of the fixture note, against a
  handful now, and the count no longer grows with the document (2 of 1933 in a note
  four times as long). The wall clock at this size is inside the probe's noise; this
  was the last O(blocks)-per-keystroke shape, and the win is the shape.

## Open, in the order to take them

The roadmap's own list is empty: every item the phase handoffs left is either closed
above or waiting in "measure before deciding". What the closed items left behind, in
the order I would take them, is in each phase's handoff — what P18 left (a footnote
*reference* in a term or a detail renders as its own text, because those are re-parsed as
fragments with no definitions in them), and what P16 left: the two whole-document commands
(inline formatting, find and replace all) still record no marks, so undoing one keeps the
caret where it is rather than restoring the selection it covered.

## Measure before deciding

- **The ordinary path's parse.** A structural keystroke still parses the block it
  rebuilds (9 ms of its ~40 ms). Spaces, punctuation and digits no longer reach it —
  P17 left it the markers and the line's own beginning — and making the parse itself
  cheaper is a parser measurement, not a caret one.
- **Deriving the parse for a plain edit.** Possible — the new tree is the old one
  with the positions moved and one leaf rewritten — but it would put trees in the
  parse cache that the parser did not produce, and the deferred check would then
  have to parse freshly to stay a check. No keystroke this thread does not already
  free.
- **The deferred check's parse** (once a burst; 9 ms for that block) is the safety
  net's price, not a defect.
