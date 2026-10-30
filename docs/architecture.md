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
  citation's formatted reference, a fenced block's body with its delimiters hidden),
  that *thing* is built as its own markdown instead: the shape an inline code span
  always has, and the one a fenced block takes while the caret is in it — its own
  text, delimiters included (`source_mode.ts`, `nodes/fence_text.ts`).

## Layers and import rules

| Layer | Files | May import |
| --- | --- | --- |
| Syntax (pure) | `syntax/**` | other syntax modules, mdast types, the remark plugins |
| Document | `document/state.ts`, `document/text_store.ts`, `document/blocks.ts`, `document/block_index.ts`, `document/history.ts` | syntax |
| Render | `virtual_block_renderer.ts`, `block_sizes.ts`, `viewport_window.ts`, `create_block.ts`, `registry.ts`, `create_node.ts`, `nodes/*`, `source_mode.ts`, `format.ts`, `format_dom.ts`, `lazy.ts` | document, syntax |
| Caret and offsets | `caret/*` (`offsets.ts` in, `dom_position.ts` out) | document, syntax, the shared tag names (`offset_tags.ts`) — and nothing above them. The render layer reaches *in* to it instead: a click on a node places the caret (`nodes/editable_node.ts`, `create_block.ts`) |
| Commands | `editing/*`, `commands/*`, `markdown_editor.ts`, `click_routing.ts` | everything above |

The rule that matters: **a syntax module never reaches into the DOM.** That is what
keeps the rules testable in Node, and it is the boundary most likely to be broken by
an innocent import. `test/checks/layering.mjs` enforces it.

What the tree does *today* — the edges that bend, the sizes, the conventions a check
enforces and the ones nothing enforces yet, and the order the structural work is worth
taking — is `docs/structure.md`.

### One fact, one home

| Fact | Home |
| --- | --- |
| Fences, frontmatter delimiters, html terminators, list markers, delimiter lines, block starts | `syntax/markers.ts` |
| Line spans, touched lines, item subtrees | `syntax/lines.ts` |
| Empty-paragraph lines | `syntax/blank_lines.ts` |
| Trailing-space rewriting | `syntax/trailing_spaces.ts` |
| Spaces prose draws literally | `text_spacing.ts` owns the one-length mapping from a source space to the no-break space HTML needs in a run or at a text node's end |
| The `data-*` names that carry document offsets | `offset_tags.ts` |
| Table source, captions, table/list/code edits, `TextEdit` | `syntax/table_source.ts` bounds the pipe rows and maps a caret only inside them; `syntax/table_captions.ts` parses the optional following `: …` line and its Pandoc attributes; `syntax/table_edits.ts`, `syntax/list_edits.ts`, `syntax/code_edits.ts` and `syntax/edit_range.ts` own the edits |
| A fenced block's body, and where a write inside one lands | `syntax/fence_edits.ts` |
| Parser repairs (empty items, bare markers, footnote labels, destinations with spaces, what a description list can hold) and the remark pipeline | `syntax/empty_items.ts`, `syntax/bare_markers.ts`, `syntax/footnotes.ts`, `syntax/spaced_destinations.ts`, `syntax/parser.ts` |
| Heading attributes and automatic identifiers | `syntax/heading_attributes.ts` recognizes the trailing Pandoc block; `plugins/remark-heading-attributes.ts` separates it from heading children; `syntax/pandoc_identifiers.ts` owns automatic IDs |
| Heading targets in the document | `document/heading_index.ts` derives the ordered targets and `document/state.ts: headingTargets` caches them for the current text |
| Automatic cross-references | `syntax/auto_references.ts` scans `[#id]`, `plugins/remark-auto-references.ts` creates the inline node, and `nodes/auto_reference.ts` renders the resolved target text |
| Reference targets and numbering | `document/reference_index.ts` owns document order, heading IDs, figure, listing, captioned-table, captioned-list and labeled-equation numbering, duplicates, and display labels; `syntax/reference_vocabulary.ts` reads document-owned labels and literal prefixes from frontmatter, and `document/state.ts: referenceEntries` caches the result for the current text |
| Figures | `syntax/figures.ts` recognizes Pandoc implicit figures and separates trailing attributes; `nodes/figure.ts` renders the image, number, caption, and complete source view |
| Table captions and export | the shared `nodes/caption.ts` renders, numbers, and reveals a table caption across its complete row; `create_block.ts` groups the table, source-only separator, and caption without rendering the blank separator; `ui/export/table_rewrites.ts` lowers non-LaTeX output through `table_html.ts`; `ui/export/reference_header.ts` defines the LaTeX/PDF counter macro |
| Equations | `syntax/equation_blocks.ts` reads `[$$…$$]{…}` wrappers, classifies the one top-level environment, keeps the structural block alive while its attributes are unfinished, and lowers native numbering; `create_block.ts` and `nodes/equation.ts` render one KaTeX block with one Yi-owned number, or its exact clickable source; `ui/export/equation_rewrites.ts` and `equation_html.ts` own writer output, including the full-width formula/reserved-number table shared by every display equation in HTML, EPUB, DOCX and ODT |
| List captions and export | `syntax/caption_lines.ts` owns the colon-line grammar shared with tables; `syntax/list_captions.ts` attaches a caption only to its list and masks it for remark; the shared `nodes/caption.ts` renders, numbers, and reveals it; `ui/export/list_rewrites.ts` gives HTML/EPUB/DOCX/ODT one shared wrapper and LaTeX/PDF a `yilist` counter with native references |
| Callouts | `syntax/callouts.ts` owns GitHub-alert and Pandoc fenced-Div grammar, title/kind and source ranges; `syntax/quote_edits.ts` and `syntax/callout_body.ts` own quote-depth Enter, empty-opening Enter and first-body materialisation; `plugins/remark-callouts.ts` normalises both forms into an `AstCallout`; `nodes/callout.ts` renders the panel and empty anchor; `ui/export/callout_rewrites.ts` lowers both forms into the filter-visible semantic Div |
| Code listings | `syntax/code_fences.ts` reads Pandoc attributes from a fenced opening line; `syntax/listings.ts` creates a block node for an ID or caption; `create_block.ts` renders the generated label/caption below the editable code body; `ui/export/preprocess.ts` rewrites automatic references and every writer's listing shape |

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

   It is also why the DOM is swept *after* the caret is captured and never before: the range
   a removal relocates comes back connected, between two blocks, and naming no document offset,
   so a snapshot taken afterwards has nothing to put back. The renderer takes one before every
   sweep it makes (`virtual_block_renderer.ts` — `syncWindow`'s capture, and `refresh`, which
   drops the mounted blocks inside that sync for this reason), and `markdown_editor.ts:
   reanchorCaret` reads it. Measured: a `config_changed` rebuild took a caret sitting on a
   formula's closing fence to `el.prose@1`, and the next letter replaced the note with itself
   (`test/probes/rebuild-keeps-the-caret.js`).

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
note, against a handful now. One consequence for every command: **a block object from
before an edit cannot be asked where it sits.** The edit re-splits the blocks, the index
drops the ones it replaced, and asking one of those is an error rather than a position
that belongs to another block (`editing/formatting.ts` is where that bit: it held the
selection's blocks across its own whole-document edit, so a formatting command wrote the
markers and then threw before anything was rendered).

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
one with nowhere in particular to leave its author, leaves the caret where it is — and
that is now the exception rather than the rule for the two whole-document commands:
`state.ts: setText` takes marks, so inline formatting records the selection it replaced
and the span it leaves selected, and find-and-replace-all records the match the bar was
on. `editing/context.ts: restoreMark` is the
one place a mark is put back, and the range placement it uses for a selection is the one a
formatting command uses to re-select what it formatted.

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
the edit's block had left the window entirely). One input is more than the block's
own text: a block holding a footnote marker is parsed with the document's
definitions borrowed (`syntax/footnotes.ts: withFootnoteDefinitions`), so its key
carries the version of the labels it borrowed (`state.ts: parseKey`), and renaming
or removing a definition re-parses and re-renders every block that named it. A
block with no marker in it keeps the key it had — and, with it, the parse and the
height remembered against it.

