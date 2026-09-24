# Architecture

The editor turns a markdown document into a rendered page you can type in, with
the raw markdown kept as the only source of truth. This document is the map: the
layers, the invariants that hold them together, and where a change belongs.

## The model

- **Document** — the raw markdown, held as a piece table (`document/text_store.ts`).
  Every edit is a range replacement in it.
- **Block** — a slice of consecutive lines the renderer treats as one unit
  (`frontmatter`, `fencedCode`, `displayMath`, `paragraph`, …), described by a line
  range and a character range. `src/ui/markdown/document/blocks.ts` splits the document.
- **Node component** — the DOM component for one mdast node inside a block
  (`src/ui/markdown/nodes/`), created through the registry
  (`registry.ts` + `create_node.ts`).
- **Viewport window** — only the blocks near the scroll position are mounted; the
  rest are two spacers sized from remembered heights
  (`virtual_block_renderer.ts`).
- **Source mode** — while the caret is inside something whose rendering holds none
  of the characters it was made from (a formula's KaTeX, a link's title, a
  citation's formatted reference), that *thing* is built as its own markdown
  instead: the shape an inline code span or fenced code block always has
  (`source_mode.ts`).

## Layers and import rules

| Layer | Files | May import |
| --- | --- | --- |
| Syntax (pure) | `syntax/**` | other syntax modules, mdast types, the remark plugins |
| Document | `document/state.ts`, `document/text_store.ts`, `document/blocks.ts`, `document/block_index.ts`, `document/history.ts` | syntax |
| Render | `virtual_block_renderer.ts`, `block_sizes.ts`, `viewport_window.ts`, `create_block.ts`, `registry.ts`, `create_node.ts`, `nodes/*`, `source_mode.ts`, `format.ts`, `format_dom.ts`, `lazy.ts` | document, syntax |
| Caret and offsets | `caret/*` (`offsets.ts` in, `dom_position.ts` out) | render, document |
| Commands | `editing/*`, `commands/*`, `markdown_editor.ts`, `click_routing.ts` | everything above |

The rule that matters: **a syntax module never reaches into the DOM.** That is what
keeps the rules testable in Node, and it is the boundary most likely to be broken by
an innocent import. `test/checks/layering.mjs` enforces it.

### One fact, one home

| Fact | Home |
| --- | --- |
| Fences, frontmatter delimiters, html terminators, list markers, delimiter lines, block starts | `syntax/markers.ts` |
| Line spans, touched lines, item subtrees | `syntax/lines.ts` |
| Empty-paragraph lines | `syntax/blank_lines.ts` |
| Trailing-space rewriting | `syntax/trailing_spaces.ts` |
| Table source, table/list/code edits, `TextEdit` | `syntax/table_source.ts`, `syntax/table_edits.ts`, `syntax/list_edits.ts`, `syntax/code_edits.ts`, `syntax/edit_range.ts` |
| Parser repairs (empty items, footnote labels) and the remark pipeline | `syntax/empty_items.ts`, `syntax/footnotes.ts`, `syntax/parser.ts` |

`test/checks/syntax-home.mjs` fails if any of those facts is defined anywhere else.

## Invariants

1. **The document text is the only source of truth.** Every edit is a raw-text range
   replacement (`editing/context.ts: applyEdit`).
2. **A block's rendering is a pure function of its own source**, never of where it
   sits, so caches key on content rather than line numbers (`document/blocks.ts:
   blockContentKey`, `virtual_block_renderer.ts`).
3. **A caret's document offset is the truth.** A rendered position is derived from
   it and re-derived after any DOM rebuild (`caret/caret.ts`, `caret/offsets.ts`,
   `caret/dom_position.ts`).
4. **Source mode is decided from the document**, from the caret's offset, never by
   swapping an element behind the caret (`source_mode.ts`).
5. **One fact about markdown syntax has one home.**

## The four offsets

Almost every bug in this editor has been a confusion between these:

1. **document offset** — an index into the raw markdown. What `applyEdit` takes.
2. **block-relative offset** — a document offset minus `block.charStart`. What mdast
   positions inside a block are.
3. **rendered offset** — an index into an element's text, after markdown markers
   are hidden and widgets drawn.
4. **DOM range** — a live `Range` in the rendered tree. It may be anchored to a text
   node or to an element, and the browser *relocates* it — it does not drop it —
   when the node it points into is replaced. That is why a rebuild re-places the
   caret by offset (`editing/context.ts: showSourceAt`, `placeCaret`).

**What maps to what, and when.** Each flavour has one direction in and one out,
and none of them is stored: every mapping is re-derived from the one above it.

| Flavour | → document offset | document offset → | Re-derived when |
| --- | --- | --- | --- |
| document | it *is* the truth | — | never: the offset is recomputed from the caret on the next keystroke, and nothing holds one across a rebuild |
| block-relative | `caret/offsets.ts`: the block's `charStart` plus the node positions and `data-*-from` tags | `caret/offsets.ts: renderedOffsetAtRaw` (the block's `charStart` comes off) | on every edit: `charStart` moves, and so do the tags it is added to — a rebuild re-tags the block from the document, and a plain write moves the tags after it (`editing/typed_text.ts: writeRun`, whose list `test/checks/check-tag-offsets.mjs` holds to every tag the editor writes) |
| rendered | `caret/offsets.ts: mapRenderedOffset` (through `textOffsetInElement`) | `caret/dom_position.ts: textNodeAtRenderedOffset` | after any DOM rebuild, because a block is rendered from its source again |
| DOM range | `caret/offsets.ts: documentOffsetAt` | `caret/caret.ts`: a fresh collapsed range, by `editing/context.ts: placeCaret` | after a rebuild, always: the browser *relocates* a range into the node that replaced its text, so a range that looks connected may sit where the author never put it |

