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

## Open, in the order to take them

1. **Spaces in the plain-edit rule.** A letter is 4 ms on that block and a space is
   40 ms (27 ms rebuild, 9 ms parse), so prose in a long paragraph rebuilds at every
   word boundary. P7 left it because a space in a link destination or a bare URL is
   not the prose's space: the rule has to refuse those before it accepts the rest.
   Same shape as P7 and P9 — the rule in its one home, corpus cases, probes.
2. **A line index for the text (lazy block offsets).** P6's first item, deferred in
   P7 §1.4 with its reason. The last O(document) + O(blocks) shape per keystroke: an
   edit materialises the document as a string for the rule, the exactness test and
   the split, and shifts every block below it. The measured prize at this size is
   ~1 ms plus ~1 ms, "inside the probe's noise" — so this is for much larger
   documents, not for this note. It changes what `MarkdownBlock` means, so it is a
   phase with its own probes.
3. **Undo ergonomics** (P5's second and third follow-ons). `caretBefore` and
   `caretAfter` on the edit, so undo lands where the author was; and coalescing, so
   a typing burst is one step with a rule for when a step ends (a pause, a block
   change, a non-typing command). Both are behaviour changes, and they belong in one
   phase: a coalesced step wants the caret of each end.
4. **The footnote gap.** A footnote reference cannot be clicked into and edited —
   a click routes to the jump. A small feature of its own, not a rendering question.

## Measure before deciding

- **The ordinary path's parse.** A structural keystroke still parses the block it
  rebuilds (9 ms of its 40 ms). Item 1 makes that rarer for prose, not for
  punctuation or digits, and making the parse itself cheaper is a parser
  measurement, not a caret one.
- **Deriving the parse for a plain edit.** Possible — the new tree is the old one
  with the positions moved and one leaf rewritten — but it would put trees in the
  parse cache that the parser did not produce, and the deferred check would then
  have to parse freshly to stay a check. No keystroke this thread does not already
  free.
- **The deferred check's parse** (once a burst; 9 ms for that block) is the safety
  net's price, not a defect.