## One keystroke

1. `markdown_editor.ts` sees the key and calls a command (`editing/*`). The keyboard is held by
   an invisible textarea (`editing/composition_input.ts`), so a key can also arrive as a
   composition: what an input method, dictation or the emoji panel commits is inserted through
   the same text path as typing, as one edit of its own
   (`text_commands.ts: insertCommitted`). An explicit 229 key belongs to that method; Caps Lock
   alone does not, because in the English source it is ordinary editor input. What a method has
   *marked* —
   the pinyin, the kana, the
   syllable — is written into the line where the reader is typing it (`editing/composition_view.ts`):
   a span at the caret, marked `data-composing` so the offsets step over it, because none of those
   characters is in the document yet. A committed word and ordinary typing write in place when
   the edit maps into one exact text node; both keep the seam focused during the burst. A
   structural edit deliberately blurs the field for one turn to restore its input context.
   Activating the app can also leave focus on the page. A page-targeted key is still handled by
   the same path while the editor owns a live caret; without a caret it writes nothing.
   Caps Lock pass-through may deliver a run of native insertions through the seam. The field
   tracks the prefix already committed and clears after the current input event, because clearing
   synchronously makes WebKit reject the next insertion at the same caret. A 229-routed letter's
   Caps Lock form is normalized to the method's lower-case English character. An editor-handled
   key after that native burst resets the seam context immediately, before an ultra-fast next
   native character arrives. A platform observer sends `input_source_changed`
   (`src-tauri/src/input_source.rs`): AppKit's input-context notification on macOS,
   `WM_INPUTLANGCHANGE` on the main window on Windows, and the IBus/Fcitx source-change signals
   on the session bus on Linux. A focused seam then clears its native value and reacquires focus,
   so the next key uses the newly selected English or Chinese source.
2. The command works out a document offset from the caret (`editing/context.ts:
   caretOffset`) and computes a raw-text edit — the rules are pure
   (`code_edits.ts`, `list_edits.ts`, `table_edits.ts`, `blank_lines.ts`).
3. `applyEdit` replaces the range, decides which source the caret now sits in
   (`showSourceAt`), re-renders the blocks whose content or shape changed
   (`virtual_block_renderer.ts: renderChanged`) and places the caret by offset.
4. Rendering rebuilds only the blocks whose content key or shape key changed; the
   rest keep their DOM, which is what keeps typing cheap in a long document.

Before step 1, the key is offered to the **completion list** — a citation's keys after an `@`, the
document's targets after `[#` or a same-document `](#`, and the workspace's documents between `[[`
and `]]`. While one is open the arrows, Enter, Tab and Escape are the list's, and every other key is
the text path's, which redraws the list afterwards (`markdown_editor.ts: handleKeydown`,
`editing/completions.ts`). A native input-method, dictation or emoji commit refreshes the same list
after its one edit is written, so every way of entering a marker opens its choices at once. A click
in the document closes it, because a click is not typing. Two pure rules decide everything the list
shows: whether the caret is inside a query at all, and which entries match it
(`syntax/completions.ts`), and what a bracket writes where the author is (`syntax/brackets.ts` — a
pair in prose, quotation, GitHub callout or fenced-Div source, nothing in a literal region or over a
selection, a step over the `]` the app itself wrote, and a pair taken away whole by Backspace). The
bracket rule sees a one-character input-method commit exactly as it sees a key, before a blank line
or container body is materialized, so the caret remains inside the pair in every supported context.

Most typing never gets that far. A keyboard insertion followed by a non-newline
character, and an input method's committed word, is written into the rendered text run
as it arrives; nothing is rendered during the burst. `editing/typed_text.ts` first
proves that the edit maps into one tagged text node whose canonical space rendering
spells the document's own characters, one for one. Prose and source views therefore
use the same rule:
`Start _word_` appears literally character by character, with its case and caret
intact, and becomes emphasis only after the deferred parse check. Edits that cannot
map exactly — selections across nodes, newlines, non-keyboard commands — take the
ordinary path above, which is always correct.

`syntax/plain_edit.ts` remains the smaller, parse-aware classification of edits whose
shape is already known not to change. It accepts letters, digits, single spaces and
punctuation that means itself where no marker, line edge, autolink or hard break can
be made. That classification is still tested over the seeded corpus, and source views
still accept every non-newline character literally because their whole box is exact.

Measured before that work, one letter cost 1–3 ms in a paragraph, a heading, a list
item or a table cell, 6 ms in a small code block and **32 ms in a 4.7 KB one**; the
long source burst also lost characters while each rebuild blurred and refocused the
input seam (`test/probes/typing-cost-by-kind.js`, `source-burst-editing.js`).
`editable-source-burst.js` holds the same behavior across links, automatic references,
captions, math, formatting, citations, images, footnotes, heading attributes and
fenced attributes. `default-list-inplace-typing.js` holds the same immediate,
mounted write in the default fixture's task, unordered, ordered, nested and
captioned lists.

For rendered prose, the in-place write captures the block's parse shape (from the parse
the renderer already cached) and checks it once the typing stops: one coalesced check a
burst, one parse a burst, and a block whose parse no longer has that shape is rendered
again (`editing/context.ts: scheduleVerify`). Characters and caret movement are
immediate; only that optional render waits. The same deferred reconciliation refreshes
blocks whose parse depends on another block — a footnote marker whose definition was
renamed, for example — once per burst rather than once per key. A source view remains
mounted while its caret is inside it; leaving it performs the full shape change.

The write parses nothing for an edit *strictly inside* the shown source, where
`test/checks/check-plain-edit.mjs` checks against the editor's own parse that it cannot
leave the node. The fast path holds that decision while it places the caret and moves
the shown range with the edit (`source_mode.ts: moveShownSource`). An edit touching
either source edge takes the ordinary path instead: a typed character there can end the
node (a completed link, formula, image, or formatting run) or grow it (another key
character in a narrative citation), and only the rebuilt paragraph can decide which.
The source's content tags move with a local write as well, using a right-biased end for
text inserted at that boundary; a growable caption can therefore accept a burst at its
own end without rebuilding while a completed link still leaves source mode.
The deferred check keeps that rule for a burst that changed the block's shape.

Two writers put text into a mounted block without the renderer building it: the fast path
above writes into the tagged text node, and a formatting command patches the block's own
markup in place (`format_dom.ts`). Both leave the element holding content the renderer did
not build, so both tell it — `measureEditedBlock`, and `notePatchedBlock` for the patch.
An element is remembered by the content it was built from, and without that record the
next edit back to the older text looks like nothing to re-render: undoing a formatting
command left its `<strong>` on screen, with the selection mapped through the tags the
patch had shifted.