`offsets.ts` is the way in (a rendered position read back into the document,
plus the rendered-length model both directions share); `dom_position.ts` is the
way out (a document offset turned into the text node and offset that hold it).

## The text

The document text is held as a **piece table** (`document/text_store.ts`): the text
it was loaded with, an append-only buffer of everything inserted since, and the
pieces that name ranges of those two buffers, in order. An edit cuts at its two
ends, drops the pieces between them and adds one piece for what was inserted, so a
keystroke costs the piece it touches rather than a copy of the document — and text
that already exists is never rewritten, only re-viewed. What that trades away is
retention: the text an edit replaced stays reachable until `compact()` runs, which
is the point of loading a document.

The store **is** the text, and `getText()` is a view of it: a string, materialised
once per text version, because whole-document readers are what the commands are
written for. Callers above this file keep the signature they had — the caret, the
source mode, the renderer and the history are all written in document offsets, and
none of them learns what a piece is. Two derived things follow the edit rather
than the document: the blocks, re-split from the block the change reached and
stopping where the new split lines up with the blocks it had
(`document/blocks.ts: splitBlocksFrom`), and the footnote labels, folded in from
the edit instead of re-read (`syntax/footnotes.ts: labelsAfterEdit`). Each has a
property check beside it that compares it with the full computation, which is the
strongest statement available for "nothing changed" (`test/checks/check-text-store.mjs`,
`check-blocks.mjs`, `check-footnotes.mjs`).

Where a block *is* is derived too. A block keeps its own kind and its own text, and
its four positions — `charStart`, `charEnd`, `lineStart`, `lineEnd` — come from an
index the document owns (`document/block_index.ts`): a prefix sum over each block's
character stride and another over its line stride, where a stride is the distance to
the next block's start. Both are more than a block's own size, because blocks tile
neither the text (a blank line is a block of no characters) nor the lines (a run of
blank lines is fewer blocks than it has lines). An edit is therefore a point update
per block it rebuilt, and the blocks below it move by arithmetic instead of being
rewritten — 484 of 484 rewritten for a character typed at the top of the fixture
note, against a handful now.

## The history

Undo and redo are a log of edits, not a stack of documents: `document/history.ts`
holds `{ from, to, removed, inserted }` per change, and an edit is its own inverse
with the two texts exchanged. The document text stays the only source of truth —
the log is a *derivation* of it, and at any moment replaying the edits below the
cursor from the loaded text reproduces the text in the editor.

An edit also carries **where its author was and where it left them** (`before`,
`after`), each a *mark*: a caret is a mark whose ends meet, a selection is the range
the author had. Undoing therefore puts the author back where they were when they made
the change, rather than where the reader happens to be when they ask for the undo — a
caret, or the selection the edit replaced, selected again so it can be typed over — and
redoing puts them where the change left off. An edit recorded without marks, which is
the whole-document `setText` a format or a find-and-replace uses, leaves the caret where
it is; those commands place their own selection afterwards. `editing/context.ts:
restoreMark` is the one place a mark is put back, and the range placement it uses for a
selection is the one a formatting command uses to re-select what it formatted.

Consecutive keystrokes of one kind **run together into one step**: a letter extends
a run, the first character that is not a letter ends it — so the space after a word
belongs to that word's step, and so does a `。` — and the boundary is `\p{L}`, any
script's letters, with a run capped at `STEP_LIMIT` characters so a language that
does not write spaces cannot make one undo of a paragraph. Backspaces run together
the same way, and a Backspace that takes back the run's *own* last character **trims
that run** instead of starting a step (`history.ts: trimRun`): type "alpha", delete two
letters, and one undo takes the three that are left, while a word typed and deleted
whole leaves no step at all. A paste, an input method's commit, a newline, a format or
any other command is a step of its own and ends whatever run was open.

Two rules keep that true, and they are the ones to preserve when touching this
area:

- `replaceRange` and `setText` are the only places an edit is recorded; every
  mutation in the editor goes through one of them.
- `updateText` is the only place a text is applied, and undo and redo go through
  it rather than through `replaceRange` — which is what stops an undo from
  recording itself as a new edit.