A **click** on a node whose rendering cannot hold a caret — a citation, a wikilink, a
link, a formula, a footnote's label — is the same shape with no edit: it opens the node
as its own source (`source_mode.ts: enterSourceOf` → `markdown_editor.ts: enterSource`),
which rebuilds the block, and it keeps the scroll exactly as `keepScroll` does for an
edit. The reader clicked something they could see, so the view must not move under them
— measured on the demo document with its thematic break just below the fold, a click on
the citation above it moved the scroll 24px a frame later, with the layout unchanged and
the caret on screen (`test/probes/reveal-click-scroll.js`). A move the reader *asks* for
still scrolls: the footnote jump goes to `virtual_block_renderer.ts: revealOffset`
rather than through this path.

A **⌘-click** on a wikilink asks for the document the link names instead — Ctrl-click, the
gesture a link and a footnote marker take, with the plain click staying the editor's. The
target travels on the element the node built (`data-wikilink-target`), never read back out
of the title on screen: that title belongs to the other document, and a target nothing
answers to is exactly the case where the rendering says the least. The click itself asks
through a port with no imports of its own (`wikilink_open.ts`), because what opening a
document means is the shell's: the session *owns* the editor, and a module here that
reached for it would be asking its own owner. The answer is
`ui/editor_panel.ts`'s — resolve the target with `documentManager.resolve`, the index the
completion list writes into, then hand the path to the session, which is where a click on
a row of the tree arrives as well (`session.openPath` → `openFile`): the question before an
unstacked document is lost, the stack, the caret, the session write. A target no document
answers to is *said so* (`wikilink.notFound`) rather than passed to the node the way
`routeLinkClick` passes a link it cannot open — the reader asked to follow a link, and a
link that goes nowhere is what they need to be told (`test/probes/wikilink-cmd-click.js`).

An **inline run** — a bold, an italic, a strikethrough, an inline code span — is the
same machinery for a different reason. These *can* hold a caret, and their markers
were skipped by the offsets mapping; but a marker skipped is a marker the author
cannot aim at, so typing at a run's edge and typing one character in behaved
differently. Built as their own source while the caret is inside them
(`nodes/strong.ts`, `nodes/emphasis.ts`, `nodes/delete.ts`, `nodes/inline_code.ts`,
over `nodes/revealable_node.ts`), the markers are ordinary characters: the caret sits
between them, both edges behave the same, and a click enters at the content end like
every other revealed source (`test/probes/format-reveal.js`). The content between the
markers is read off the parse — what the children cover — because one spelling stands
for more than one shape: `***x***` is a strong around an emphasis or the reverse, and
only the tree says which delimiters belong to the node
(`nodes/revealable_node.ts: wrappedContent`); inline code holds its text directly and
counts the backticks that wrap it. The reveal is decided by the caret, not by a click
(see `source_mode.ts`), so the run a formatting command just wrote stays revealed —
its caret is inside it — until the caret leaves (`test/probes/format-buttons.js`).

**A block that is showing its own text keeps it while the reader is selecting in it.** The caret
observer asks for the shape on every caret move, and the click a drag inside a fenced block ends
with places the caret back in that same block — where a live selection makes the ask name no block
at all (`editing/context.ts: showSourceAt`), so the block is rebuilt as its rendering and the
element the selected text was drawn on goes with it. The observer therefore holds that one ask
back while a selection is live (`markdown_editor.ts: followCaret`); nothing else about the decision
changed, and a run inside a paragraph is not one of these blocks, so a formatting command still
gets the run it wrote shown (`test/probes/select-in-code-block.js`, `format-buttons.js`).

**A click that ends a drag is the drag's, not the caret's.** The browser fires that click
at the nearest common ancestor of where the press and the release landed, so a selection
that crosses two blocks ends it on the page itself — the one spot
`click_routing.ts: routePointerClick` answers by placing a caret, and placing it drops the
range the drag just made (`editing/context.ts: placeCaret` clears the native ranges). A
selection inside one paragraph ends on its node and never reached that path, which is why
the cross-block drag was the one that broke. `editing/pointer.ts` remembers where the
pointer went down and refuses the caret for a gesture that both travelled past a few
pixels and left the reader a selection; a margin click the pointer merely jittered through
still places one (`test/probes/select-across-blocks.js`).

## Where does this change go?

| Change | Where |
| --- | --- |
| How the document is split into blocks | `document/blocks.ts` |
| A new markdown construct — a node type or a block kind | `docs/adding-a-node.md`, including what it owes the typing fast path |
| How one markdown construct looks | `nodes/<type>.ts` |
| A heading's visible level and attributes | `nodes/heading.ts` attaches the generated glyph from `nodes/heading_marker.ts` and the invisible gutter target from `nodes/heading_hover.ts`. `create_block.ts` marks a block that renders a heading, and `styles.css` expands that block into the marker gutter with cancelling margin and padding, so the content-visibility hit area includes both the text and its marker. The browser's native `.markdown-heading:hover` state keeps the glyph hidden in the left margin and shifts only the glyph in on hover; an empty heading keeps its marker visible because no title text states the level. The six SVGs are decorative (`aria-hidden`), take no pointer events and contribute no text or caret offsets; heading indentation never changes. A trailing Pandoc attribute block is hidden until the caret enters the heading, then appears as editable source with exact document offsets (`syntax/heading_attributes.ts`, `editing/context.ts: sourceRangeIn`) |
| A heading cross-reference | `syntax/link_edits.ts: isSameDocumentFragment`, `document/reference_index.ts`, `editing/references.ts: jumpToReference` and `click_routing.ts: routeLinkClick` | ordinary links keep their browser, file and source-edit gestures. ⌘-click or Ctrl-click on `[text](#id)` first checks whether the destination is a same-document fragment; the shared target index resolves it in document order, reveals a target outside the mounted viewport, and focuses it without changing `location.hash`. A missing ID stays in place and shows a localized message. `heading-crossrefs.js` and `heading-crossrefs-default-document.js` hold both behavior and the shipped example |
| An automatic reference or numbered target | `nodes/auto_reference.ts`, `document/reference_index.ts`, `editing/references.ts`, `nodes/figure.ts`, `nodes/caption.ts`, `nodes/equation.ts`, `create_block.ts`, `syntax/code_fences.ts`, `syntax/listings.ts` | `[#id]` renders a normal-looking link with text inferred from document frontmatter. Figures are standalone non-empty-alt images. Code listings consume a number only with an ID; captioned tables and lists consume numbers; labeled equations use one number per block. Command-click reaches the figure source, first table header cell, list item, code body, or formula body. LaTeX/PDF use native figure/listing counters plus `\yiTableRef`, `\yiEquationRef`, and `\yiListRef` so package/template counters remain authoritative |
| A table caption's editing or export shape | `syntax/table_captions.ts`, `nodes/caption.ts`, `ui/export/table_rewrites.ts`, `ui/export/reference_header.ts` | the caption line has its own source range and inline children; `table.source` preserves the exact table/caption spelling. The shared editor node applies only the ID, keeps `.margin` and other attributes for export, and reveals the source from anywhere on the caption row. HTML/EPUB prefix the visible caption, DOCX/ODT wrap an ID-bearing table in a target Div, processed Markdown emits HTML, and LaTeX/PDF keep native caption/label plus a generated header. A package must expand `$header-includes$`; a rewriting filter must preserve `\caption` and `\label` |
| An equation's source, rendering, or export shape | `syntax/equation_blocks.ts`, `nodes/equation.ts`, `ui/export/equation_rewrites.ts`, `ui/export/equation_html.ts`, `ui/export/reference_header.ts` | `[$$…$$]{…}` is one equation block; `$${#id}` stays math text. Every plain or environment formula is analyzed before KaTeX, so top-level `equation|align|gather|alignat` becomes starred for unlabeled display and mapped to an unnumbered inner form for a target. An ID is optional for display. Incomplete attribute tokens retain the structural block, and `EquationSource` maps a click to the exact source line and character. One `(prefix-N)` number is chrome; the configured label appears only in reference text. Every HTML/EPUB/DOCX/ODT display equation uses one layout row with the formula first and a minimum-width, left-aligned second cell; only a label fills it. Processed Markdown uses the same layout around MathML. LaTeX/PDF get one outer `equation` and `\yiEquationRef` |
| A list caption's editing or export shape | `syntax/caption_lines.ts`, `syntax/list_captions.ts`, `nodes/caption.ts`, `ui/export/list_rewrites.ts`, `ui/export/reference_header.ts` | a top-level bullet, ordered, or task list followed by `: Caption {#list:id}` is one block. The colon line uses the table grammar but attaches only after a list at its base indentation; a paragraph keeps definition-list semantics. The shared editor node reveals the caption independently of item editing. HTML/EPUB/DOCX/ODT share one target wrapper and caption; LaTeX/PDF use the namespaced `yilist` counter, `\yiListCounterSetup`, and `\yiListRef` |
| A code listing's editing or export shape | `syntax/code_fences.ts`, `syntax/listings.ts`, `create_block.ts`, `ui/export/preprocess.ts`, `ui/export/reference_header.ts` | an ID or caption makes a fence a listing; a caption alone is visible but unnumbered. The code body remains editable and the generated caption follows it. Non-LaTeX exports use an identified wrapper or processed-HTML figure; LaTeX/PDF keep native listing captions and use the configured label/prefix when `listings` defines its counter |
| A Pandoc Div or callout's source, editing, navigation, or export shape | `syntax/fenced_divs.ts`, `syntax/callouts.ts`, `syntax/quote_edits.ts`, `syntax/callout_body.ts`, `editing/callout_kind_picker.ts`, `plugins/remark-callouts.ts`, `nodes/callout.ts`, `nodes/fenced_div_source.ts`, `nodes/quote_source.ts`, `caret/navigation.ts`, `ui/export/callout_rewrites.ts` | `fenced_divs.ts` owns balanced colon fences, nesting and body ranges for every Pandoc Div. A GitHub alert is a blockquote subtype and a Pandoc callout is a classified Div; both normalise to one positioned callout node. Unknown Divs (columns, speaker notes, wrappers and incremental lists) always show exact source, including when nested in a quote or callout. Ordinary quotes and callouts become exact block source while edited, so carriers and escape markers remain addressable. Enter routes through list, table, code, equation and ordinary Div-body rules with the active prefix. A typed `:::` creates a closed bare Default Div and opens the seven-choice Default/Note/Tip/Important/Warning/Caution/Definition picker; a callout choice adds its metadata. A single backtick stays literal in Div source, while three open a nested code fence. Empty callouts retain a body anchor reachable from either side. Export lowers both callout forms to `.callout`, `.callout-<kind>`, and `.callout-title` before other source rewrites, leaving a stable Lua-filter contract |
| What a markdown construct means for editing (a pure rule) | the matching `*_edits.ts` |
| A new keystroke or command | `docs/adding-a-command.md` — the id in `commands/registry.ts`, the work registered in `markdown_editor.ts` (`registerCommandEvents`), and the trigger |
| What typing a bracket writes, and the list that opens as the author types `@`, `[#`, `](#` or `[[` | `syntax/brackets.ts` (the pair, the literal regions and the selection, stepping over, Backspace) and `syntax/completions.ts` (what the caret is inside, which entries match, the closing-marker count, and what accepting writes) are the rules, each with its check in `test/checks/`; `editing/completions.ts` is the list in hand (the arrows, Enter, Escape, and the closing click), `completion_card.ts` draws it, and the two ends that reach them are the editor's key path (`markdown_editor.ts: handleKeydown`) and the text path's typing/committed-text path (`editing/text_commands.ts`). Each refresh records the query's document end alongside its start; accepting and every non-owned text key use that recorded range rather than re-reading a live DOM caret that a deferred block rebuild can leave on a wrapper node. Acceptance leaves the caret at the completed node's closing edge, where source mode correctly remains open for editing. An insertion at either edge of a shown source is surrounding text, not part of the node: the fast path declines it and rebuilds through the document, so links, references, citations, wikilinks, formulas, images, footnotes and inline formatting render on the first character beyond them. Escape and a no-match query restore the query caret before closing. A delimiter pair is committed through the normal rebuild path, because adding `()` after `[title]` changes plain text into a link source. The entries come from `bibliographyManager.entries()`, `document/state.ts: referenceEntries`, and `documentManager.documents()` — the latter's `target` is what `documentManager.resolve` takes, a document's frontmatter `id` or its file name, never the title the row shows. A same-document link query exists only for `](#`; a path fragment such as `note.md#section` is not offered |
| What writing a delimiter line opens, and what a bare block marker is | `editing/fence_open.ts` is the rule — the delimiter becomes both of a fence's lines with the caret on the blank line between them, and a fresh code fence asks for its language (`editing/language_picker.ts`) — and `syntax/bare_markers.ts` is the repair that keeps a bare `-` from rendering as an item and bare `#` characters from rendering as an empty heading (`syntax/markers.ts` says what a marker and a delimiter are). The rules have their checks (`check-fence-open.mjs`, `check-bare-markers.mjs`) and their probes (`fence-open-typing.js`, `bare-marker-typing.js`, `blank-line-heading.js`) |
| A surface that floats over the page — a card beside a point, a panel above or below its button, a question over the window | `src/ui/floating/` — one base and three kinds: `surface.ts` (`FloatingSurface`: hidden until opened, the card's chrome in `CHROME`, Escape, and the refusal to take the focus or the caret), `beside.ts` (`BesideCard`, `fixed` on the body and placed by `placement.ts`'s pure rule beside a box the caller measures — the caret's range, a marker, a row — or in the window's corner when it names nothing; the pointer policy is what it is built with), `panel.ts` (`AnchoredPanel`, `absolute` inside its `relative` host and hanging by its own `side` — `below` by default, `above` where the host sits against the bottom), and `question_card.ts` (`QuestionCard`: the veil, the centred card a subclass fills, one answer at a time, and Escape giving the cautious answer). The footnote preview, the completion list, the stack panel, the table picker, the prompt and the two cards are one of those kinds; a kind may add to Escape and never replace it, and the base grows no mode flag — a fact one kind has is a parameter it is built with, or a subclass of it. Whatever a probe finds inside a surface (`[data-prompt-yes]`, `[data-completion-row]`, `.markdown-footnote-preview`, …) stays where it is: the migration changed how a surface is built, never what it is called |
| Something the app has to tell the reader, or wants them to notice | two surfaces, and the difference is whether the reader has to *act*: a **message** (`services/messages.ts`: `Message`, `MESSAGE_EVENT`, `notify`) is a failure and needs their attention, so `ui/messages.ts` (`installMessages()`) shows one `BesideCard` per message in the window's bottom-right corner — whatever it is about — stacked upward, with its ✕ at the card's right edge, closed by the ✕ or Escape and by nothing else; a **hint** (`services/hints.ts`: `Hint`, `HintPlace`, `HINT_EVENT`, `hintPlaceSelector`, `showHint`) is a confirmation the reader only has to notice, so `ui/hints.ts` (`installHints()`) shows one card beside the row it happened on, with no ✕, gone at the next press or Escape, replaced by the next hint. A hint's place travels as a *name* — a workspace path, which is the row its selector finds — never as an element, because the bus is Tauri's and its payload is JSON, and `hintPlaceSelector` escapes it |
| Where the caret goes, or how it maps | `caret/*` (`offsets.ts`, `dom_position.ts`); a click that lands on no node is `editing/pointer.ts`, routed by `click_routing.ts: routePointerClick` |
| When raw source is shown instead of a rendering | `source_mode.ts` |
| An inline run while the caret is inside it — bold, italic, strikethrough, inline code | `nodes/strong.ts`, `nodes/emphasis.ts`, `nodes/delete.ts`, `nodes/inline_code.ts` over `nodes/revealable_node.ts`; the source classes are in `caret/offsets.ts: SOURCE_SELECTOR` and the styling in `styles.css` |
| The word an input method is composing, as the reader sees it | `editing/composition_view.ts`, driven by the seam (`editing/composition_input.ts`) — written into the line at the caret, never in the document, and taken out again when the word commits |
| Spacing, laziness, virtualisation | `virtual_block_renderer.ts`, `block_sizes.ts`, `styles.css` — the page's rhythm is written in the page's own scale (`.prose`'s `--md-page-scale`), and the estimator of an unmeasured block's height reads the same line height and paragraph skip, so a page drawn smaller estimates smaller |
| How big a page the editor is, and the desk under it | `styles.css` (`.markdown-page`, `.markdown-scroller`) — the root's class list in `virtual_block_renderer.ts` names the page, and `markdown_editor.ts: fitPage` sets `--page-scale` from the width of the pane (capped at 1, watched by a `ResizeObserver`) so the sheet, its margin and its type shrink together rather than the pane scrolling sideways; a document opens at its own top (`setContent`), because a 297 mm sheet is taller than the pane and nothing clamps an old scroll away. Which of the two layouts is on is one attribute the editor owns (`data-layout` — `page` or the full-width `auto`), set by `setLayout`, switched by the `view:togglePage` command and drawn by `layout_toolbar.ts` in the status bar; the choice is remembered in the app config |
| A colour — a syntax token, a surface, the ink on it | `styles.css`, and only in daisyUI's own tokens: a fixed palette is what made highlighted source illegible in the light theme |
| Which documents are open, what the stack holds, and where the reader was in each | `services/session_rules.ts` (the rules), `services/session.ts` (the living session), `src-tauri/src/session.rs` behind `src/api/session.ts` (the file). The editor is a view of it: `editor_panel.ts: captureView`/`restoreView`, and `virtual_block_renderer.ts: scrollAnchor`/`scrollToAnchor` for the view. A click in the workspace tree hands the path and the text to the session rather than to the editor — it is the session that decides whether the document on screen has to be asked about, which is only when its text is not what its file holds (`openDecision`); the reader may answer that in advance with the General tab's switch (`push_unstacked_on_open`, the app config). **A view with no caret means no caret**: a document opened with nothing remembered (`caret: null`) is drawn as it is written and no caret is placed, because a caret invented there is one the reader never put anywhere — and it *decides what the page shows*, since a node the caret is in renders its own markdown (a note opening on a picture opened on the picture's markdown). The reader's first keystroke places one at the text's own start (`editing/text_commands.ts: textSelection`) and their first click places one where they clicked; a caret the session *does* remember comes back exactly where it was, which `test/probes/document-opens-without-a-caret.js` holds both ways |
| A first start with no workspace | the rule is `services/workspace_setup.ts` (`needsWorkspaceQuestion`, over the config's `workspace` and `workspace_asked`), the card and the flow are `src/ui/workspace_setup/`, and `main.ts: initializeConfig` asks before the session restores a document. The card says where a new workspace would be made (the documents folder's own path plus `DEFAULT_WORKSPACE_NAME`), the reader's "use an existing folder" is the system picker and a probe's is a path field, and what the answer does is `workspaceManager.openWorkspace(path)` — the same call the File menu's *Open Folder…* ends in, so the tree, the config and the session follow one path. Declining writes nothing (`workspace_asked` stays false) and is asked again next start |
| A new note: its id, its frontmatter, and where it goes | the rule is `services/new_document.ts` (pure: the fourteen digits, the four required keys and the title's range), the places are `services/workspace_folders.ts`, and the doing is `src/ui/new_document/` — the flow, registered as `file:newMarkdown`, and the card the menu path asks on. The template is the app config's `new_file_frontmatter` |
| A version of a workspace, kept by Git | the facts are Rust (`src-tauri/src/versioning/`: `git.rs` finds the one git and owns initialization and commits, `facts.rs` answers the repository and cloud facts, and `versions.rs` reads a note's versions), the decision is pure (`services/versioning.ts`: `versioningPlan(facts, consent)`, the config's `versioning`/`versioning_workspace` read through `consentFrom` — an answer given for another folder is no answer — and `versionMessage`; `test/checks/check-versioning.mjs` walks the whole table), and the doing is `src/ui/versioning/save_version.ts`, registered as `version:save` — the File menu's *Save a Version*, and the only action in the app that runs git. It asks the plan's own question first (`versioning_dialog.ts`, a `QuestionCard` with the prompt's two hands), refuses a note with no file in one sentence, captures the editor's text and writes it **atomically** (`files.rs: write_atomically` — temp file plus rename, the one shape the session's own write uses too), and commits only the file it wrote: `git add -- <path>` then `git commit -m <message> -- <path>`. Every git call goes through one helper (`versioning/git.rs: run_git`), and what the app may never ask git to do is held by `test/probes/versioning-fake-git.js`, which points it at a git that only records; `src/api/versioning.ts` is the seam to the four commands, and the git is *named* for tests (`YI_GIT`, or the debug-only `versioning_use_git` a probe needs because it cannot change the environment of the app it drives) |
| The versions of the note on screen, and the words a version carries | `services/versions.ts` is the living list — it reads through `src/api/versioning.ts` only when `versionsVisible` (consent for *this* workspace, from the config) and only when the document's *path* changes, so a keystroke costs nothing, and rereads when the history modal opens or a version is saved — announcing `VERSIONS_CHANGED`; `services/versioning.ts` holds the pure parts it draws with (`versionStamp`, `versionsVisible`, `versionsState`). `src/ui/versioning/version_status.ts` is the button at the status bar's left (its stamp drawn at the bar's own size and weight, `text-xs font-normal` — a `btn`'s 600 is the one thing a status bar never wants). `version_history_modal.ts` opens only for a `ready` history with at least one version: a template-editor-style centred modal whose left column lists versions newest first, with the newest selected. No file, repository, version or readable history means no modal. `version_comment_dialog.ts` is the card that asks what to call a version — one hand only, since no system surface answers with a line of text. The read itself is `versioning/versions.rs: versioning_history` — one `git log --follow --max-count=… --format=… -- <path>` through the one helper — so the app's vocabulary is three writes and this one read, and `commit_paths` takes a `body` that becomes the commit's second `-m` |
| Seeing a version and going back to it | `ui/versioning/version_diff_view.ts` is the history modal's right column. A row press selects that version in place and replaces the column; it does not close the modal or open another surface. The pane draws `services/text_diff.ts` — two texts as the whole document in lines, `same`/`removed`/`added`, the equal ends trimmed only to compute, past a cap a `replaced` count for the catalogue to word — and opens at the first change. The modal keeps the keyboard while it is open and hands it back on close (`markdown_editor.ts: focusText`; the scroller carries `tabindex="-1"` so that always works). The version's own bytes come from `versioning/versions.rs: versioning_version_text` (`git show <revision>:<path>`, through `Command` rather than `run_git` because the answer is bytes, refused when they are not text), which is why every history row carries the path the file had *at its commit*. A restore is one question with a cancel that changes nothing (the app's own `ui/prompt.ts`, Escape being the cautious answer) and then `documentSession.openVersion(path, content)`: the file is written atomically, the document (keyed by its **path**) has its text replaced, and nothing is kept for the reader — they answered restore. No git write happens at all — held by `versioning-fake-git.js` |

## Extension points

Every extension point is a named file — never "the renderer" — and each one is
reached in a way the next person can copy:

| Extension point | The file that owns it | Adding one |
| --- | --- | --- |
| A markdown construct's rendering | `nodes/<type>.ts`, registered in `create_node.ts` | `docs/adding-a-node.md` |
| Whether a node's markdown can stand in for its rendering | the `showsSource` flag in `registry.ts: registerComponent` | `docs/adding-a-node.md`, step 4 |
| Which source is shown, and where a click enters it | `source_mode.ts`, with `nodes/revealable_node.ts` | `docs/adding-a-node.md`, step 4 |
| A footnote: a marker you click into, a note you jump to | `nodes/footnote.ts`, `click_routing.ts` | a click on a marker is the marker's own: it opens the label as its source, in place, with the caret at the end of the label's content. Ctrl-click (⌘-click, and the `contextmenu` macOS makes of it) goes to the note — the definition is scrolled into view and the caret lands at the start of its text. The notes run draws the label as the marker it is (`[1]`) and asks for it as its own source while the caret is in it (see the row below); Ctrl-click there jumps back to the marker. The marker renders as an `<a href="#fn-label">`, which no click follows: `nodes/editable_node.ts` prevents it, and the jump's own handler prevents it too, so a click never scrolls the webview to the fragment. A definition is a definition of the *document* wherever it is written, so the line the jump looks for is read past the container markers markdown allows (`> [^1]: note` inside a quote is one note, not a quote's); a marker inside a table cell is one too, and a definition written *in* a cell is not — those characters are the cell's text |
| A link you can write, and one you can open | `syntax/link_edits.ts` (`linkInsertion`, `clipboardDestination`, `isOpenableUrl`), `editing/links.ts: insertLink`, `click_routing.ts: routeLinkClick`, `src/ui/toolbar/link_toolbar.ts`, the app's clipboard read (`src/api/clipboard.ts`) | the Link button runs `edit:insertLink`, which writes `[title](destination)` where the caret is — around the selection instead, which becomes the title — and fills the destination from the clipboard when the clipboard holds one token with an `http:`/`https:`/`mailto:` scheme. The caret lands in the title part, so the next keystroke writes it. A destination markdown cannot read plainly (a space, an angle bracket, an unbalanced parenthesis) is wrapped in `<…>`, which is what CommonMark offers for exactly that. The clipboard is read by the **app**, not the webview (`src/api/clipboard.ts` over `tauri-plugin-clipboard-manager`'s `read_text`, granted by `clipboard-manager:allow-read-text` in `src-tauri/capabilities/default.json`): a scripted `navigator.clipboard.readText` in WebKit puts its own paste confirmation in front of the reader, and this button is not asking them to paste anything. The plugin reads the platform's pasteboard natively on every platform the app ships on — on macOS the same `NSPasteboard` read the app used to hand-write — so there is no webview fallback left to ask, and a read that finds no text, or is not allowed, is not an error: the destination is written empty for the author to fill in. ⌘-click (Ctrl-click) on a rendered link hands its href to the system browser through the app's opener — the webview never navigates to it — while a plain click opens the link's source for editing, and a link with nothing openable (a relative path, a fragment) keeps that plain click, because opening its source is the only thing left that it can mean. One rule decides what may be opened (`isOpenableUrl`), and the preview card's own links use it too | **A *path* in a destination is the app's to open**: ⌘-click on a link to the note beside the one being read — or one written from the root of the workspace — opens that document, resolved the way an image's path is (`services/workspace_folders.ts`, including the `%20` spelling a copied path carries) and opened through the session, exactly as a tree click does (`ui/editor_panel.ts`). A `#fragment` and an empty href name no file and keep the plain click, and a URL keeps its own gesture. `link-opens-a-note.js` holds the gesture, `link-cmd-click.js` the browser's side of it
| An image you can write, and one you can see | `syntax/image_edits.ts` (`imageInsertion`, `clipboardImageDestination`, `imageFileName`, `imageKindFor`), `src/ui/image/` (the flow and the card), `src/ui/toolbar/image_toolbar.ts`, `src/api/clipboard.ts` (the text *and* the image reads), the path rules in `services/workspace_folders.ts`, the renderer's `image_sources.ts`, `nodes/image.ts` with the asset protocol, and `syntax/spaced_destinations.ts` for the path's own spelling | the Image button runs `edit:insertImage`, which reads the clipboard and does one of three things: a *destination* it is offering (a web URL, a `file://` URL, a path ending in an image kind) is written as `![alt](destination)` where the caret is, the link button's own insertion rule with the `!` in front; an *image* is asked about on the app's card — which has no native twin, because no system surface can draw the picture — and saved; and a clipboard with neither leaves an empty `![]()` for the author. The card's name is the pure rule's (`imageFileName`: the app's stamp as `.png`, another extension only when it is one this app can write), the pixels come off the clipboard as RGBA and are drawn on a canvas, which is what writes the PNG (or the JPEG/WebP the name asks for), and the file goes into the settings' image folder or beside the note. The text says where it is as a path **relative** to the folder the image is read from, and `image_sources.ts` reads it back: the note's folder first, then the image folder, each turned into a URL the page may load through `convertFileSrc` and the `asset:` protocol (`tauri.conf.json`, scoped the way the file plugin is). That is the one thing this feature adds to the app's own surface: a page cannot load a file at all, so a local image needs a protocol that may serve one. A path a reader *wrote by hand* needs two things more. Markdown refuses a destination with a space in it (`![shot](my shot.png)` is a paragraph of that text, which is how another editor's notes come), so `spaced_destinations.ts` reads such a run as the image it names — wherever it stands, since the `)` ends the path — and leaves an escaped one (`\![`) and code alone. And a path *copied* may spell a space the way a browser does (`my%20shot.png`), so `workspace_folders.ts` tries the spelling it resolves to **before** the one as written: the resolved path is the one meant, and the webview accepts the asset protocol's 404 for a `%2520` URL as a *load*, so a chain that reached the written spelling first would stop there — measured, and the reason the order is not the other way round. `check-spaced-destinations.mjs` and `check-workspace-folders.mjs` hold the two readings, and `image-path-with-spaces.js` the whole way: both folders, both spellings, the asset protocol and the pixels |
| A source that is only *part* of its node | `source_mode.ts: isShownSourceRange` | a footnote definition's node covers the whole note, and the note's text is rendered prose the author edits where it sits, so the label asks whether the shown range is its own (`node/footnote.ts`, over the shape in `syntax/footnotes.ts: markerShape`) instead of whether it is the node's (`isShownSource`), and `editing/context.ts: sourceRangeIn` names that range for the caret. The source it shows is the document's characters and keeps the `data-text-from` tag that says so, while the drawn marker carries none — `[1]` is not the document's text |
| A piece of highlighted source — a fenced code block, the frontmatter, a formula's own text or its revealed source | the palette in `styles.css` (`--md-source-*`), and one highlighter per kind: `nodes/code_highlight.ts` (a fence's language, or a guess at it), `nodes/frontmatter_highlight.ts` (the block's YAML), and `nodes/latex_highlight.ts` (a formula), each drawn into the `pre` `nodes/fence_text.ts` builds | the box is the prose's own `pre`, which every one of them is, so they share it; the palette is what follows the theme. Each token is two thirds of a daisyUI hue mixed into `base-content`, so the ink is as dark or as light as the theme's own text and the hue is most of what is left — the first version mixed a quarter of the hue and every token came out a pale grey (0.02 from the plain text in oklab; the probe now holds 0.05). The hues are `primary`, `secondary` and `accent` because they are dark in winter and light in dim; `success`, `info` and `warning` are *surface* colours in a light theme and measure under 3:1 as text. There is no fixed stylesheet left to fight: the one this replaced was drawn for a single dark background, and its tokens measured 1.70–2.15:1 against winter's `base-200`. A diff's deletion marker is the one token held to 3:1 rather than 4.5 — a legible red does not exist in the light theme, whose `error` is a surface colour |
| A fenced block's two shapes, and a click in either | `nodes/fence_text.ts` — a fenced code block and a frontmatter block render the characters *between* their delimiter lines while the caret is elsewhere, and all three show the block's own text, delimiters and all, while the caret is inside it | it is an `EditableNodeComponent` over a block rather than over a parsed node, so it tags itself with the block-relative start of the text it shows (`syntax/markers.ts: fenceBody` — the body's, or zero for the block's own text) and a click resolves to the character under the pointer instead of the nearest block edge (`editing/pointer.ts`), which is what `routePointerClick` falls back to when no `.markdown-node` answers. The delimiters are drawn only while the caret is inside the block (`source_mode.ts`), and because the body carries the last content line's newline, a blank line at its end has a line of its own to hold the caret — a rendering built from the parsed node does not, which is what made Enter at the end of a fenced block leave the caret behind. `test/probes/source-highlight-caret.js` holds the click, `code-enter-line.js` the line, `fence-source-mode.js` the two shapes and their labels, and `fence-exit.js` leaving a block by its closing fence |
| A click that opens a node as its own source | `source_mode.ts: enterSourceOf`, with `markdown_editor.ts: enterSource` | every `RevealableNodeComponent` reaches it — a link from its own capture-phase handler (`nodes/link.ts`), a citation, a wikilink, a formula and a footnote label from `placeCaretAt`. It enters at the node's content end (a rendering cannot name the character clicked) and then keeps the scroll (`editing/context.ts: keepScroll`): a click is not a request to move the page, and a rebuild under the reader otherwise does move it. The footnote *jump* is a request, and reaches `revealOffset` instead |
| A wikilink's target, and the click that follows it | `nodes/wikilink.ts` (the target on its own element), `click_routing.ts: routeWikilinkClick`, `wikilink_open.ts` (the port), `ui/editor_panel.ts` (the shell's answer) | a plain click is the editor's: the node shows its own markdown. ⌘-click (Ctrl-click) asks for the document the target names — the target, not the title on screen, which belongs to the other document and may be stale — and the shell resolves it (`services/document_manager.ts`, the index the completion list writes into) and opens it through the session, exactly as a click on a row of the tree does. A target no document answers to leaves the document alone and says which target it was (`wikilink.notFound`; `test/probes/wikilink-cmd-click.js`) |
| A rebuild that moves the page, when the reader did not ask for one | `editing/context.ts: keepScroll` (an edit or an opened source), `caret.ts: showCaret`/`scheduleCaret`'s `scroll` flag (a caret that moved brings itself into view; one that was *put back* where it already was does not — `markdown_editor.ts: reanchorCaret`, `restoreView`) | the reader's own moves — a keystroke, an arrow, a click, a find, a reveal — scroll; a *consequence* of the editor's own work — a block rebuilt, a source opened, the virtualised window turned over, a document restored to the place it remembers — does not. The scheduled caret also waits past the rebuild's provisional first frame: painting from that measurement put a table caption's caret at the table's temporary top, while its logical offset was correct (`caret/span.ts: scheduleRender`, `caret-rebuild-line.js`). Measured both ways: a click on the citation just above the fold moved the view 24px a frame later, and scrolling up from the end of a document moved it **1097px** to a caret that had not moved (`test/probes/reveal-click-scroll.js`, `scroll-caret-anchor.js`) |
| What a construct draws, for the caret | `caret/offsets.ts: renderedLength` and `mapNode`, with `caret/dom_position.ts: mapNodeRawToRendered` | a marker draws `[label]` for the `[^label]` that was written, one character shorter, so a definition draws a marker's worth of characters and then its note. Both directions of the mapping carry an offset *inside* that drawn label to the marker's own characters, which is what puts the caret in the source the label shows; counting only the note left the caret three characters into it (measured: `The first note.` came out `ThXe first note.`). The position just *past* the drawing is the note's own start, because the drawn label is a character shorter than its source and that edge has to belong to one of them: given to the label, a click in the gap right of it wrote into the label (measured: the button's own `[^1]: ` came out `[^1H]: `) while a click on the note's first character, one pixel on, wrote into the note |
| What a marker shows while the pointer rests on it | `footnote_preview.ts`, with `nodes/footnote.ts: renderFootnoteBody` | a card holding the note the marker names — its own words, no label, because the marker the pointer is on already says which note it is — rendered by the same components the notes run uses and read from the *document* (a definition's block is usually not mounted); it appears after a 200 ms dwell, is read-only against the document, takes the pointer so the note can be read and a link in it opened through the app's opener, wears the find bar's `rounded-md` because they are the app's only floating surfaces, and leaves a 250 ms grace after the pointer is on neither it nor its marker, on scroll, on a click in the text, or on `Escape` |
| A command the author can ask for | the id in `commands/registry.ts`, the work registered in `markdown_editor.ts: registerCommandEvents`, the trigger | `docs/adding-a-command.md` |
| A bundled read-only guide | `src/ui/reference_document.ts` opens text in the session with no path and `readOnly: true`; the tutorial and Documentation each own only their text and command | Help → Open Tutorial and Help → Documentation (`F1`) use one reference rule. A guide never enters the stack, is not written into the reader's workspace, and a click on any note replaces it without a save question |
| A new note — where it goes, what it is called, what it opens with | `src/ui/new_document/new_document_flow.ts` (the command `file:newMarkdown`), `services/new_document.ts` (the text), `services/new_document_builtins.ts` (app-owned presentation starters), `services/new_document_templates.ts` (template-package metadata), `src/ui/new_document/new_document_dialog.ts` (the card) | the command is the one home for the behaviour, so a trigger that already knows the folder passes it as the payload and the trigger that does not (the menu item, by way of `commands/menu.ts`) gets the card. The text is built by the pure rule, never by the trigger: the id names the file *and* is stamped into the frontmatter, `date` and `id` are written over whatever the template says there, `title`/`keywords`/extra lines are kept as the template wrote them, and a required key the template leaves out is appended. The built-in Reveal.js and Beamer starters are note metadata rather than export-template packages, and no choice is remembered as a later export template. The note is then opened through the session with `titleRange` selected, which is one more reason the session owns the view (see the row above) |
| An export template package | the manifest, import rules, defaults and asset packers are `src-tauri/src/export/templates/`: `scan/{mod,source,archive,detection,wrapper,tests}.rs` and `package/{mod,import,library,editor,alias,storage,tests}.rs` preserve the scan and package facades while separating source safety, ZIP handling, detection, wrapper conversion, package lifecycle, editor access, alias staging and filesystem naming; defaults and asset packers remain in `defaults.rs`, `validate.rs`, `assets.rs` and `epub_pack.rs`. The export run is `src-tauri/src/export/run/{mod,arguments,delivery,environment}.rs`: its facade owns the request/outcome and run cleanup, arguments own Pandoc and template resolution, delivery owns sidecar and bundle files, and environment owns scratch/output/PDF context. Note media for non-self-contained HTML is `src-tauri/src/export/html_media.rs`; portable LaTeX picture paths are `src/ui/export/latex_images.ts`; the ODT contents cache is `src-tauri/src/export/odt_toc.rs`; native bibliography rules are `src/ui/export/native_bibliography.ts` over `src/citations/library.ts`; package metadata for a new note is `src/services/new_document_templates.ts`; the export choice is `AppConfig.export_templates`; the window is `src/ui/export/templates/` | a package is a folder under the app's export data, never a workspace document: `template.json` is app-written, one entry is either a text template (`template`/`wrapper`) or a binary reference document. The chooser shows readable packages only for the active export kind; a package with no readable manifest stays listed only for removal. The two `mod.rs` files are the stable caller-facing boundaries; their children own the rules. `defaults.rs` chooses a root `export.yaml`, else `defaults.yaml`, and passes it after the app's defaults so package settings override while explicit output/template paths still win; a PDF defaults file that enables shell escape is refused. A new note may borrow a package's root `metadata.yaml` for that note only. `assets.rs` owns relative-URL reading; LaTeX copies the whole asset tree, except that a native-BibTeX package's declared `references.bib` is generated from only the citation keys in the note and replaces the package sample. A note-local picture replacing a package asset keeps that relative path and its bytes win; other local pictures are copied under `<output-stem>.assets/`, so the `.tex` never carries a machine-specific source path. HTML uses a temporary folder alias so self-contained output embeds what the template names and copies the tree when it does not, while `html_media.rs` copies the note's local pictures to `<output>.assets/`; `epub_pack.rs` packs web assets into the book and declares them in `content.opf`; `odt_toc.rs` fills Pandoc's empty ODF table-of-contents body from the generated heading bookmarks, so LibreOffice and OnlyOffice both show the automatic contents before the field is refreshed. A new kind needs a `template_mode` row in `kinds.rs`; the import inspector and the editor read that row rather than naming formats. The code panel is `editor.ts` (CodeMirror 6, YAML/TeX, atomic save, validation), the chooser is `library.ts`; neither touches the session. The PDF run works from the entry's folder with the package root on the TeX/BibTeX search paths, and no template path is ever read from the webview |
| A presentation export | the registry rows are `src-tauri/src/export/kinds.rs`; shared rewrite membership is `src/ui/export/kind_family.ts`; Reveal.js bundling is `src-tauri/src/export/revealjs.rs`; the card and request are `src/ui/export/card.ts` and `src/api/export.ts` | Reveal.js and Beamer are registered kinds with `KindTemplate::None`, so neither can select a template package. Beamer belongs to the LaTeX rewrite family and writes one PDF through Pandoc's Beamer writer; its frontmatter owns theme and geometry, so the card offers no page-size control. Reveal.js belongs to the HTML-like rewrite family but `run_export` first converts its target into `<deck>/<deck>.html`, then `package_revealjs_media` copies local pictures to `images/`. If remote Reveal.js resources are off, `download_revealjs_assets` reads the finished page and turns each local `js/dist/...` reference into `<pinned-root>/dist/...` before fetching it asynchronously. The downloader no longer asks the CDN for a nonexistent `js/dist` path. A newly-created bundle is removed on failure; an existing destination is preserved. The initial invalid Reveal.js defaults copy is migrated only when its bytes exactly match the shipped broken file, so edited settings survive. If remote pictures are off, the shared media packager downloads them into `images/`; the two resource choices are independent and default off. The Rho Class example keeps its original custom callout lead-in and constrains its figure to 70% of a two-column text width. The complete reference decks live in `examples/` for readers; nothing in the app resolves a path there |
| A string the app shows | `locales/<language>.json`, read by `src/services/i18n.ts` (every window) and `src-tauri/src/i18n.rs` (the menu) | one file per language, flat dotted keys, `{name}` parameters; English is the fallback every key is written in. The menu reads the *same* files from Rust because it is built before any page exists and must not depend on one loading — and because Tauri's predefined items are titled in English unless given text, so every label comes from the catalogue. Neither reader is allowed to hold a string of its own: `test/checks/check-locales.mjs` compares the keys the two sides use with the keys the files have |
| How the document splits into blocks | `document/blocks.ts` | a task in the block model, plus `test/checks/check-blocks.mjs`. A `paragraph` block is every other run of consecutive non-blank lines, and the parser re-splits it into headings, lists, tables and the rest — so a block holding several constructs is by design. What the run may *not* swallow is a fence or a display formula: both may interrupt a paragraph (markdown reads them as blocks when they do), and both are kinds whose own text is the shape the app shows while the caret is inside them (`block_kinds.ts: hasSourceMode`), so a formula folded into a paragraph is one whose source cannot be shown at all — measured on `notes/Game Theory/6 Bayesian Game.md`, whose `$$` regions have no blank line around them: a click on one entered the paragraph's text and nothing appeared, while the same click on a formula that *is* its own block enters its text (`display-math-source.js` holds both) |
| A pure rule about markdown | the matching `syntax/*.ts`, named in the one-fact-one-home table above | `docs/testing.md` — rule-shaped means `test/checks/` |
| What a block is worth in pixels | `block_sizes.ts` | a case in `test/checks/check-block-sizes.mjs` |
| Which blocks are mounted | `viewport_window.ts` | the same |

The caret's scroll rule has a second axis inside highlighted source. A structural edit
can rebuild the fenced block, so its `pre` is new and starts with `scrollLeft` at zero;
a caret restored at the end of a long fence line would otherwise be outside that box
even though the page's vertical position is right. `caret/span.ts: scrollCaretIntoView`
therefore scrolls the nearest horizontally scrollable source around the caret's range,
then repositions the span because it is drawn beside the prose host rather than inside
the source (`test/probes/listing-source-horizontal-caret.js`).

The registry (`registry.ts`) is the one place that says which node types exist, so
the renderer can stay a consumer of that table rather than a second list of what
markdown means. The recipes that use these points are `docs/adding-a-node.md` and
`docs/adding-a-command.md`.