The parse cache is keyed by block content, so an undo back to text the editor has
seen before reuses the parses it had, and the renderer rebuilds only the blocks
whose content key changed (`test/probes/undo-after-scroll.js` is the case where
the edit's block had left the window entirely).

## One keystroke

1. `markdown_editor.ts` sees the key and calls a command (`editing/*`).
2. The command works out a document offset from the caret (`editing/context.ts:
   caretOffset`) and computes a raw-text edit — the rules are pure
   (`code_edits.ts`, `list_edits.ts`, `table_edits.ts`, `blank_lines.ts`).
3. `applyEdit` replaces the range, decides which source the caret now sits in
   (`showSourceAt`), re-renders the blocks whose content or shape changed
   (`virtual_block_renderer.ts: renderChanged`) and places the caret by offset.
4. Rendering rebuilds only the blocks whose content key or shape key changed; the
   rest keep their DOM, which is what keeps typing cheap in a long document.

Most typing never gets that far. A keystroke that cannot change how its block
parses is written into the rendered text node and nothing is rendered at all:
`applyEdit` asks `syntax/plain_edit.ts` first — the rule accepts letters, digits,
single spaces and the punctuation that means itself, where no marker can be typed,
the line's own beginning and its edges are not being made, no run becomes the one
autolink those characters can spell (`www.`) and no two spaces end up side by side —
and then asks
`editing/typed_text.ts` whether the edit maps
into one text node whose `[data-text-from]` span spells the document's own
characters, one for one. Both halves have to agree, and anything either is unsure
of takes the ordinary path above, which is always correct. Because the rule reads
one word of the text while a parse can turn on more, the fast path also captures
the block's parse shape (from the parse the renderer already cached) and checks it
once the typing stops: one coalesced check a burst, one parse a burst, and a block
whose parse no longer has that shape is rendered again
(`editing/context.ts: scheduleVerify`).

The write parses nothing either. Which source the caret is in is decided from the
document, but an accepted edit cannot move the caret out of the node it is in —
`test/checks/check-plain-edit.mjs` checks that against the editor's own parse — so
the fast path holds that decision while it places the caret and moves the shown
range with the edit (`source_mode.ts: moveShownSource`) instead of re-deciding it.
The ordinary path and the deferred check keep asking, and the parse they read is the
one their rebuild renders from.

## Where does this change go?

| Change | Where |
| --- | --- |
| How the document is split into blocks | `document/blocks.ts` |
| A new markdown construct — a node type or a block kind | `docs/adding-a-node.md`, including what it owes the typing fast path |
| How one markdown construct looks | `nodes/<type>.ts` |
| What a markdown construct means for editing (a pure rule) | the matching `*_edits.ts` |
| A new keystroke or command | `docs/adding-a-command.md` — the id in `commands/registry.ts`, the work registered in `markdown_editor.ts` (`registerCommandEvents`), and the trigger |
| Where the caret goes, or how it maps | `caret/*` (`offsets.ts`, `dom_position.ts`) |
| When raw source is shown instead of a rendering | `source_mode.ts` |
| Spacing, laziness, virtualisation | `virtual_block_renderer.ts`, `styles.css` |

## Extension points

Every extension point is a named file — never "the renderer" — and each one is
reached in a way the next person can copy:

| Extension point | The file that owns it | Adding one |
| --- | --- | --- |
| A markdown construct's rendering | `nodes/<type>.ts`, registered in `create_node.ts` | `docs/adding-a-node.md` |
| Whether a node's markdown can stand in for its rendering | the `showsSource` flag in `registry.ts: registerComponent` | `docs/adding-a-node.md`, step 4 |
| Which source is shown, and where a click enters it | `source_mode.ts`, with `nodes/revealable_node.ts` | `docs/adding-a-node.md`, step 4 |
| A footnote marker that can be clicked into | `nodes/footnote.ts`, `click_routing.ts` | a click edits the label where it sits — the marker's opens its source, a definition's puts the caret in the `[^label]` the author wrote — and Ctrl-click (and ⌘-click, and the `contextmenu` macOS makes of it) jumps between the two |
| What a marker shows while the pointer rests on it | `footnote_preview.ts`, with `nodes/footnote.ts: renderFootnoteBody` | a card holding the note the marker names, rendered by the same components the notes run uses and read from the *document* (a definition's block is usually not mounted); it appears after a 200 ms dwell, is read-only against the document, takes the pointer so the note can be read and a link in it opened through the app's opener, and leaves a 250 ms grace after the pointer is on neither it nor its marker, on scroll, on a click in the text, or on `Escape` |
| A command the author can ask for | the id in `commands/registry.ts`, the work registered in `markdown_editor.ts: registerCommandEvents`, the trigger | `docs/adding-a-command.md` |
| How the document splits into blocks | `document/blocks.ts` | a task in the block model, plus `test/checks/check-blocks.mjs` |
| A pure rule about markdown | the matching `syntax/*.ts`, named in the one-fact-one-home table above | `docs/testing.md` — rule-shaped means `test/checks/` |
| What a block is worth in pixels | `block_sizes.ts` | a case in `test/checks/check-block-sizes.mjs` |
| Which blocks are mounted | `viewport_window.ts` | the same |

The registry (`registry.ts`) is the one place that says which node types exist, so
the renderer can stay a consumer of that table rather than a second list of what
markdown means. The recipes that use these points are `docs/adding-a-node.md` and
`docs/adding-a-command.md`.
