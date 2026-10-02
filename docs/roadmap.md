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
- **The label drawn, and the marker a jump.** Landed as the next phase,
  `docs/superpowers/plans/2026-09-25-a-rendered-label-and-a-jumping-marker.md`: the
  notes run draws the label as the marker it is (`[1]`, what the marker in the text
  draws) and shows `[^1]` only while the caret is in it, so the reveal is a change of
  characters rather than of weight; the preview card is the note's words alone, with no
  label in front of them; and Ctrl-click (⌘-click) on a marker goes to its note — scrolled
  into view, the caret at the start of its text — while a plain click still opens the
  marker's own label, in place, as its source. That last one cost a caret rule: with the
  label drawn a character shorter than it is
  written, a caret that walked into it landed **three characters into the note**
  (measured: `The first note.` came out `ThXe first note.`), which is why
  `caret/offsets.ts` now says what a definition draws. `test/probes/footnote-jump.js`,
  `footnote-source.js`, `footnote-jump-back.js` and `footnote-preview.js` hold it.
- **The footnote shapes the probes never saw.** Landed as
  `docs/superpowers/plans/2026-09-25-the-footnote-shapes-outside-one-paragraph.md`: the
  probes hold a definition written inside a description detail, a list item and a
  blockquote — and the table cell markdown has no definition for — two markers naming one
  label, a label whose case the author chose, an undone label edit, a label left mid-edit
  while its block is rebuilt, and the caret at the `]: ` boundary just after a drawn
  label. Measuring each on the app before writing it found **three bugs**, all fixed:
  a definition written inside a blockquote (`> [^1]: note`) was invisible to the
  document's label scan, so a marker elsewhere in the note stayed the literal text
  `[^1]` and the ⌘-click from a marker *inside* the quote had no note to go to (it fell
  back to the marker's own reveal, the caret landing inside `[^1]`); a click in the gap
  right of a drawn label wrote **into** the label, so the button's own `[^1]: ` came out
  `[^1H]: `; and a block that had borrowed the document's definitions kept its stale
  parse, so renaming a label in the notes run left the markers that named it still
  drawing `[a]` until the note was reopened. The line rule now reads past the container
  markers markdown allows, the drawn label's right edge belongs to the note, and a block
  holding a marker keys its parse and its rendering on the labels it borrowed
  (`document/state.ts: parseKey`).
- **A click that opens a source moved the page.** Reported by the user as a click on a
  citation or a wikilink "causing a jump", and fixed as its own small phase
  (`docs/superpowers/plans/2026-09-25-a-click-that-does-not-move-the-page.md`). Measured
  on the demo document with its thematic break just below the fold — the arrangement the
  report is about, reached by scrolling *down*: a click on the citation above it moved
  the scroll **24px** a frame later, with the layout unchanged and the caret on screen.
  Every source-opening click goes through one seam (`markdown_editor.ts: enterSource`),
  and it now keeps the scroll the way an edit does (`editing/context.ts: keepScroll`).
  `test/probes/reveal-click-scroll.js` holds it (it fails without the fix by 24px), and
  the footnote jump — a move the reader asks for — still scrolls.
- **Writing a link, and opening one.** Landed as
  `docs/superpowers/plans/2026-09-25-link-insertion-and-cmd-click.md`, on the user's ask:
  a Link button in the title bar carrying the icon they gave; `edit:insertLink` writing
  `[title](destination)` at the caret — or around the selection, which becomes the title
  — with the destination taken from the clipboard when it holds one `http:`/`https:`/
  `mailto:` token, and the caret left in the title part to be typed into; and ⌘-click
  (Ctrl-click) on a rendered link handing its href to the default browser through the
  app's opener, while a plain click still opens the link's source for editing. What a
  link is written as, which clipboard text is a destination and which href the app may
  open are one home (`syntax/link_edits.ts`), and the preview card's own rule moved
  there; `test/probes/insert-link.js` and `link-cmd-click.js` hold the two behaviours. On
  the user's review the icon became the 16×16 one they sent, and the clipboard is read by
  the app rather than the webview (`src-tauri/src/clipboard.rs`, `src/api/clipboard.ts`);
  WebKit answered a scripted read with its own paste confirmation, which a click that
  only meant "fill the URL in" should not raise. `insert-link-clipboard.js` covers the
  read's three outcomes. The read itself then became a plugin, on the user's ask
  (`docs/superpowers/plans/2026-09-27-the-clipboard-plugin.md`): the hand-written module
  read the general pasteboard on macOS only and answered `None` everywhere else — where
  the frontend's WebKit fallback put the very confirmation back. It is
  `tauri-plugin-clipboard-manager` now, which reads natively on every platform the app
  ships on (on macOS, through the same `NSPasteboard`), so the app owns no `unsafe`
  binding and there is no fallback left; the probes stand in for the plugin's `read_text`
  command, and both check the webview's clipboard is never asked.
- **The formatting buttons drew nothing.** Landed as
  `docs/superpowers/plans/2026-09-25-the-format-buttons-stale-block.md`. Pressing Bold (or
  Italic, Strikethrough, Inline code) wrote the markers into the text and left the view as
  it was: the raw text said `**Alpha** beta.` and the paragraph still showed the plain
  `Alpha beta.`, with `Error: this block is not in the index` thrown between the two. Two
  causes, one behind the other.
  `editing/formatting.ts` held the **blocks from before the edit**: a block's positions are
  the document index's (`document/blocks.ts` over `block_index.ts`), the whole-document edit
  re-splits the blocks, and the index answers for a block it no longer holds with an error —
  by design, rather than with a position that belongs to another block. The command now asks
  the state by offset after the edit, the same two offsets the patch reads its own block
  from, so the blocks it patches and re-renders are the ones the edit left.
  Behind that, the in-place **patch** (`format_dom.ts`) wrote the block's own markup where
  the renderer could not see it: an element is remembered by the content it was *built*
  from, so the next edit back to the older text looked like nothing to re-render — undoing
  Bold over `world` left the `<strong>` and its shifted `data-text-from` on screen, and the
  selection mapped through them (`wor` of `world` came back selected). A patched block now
  tells the renderer what it holds (`virtual_block_renderer.ts: notePatchedBlock`).
  `test/probes/format-buttons.js` fails without the fix and passes with it; the undo case is
  `test/probes/undo-selection-return.js`.
- **Manipulating the workspace tree.** Landed as
  `docs/superpowers/plans/2026-09-25-manipulating-the-workspace-tree.md`, on the user's ask:
  a right-click on a file or a folder opens a menu that renames, deletes, makes a file or a
  folder under it, reveals it in the system file manager, or copies its path, its name or
  its frontmatter id; and entries drag into folders to move. The filesystem's rules are the
  backend's (`src-tauri/src/files.rs` with Rust tests, wrapped in `src/api/files.ts`) and
  the tree holds none of them twice; what a row may be offered is a pure model
  (`tree_menu_model.ts`) and so are the rename's selection and the drops' rules
  (`tree_rules.ts`), each with a Node check — because a native menu and a native dialog can
  be neither read nor driven by a probe (`docs/testing.md`). A rename is edited in the row's
  own label: the tree's geometry is asserted unchanged while it is open, and the edit starts
  with the name — not the extension — selected, so typing replaces the name and the `.md`
  stays (`test/probes/tree-rename.js`). The tree itself moved to `src/ui/workspace/`, one
  module per interaction (menu, rename, drag, ops).
  **On the user's review:** Copy name copies the name without its extension (one rule,
  `tree_rules.ts: nameWithoutExtension`, shared with the rename's selection); the drag is
  built from the pointer's own events rather than the browser's drag and drop — measured on
  the app, the rows were `draggable` and WebKit agreed (`-webkit-user-drag: element`), and
  the webview still never delivered a `drop` to a row — which is also the part a probe can
  drive, and `tree-drag.js` now does; and the editable name keeps square corners.
  **And the tree updates only what changed:** a change re-reads the one or two folders it
  touched and reconciles their rows — an entry still there keeps its row, its open folders
  and its listeners, and the rest of the tree is not touched — rather than rebuilding the
  tree from the root; `tree-drag.js` asserts that the rows a move never reached are the very
  same elements, and that no page reload happened.
  **And the page itself stays put:** the app is opened on the fixture workspace, which is
  inside the repository, so every tree write is a change under the dev server's watcher —
  `vite.config.ts` now ignores it (data, not source), and a row is barred from being a
  native drag source three ways over, so the webview can neither take the press over nor
  be navigated to a dropped path. `test/probes/tree-no-reload.js` works *in* that workspace
  for the first time and holds both.
- **Highlighted source follows the theme.** Landed as
  `docs/superpowers/plans/2026-09-27-highlighted-source-follows-the-theme.md`, on the user's
  ask: highlight the frontmatter like a fenced code block with a light background that
  changes with the theme, and then the same for fenced code and LaTeX source mode.
  highlight.js's `tokyo-night-dark` stylesheet is gone — its tokens are drawn for one dark
  background and measure 1.70–2.15:1 against winter's `base-200`. In its place
  `src/styles.css` holds one palette for every piece of highlighted source (a fenced code
  block, the frontmatter, a display formula's own text, a revealed inline formula), where
  each token is two thirds of a daisyUI hue mixed into `base-content`, and the prose's own
  `pre` box takes `base-200` instead of daisyUI's typography mapping of it to `neutral`.
  The frontmatter is rendered through the highlighter now
  (`nodes/frontmatter_highlight.ts`, `hljs.highlight(node.text, { language: node.format })`),
  so it *is* a `pre` and wears the code block's own box. **The user caught the first
  palette**: at a quarter of the hue every token came out a pale grey barely different from
  the plain text it sat beside (0.02 in oklab; the probe holds 0.05 now and the palette
  measures 0.076–0.17). `test/probes/source-theme.js` measures all four surfaces in *both*
  themes — the surface, the contrast floors, the separation, and that the colours actually
  change — and `source-highlight-caret.js` holds the characters: typing after a click in the
  frontmatter, on a line inside it, and at a character in the middle of a highlighted code
  block.
- **Documents, and the stack behind them.** Landed as
  `docs/superpowers/plans/2026-09-28-documents-and-the-stack.md`, on the user's ask: the editor
  showed one unnamed string, so nothing survived a restart, opening a file destroyed the one
  before it, and — since `⌘S` had no listener at all — the text in memory was the only copy of
  the reader's work. A document is now a path (or none), its text, the text its file holds, and
  where the reader was; the session keeps them, the stack behind the one on screen, and the
  session file (written atomically) brings it all back. The titlebar's stack button pushes and
  pops with the user's own glyphs, the button beside it lists the stack by **title**, and the
  status bar says `Saved`/`Editing` and `In the stack`/`Not stacked` — the indicator the user
  asked for, which needed a real **Save** (the `save` menu event now has a listener at last, and
  Save As adopts the path it writes to). The whole model is pure and held by
  `check-document-session.mjs`; four probes drive it. **What the work taught:** a document's id
  is read at the *top* of it (reading the whole text gave two fixture documents the same id,
  because each mentions the other's), unused documents are pruned by `reachable`, a capture that
  cannot see the caret keeps the one it had, a block's offset is not the scroller's (118px of
  desk and page margin above the prose — `contentTop()`), and the view restore waits two frames
  because placing a caret scrolls. The caret comes back exactly; the view comes back to the
  right block, within about a hundred pixels on a document with headings above, because the
  estimate of an unmeasured block is a line of body text whatever the block is.
  **And asking is a utility of the app's own** (`ui/prompt.ts`), since asking is not a document's
  business: one `Prompt` with two hands — a reader gets the system dialog, a probe a card in the
  page it can press — chosen from the page (`window.__t`, which only the harness installs) rather
  than configured, with the same words either way. The session takes it as a port; the workspace
  tree's delete asks it directly, which made that question testable for the first time
  (`tree-file-actions.js` drives both answers).
- **The editor is a page of A4.** Landed as
  `docs/superpowers/plans/2026-09-27-the-editor-becomes-a-page.md`, on the user's ask: make
  editing feel like a printed page. The column was 962 px — 254 mm, **151 characters a
  line** — and it is a 210 mm sheet with a 25 mm margin all round now, so the words sit in a
  160 mm column centred on a desk of `base-200` with the page `base-100`, a hairline
  `base-300` edge and a soft shadow (`.markdown-page` and `.markdown-scroller` in
  `styles.css`; the root's `w-full max-w-full` became `markdown-page` in
  `virtual_block_renderer.ts`, which is also what had been lifting the typography plugin's
  `65ch` cap). The measure is **95 characters a line** — A4's own, long, which is why books
  use narrower pages; the type size is the lever (18 px ≈ 84, 20 px ≈ 75) if the user wants
  the book measure. **The page made one fix necessary:** the view keeps its scroll through an
  edit, which was enough before because a short document was shorter than the pane and the
  browser clamped the old scroll away — a fixed 297 mm sheet is taller than the pane, so
  nothing clamps and opening a note from a scrolled one left the reader on the middle of the
  paper. `markdown_editor.ts: setContent` now opens a document at the top of its own page;
  `footnote-jump`, `footnote-label-edge` and `undo-run-taken-back` were the three probes that
  found it, and `test/probes/a4-page.js` holds the page itself: its size, its margin, its
  centre, its surfaces in both themes, and the measure a reader gets.
  **And the page fits the pane** (`markdown_editor.ts: fitPage` sets `--page-scale`, capped
  at 1, watched by a `ResizeObserver` on the scroller): a pane too narrow for A4 gets a
  smaller page rather than a sideways scroll, with the sheet, its margin and its type all
  taking that one scale — measured in a 600 px pane, a 552 px page at 11.13 px type with the
  margin still 25/210 of the paper and no sideways scroll. The measure stays 95 characters a
  line at every scale. One probe needed a line changed for it: `table-insert` aimed its caret
  with a click at 99% of the text's *width*, which skims the last glyph, so a smaller type
  size put the caret before the final `.`; it names the character now, as `insert-link` does.
  **And the page's rhythm scales with it** (`.prose`'s `--md-page-scale`): the line height, the
  paragraph skip, the steps around headings, quotes, tables, code and list items, a table
  cell's padding, an empty line's height and the spacing the nodes carry themselves. In a
  600 px pane 24 px of line height becomes 16.7 px and the paragraph skip 8 px becomes 5.6 px,
  held by `a4-page.js` at `at full size × the scale`. **Two app bugs came out of it, both found
  by the suite.** A window change re-anchored the caret over a selection the reader had made —
  Select All then Copy came back empty — so `reanchorCaret` now leaves a non-collapsed
  selection inside the prose alone (`undo-after-scroll` is the probe that caught it). And
  `block_sizes.ts` estimated an unmeasured block as `lines × 24px + 8px`, the page's own line
  height and skip in a second, absolute home: at 57% every estimate was 75% too tall, the
  document's total height moved as blocks were measured, and an undo clamped a reader at the
  bottom up a page (5464 px of estimate against 4728 px of truth). The estimate takes the
  scale now, and a new scale forgets heights measured in the old pixels.
  **And the two layouts switch.** Landed as
  `docs/superpowers/plans/2026-09-28-the-layout-button.md`, on the user's ask: a button at the
  right of the status bar (`src/ui/toolbar/layout_toolbar.ts`, with the two icons they sent)
  runs `view:togglePage`, and the editor's `data-layout` moves between the page of A4 and the
  full-width column it had before — `styles.css` scopes the sheet, the desk and the scale to
  `[data-layout='page']`, and `fitPage` holds the scale at 1 in `auto`. The button draws the
  layout in hand, names the one a press reaches, and carries `aria-pressed`; the choice is
  remembered in the app config (`editor_layout`, defaulting to `page`). Measured by
  `test/probes/page-layout-toggle.js`, which presses the real button: 1000 px of pane gives a
  794 px sheet with 94 px of margin, and one press gives a 968 px column with no sheet, no
  desk and 16 px type over 24 px lines again.
- **A click in the frontmatter went to the block edge.** A frontmatter block was rendered
  *as* the block in `create_block.ts` rather than as a node, so `routePointerClick` found no
  `.markdown-node` under the pointer and handed the click to `placeCaretFromPointer`, which
  resolves the nearest block edge: clicking on the `id` key put the caret at the document's
  first character (typing `I` gave `I---`), and editing the middle of a line meant arrowing
  there. It is `nodes/frontmatter.ts` now — a node component like `CodeBlock`, a `pre`
  holding the markup and tagged `data-text-from="0"` because it *is* the block's text — so a
  click lands on the character clicked and a keystroke writes there.
  `test/probes/source-highlight-caret.js` holds it and fails without the change: a click on
  the first key, a click on a later line, and the same click in a fenced code block, which
  always worked.
- **New Markdown** (the menu item that had done nothing since it was built). Landed as
  `docs/superpowers/plans/2026-09-29-new-markdown.md`: one command, `file:newMarkdown`, makes a
  note — the file is named after a generated `YYYYMMDDHHMMSS` id and opens with the four keys a
  note must carry (`title: Untitle`, `date`, `id`, and `keywords` with `  - untagged` under it),
  the reader's own
  template (`new_file_frontmatter` in the config, and a *New note* tab in the settings window) is
  kept around them, and the note is opened with its title selected, so the default is typed over
  rather than deleted a character at a time. The menu asks *where* on a card of the app's own —
  the workspace's folders, with the one the reader is working in already chosen — because a
  system file picker cannot mean "a folder in this workspace and a name", and the tree's *New
  file* runs the same command with the row's folder, so the two cannot drift apart. What that
  changed: the tree no longer starts an inline rename for a new file (the file is named by its
  id; the *title* is what the reader types — `tree-create.js` holds it), a document opened with a
  range keeps both of its ends (`DocumentView.to`, so a title can still be selected after a
  restart), and a note made in the same second as another gets the next second's id rather than a
  refusal. `npm run check` is **30/30**; the suite is below.

  Three adjustments came out of the review, and are part of the same branch:

  - **The question has two hands, like the prompt's.** A reader is asked by the system's own sheet
    — `save`, the one native surface that means "where, and what is it called" in one breath,
    opened on the folder they are working in with the id as the name — and a probe by the card.
    Both hands are chosen by one rule, `ui/under_test.ts`, which is also what `ui/prompt.ts` reads
    now (it used to keep its own copy of the test). The sheet's answer is one path, and the rule
    that reads a folder and a name out of it (`placementOfPath`) is a pure one in
    `services/workspace_folders.ts` with `check-workspace-folders.mjs` beside it — because a
    native sheet is the one surface a probe cannot drive, *and* cannot stand in for either:
    measured, the dialog plugin's `save` does not travel over the webview's `fetch`, so a
    stand-in never sees it and the real sheet blocks the harness for its whole budget.
  - **`keywords` is a list**, not a word: the built-in frontmatter writes `keywords:` with
    `  - untagged` under it, and the rule learned the one thing that needs — a value written on
    the lines *below* a key is that key's value, so a list of the reader's own is left alone while
    a key with nothing under it still gets the default.
  - **The stored template may be absent.** `new_file_frontmatter` is a string *or* nothing, and
    nothing means the app's own template. Before this, the app wrote its default into every
    config that saved anything else, so the shape of the default was frozen in the reader's file;
    a config that still holds the built-in the app shipped before this change reads as no
    template, which is what it was (`settings.rs: as_read`, with its own test).
  - **The settings window's sidebar is a strip of tabs**: 144 px instead of 224, each tab the
    sidebar's own width, square and flush against the next, with the active one in the theme's
    active colour.
- **Scrolling up from the end of a document jumped the page to the caret.** The renderer drops the
  blocks outside the window and mounts them again as the reader scrolls back, and a caret whose
  block was dropped is placed again once it is there — through the ordinary caret placement, whose
  deferred frame ends in `scrollCaretIntoView` whichever reason had asked for it. So a *window
  change* scrolled the page to a caret that had not moved: measured on the demo document, walking
  up from the end in 24px steps, the step at which the caret's block came back into the window
  moved the page **1097px** instead — the caret sitting 8px inside the pane afterwards, which is
  `scrollCaretIntoView`'s own margin. The two reasons a caret is placed are now told apart: a caret
  that *moved* brings itself into view, and a caret that is *put back* where it already was does
  not (`caret.ts: showCaret`/`scheduleCaret` take a `scroll` flag; `markdown_editor.ts:
  reanchorCaret` and `restoreView` pass false). That is the rule a click that opens a source
  already follows — a rebuild under the reader is not a request to move the page.
  `test/probes/scroll-caret-anchor.js` is the test: it puts a caret in the first paragraph,
  scrolls to the end and walks back up, and reports a **1107px** jump without the change. Two
  things about measuring it: the caret has to be *rendered*, so the reader clicks into the
  document first (with the caret hidden the same walk is clean), and the window has to be in
  front — a backgrounded webview runs no animation frames, so the renderer never re-syncs and
  neither does the bug.
- **Inserting an image**, as the user asked: a button beside the link button, and the clipboard
  deciding what it means. Landed as `docs/superpowers/plans/2026-09-29-image-insert.md`. A
  *destination* the clipboard is offering — a web URL, a `file://` URL, a path ending in an image
  kind — is written at the caret exactly as a link is, with the caret left in the alt text. An
  *image* on the clipboard opens the app's own card — no native twin, because no system surface can
  draw the picture — with the pixels drawn in it, a name defaulting to the app's own stamp as a
  PNG, and a line saying which folder the file will land in; saving encodes the RGBA on a canvas as
  the kind the name asks for and writes it through the file plugin, into the settings' new
  **General** tab's image folder or beside the note when that is empty. The text carries the path
  **relative** to the folder it is read from, and the renderer resolves it against the note's
  folder first and the image folder after it — so a destination the app wrote and one an author
  typed by hand both paint. Two things had to be measured rather than assumed: the clipboard's
  text read answers `null` for a copied PNG (so "a destination in the text wins" and "an image
  wins" are the same rule on that case), and `clipboard-manager:allow-read-image` is what the image
  read needs — with it, a 128×128 PNG on the clipboard reads back as 128×128 and 65536 bytes of
  RGBA. Rendered images are centred with a corner rounded in the page's own scale
  (`styles.css`), and a *local* image paints only because the app now enables Tauri's asset
  protocol (`tauri.conf.json`), scoped `$HOME/**` like the file plugin — which is the next item
  again, one surface larger. `npm run check` is **31/31**; the suite is below.
- **The app speaks eight languages**, as the user asked: English, Japanese, Simplified and
  Traditional Chinese, German, French, Spanish and Portuguese. Landed as
  `docs/superpowers/plans/2026-09-29-localization.md`, and the design question that came with the
  ask — the menu is Rust and the windows are HTML — was answered by **one set of catalogue files
  with a reader on each side** (`locales/*.json`; `src/services/i18n.ts` for the webview,
  `src-tauri/src/i18n.rs` for the menu) rather than by moving the menu into TypeScript or taking an
  i18n crate as the shared API. Both alternatives are argued in the plan; the short of it is that
  the menu has to exist before a page does and must survive one that never loads, and a crate gives
  Rust a `t!` while leaving the webview to fetch its catalogue over IPC. Two things had to be found
  out rather than assumed: Tauri's predefined menu items are titled by `muda`'s **English** table
  when they are given no text (`"Quit {app}"`, from its own source), so every label is passed from
  the catalogue through the `*_with_text` forms; and an **empty language setting means the reader's
  system locale**, so a first launch is in the language the rest of the machine is in — with the
  8-language map read by both sides and held to one set of expectations. Measured in the running
  app, after switching the setting to Japanese: the window came back by itself in Japanese
  (`lang="ja"`, the toolbar's `画像`/`リンク`, the status bar's `保存済み`/`スタック外`, the word count's
  `語数`), and the *native menu* read through System Events was `ファイル, 編集, 表示, ウインドウ,
  ヘルプ` with `新規 Markdown`, `開く…`, `保存`, `別名で保存…`, `書き出す`, `ウインドウを閉じる` under
  File — the last of those having been muda's English "Close Window" before. `npm run check` is
  **32/32** and `cargo test` **20/20** (the catalogues are asserted from Rust as well: same keys,
  nothing blank, and the locale rule). A probe asserts behaviour in English, so the harness now
  puts the app in English for the length of a probe and puts the reader's choice back
  (`test/tauri-probe.mjs`).
- **Citation and wikilink completion**, as the user asked: `[` is completed with `]` and the caret
  stays inside, `@` offers the bibliography's keys, and `[[` offers the workspace's documents —
  chosen with the arrows, an entry showing its title, and written with Enter. Landed as
  `docs/superpowers/plans/2026-09-29-citation-and-wikilink-completion.md`. Two pure modules hold the
  rules, each with its check beside it: `syntax/brackets.ts` (a pair where prose is being written —
  nothing in a fenced code block, a display formula or an inline code span, nothing around a
  selection — the `]` already written being stepped over, and Backspace taking an empty pair away
  whole) and `syntax/completions.ts` (the query the caret is inside, the entries matching it on
  *either* field with prefix matches first and fifty at most, and what accepting writes). The list
  itself is `editing/completions.ts` over `completion_card.ts`, and the editor asks it *before* its
  own text path, so an open list owns the arrows, Enter, Tab and Escape while every other key types
  and redraws it; a click in the document closes it, because a click is not typing. Enter writes the
  citation's key, and a document's **id** — its **file name** when it has none, and not the title
  the row shows beside it, because a name is the first thing the resolver falls back to, so what is
  written is always what resolves. Two things had to be measured rather
  than reasoned about. The second `[` must write its own pair *in front of* the `]` the first one's
  pair left after the caret — that is what makes `[[` two pairs, `[[]]`, with the caret between
  them; writing only the `[` leaves the wikilink one bracket short, and that is what Enter then
  writes into (measured: `[[<id>]`). And the click that closes the list has to be *captured*: a
  click that lands on a markdown node is answered by that node and stops there, so a listener that
  waits for it to bubble never sees it. `npm run check` is **34/34**; the probes are `brackets.js`,
  `completion.js` and `completion-wikilink.js` — the one file the first pass left was over the
  bridge's 5 s budget, so it is three, none of them recovered.
  The review found two things in the popover itself, both measured rather than argued about. Its
  rows were **417px wide inside a 288px card**: daisyUI's `menu` sizes an item to what it holds, so
  a long title pushed the row past the card, where it was clipped and gave the card a sideways
  scroll of its own. A row is the card's own interior width now (clamped item, `min-w-0` fields,
  the title ellipsized) and the card has no padding, so the highlight is the row, flush to the
  rounded border that clips it. And the card was placed from the **drawn caret span**, which
  `caret.ts: scheduleCaret` puts on the next frame while the range moves at once: the redraw a
  keystroke triggers measured the position the caret had just left, so the popover opened one
  character (14px) to the left and slid across on the first ArrowDown (430px, then 444px). It is
  placed from the caret's range now (`caret/geometry.ts: caretRect`), and both facts are checks in
  `test/probes/completion.js`.
- **A switch for the stack's own question**, as the user asked: the General tab keeps one — the
  app config's `push_unstacked_on_open`, off until the reader turns it on — for whether opening a
  file pushes the document on screen into the stack rather than asking about it. The question
  itself got narrower in the same pass, at the user's direction: it is asked only when replacing
  the document on screen would lose the reader's words, so a document whose text its file holds is
  replaced without a question either way, and a *saved* document is never pushed for the reader —
  that stays their own choice, made with the stack button. `openDecision` answers `pushAndOpen` for
  the reader who asked for the push, `ask` for one who did not, and `open` for a document with
  nothing to lose; a config written before the field existed reads as off, which is what
  `settings.rs` and its test say. `npm run check` is **34/34** and `cargo test` **21/21**; the flow
  is `test/probes/settings-push-on-open.js`, and the rule has its cases in
  `test/checks/check-document-session.mjs`.
- **One family for everything that floats, and messages instead of a toast**, as the user asked:
  landed as `docs/superpowers/specs/2026-09-30-floating-surfaces-design.md` and its plan. Nine
  surfaces shared no class — only three idioms, each written twice or three times (the same
  clamping arithmetic in the footnote preview and the completion list, the same veil classes and
  the same answer protocol in the prompt and the two cards, the same panel listeners in the stack
  and the table picker) — and the toast was the odd one out: a daisyUI corner container with
  `alert` boxes, dismissed only by its ✕, and no probe in the suite at all. Now `FloatingSurface`
  holds what every surface has and `BesideCard`, `AnchoredPanel` and `QuestionCard` say where one
  sits; the toast is gone, replaced by `ui/messages.ts` — one `BesideCard` per message, beside the
  tree row or the button it is *about*, or in the corner when it names nothing, with the ✕ and
  Escape both closing it and nothing auto-hiding. The place travels as a name (`{ path }` or
  `{ command }`) because the bus is Tauri's and its payload is JSON, and `placeSelector` escapes
  it, so a quote or a backslash in a file name cannot break the selector (`check-messages.mjs`).
  The four strings the tree used to write in English — `Path copied.`, `Name copied.`, `Id copied.`
  and `Failed to open …` — are keys in all eight catalogues now. `npm run check` is **36/36**; the
  new probe is `test/probes/messages-and-hints.js`, and every probe that touches a surface still
  passes untouched because the markers never moved. The user's review then split the one surface
  into two, and that split is what the feature was for: a **message** is for something that needs
  the reader's attention (a failure), so it waits in the window's bottom-right corner whatever it is
  about — stacked upward, its ✕ at the card's right edge, closed by the ✕ or Escape and by nothing
  else — while a **hint** (`services/hints.ts`, `ui/hints.ts`) is for what they only have to notice:
  the tree's three "copied" confirmations, a card beside the row they happened on, with no ✕, gone
  at the next press. The first version anchored every message to the thing it was about, which put a
  "Path copied." where the reader had to move their eyes to see it and left a failure behind a
  toolbar button; the corner is where both belong.
- **The first start**, as the user asked: a freshly installed app had no workspace and nothing asked
  for one — the config's `workspace` was `None`, start-up never emitted `WORKSPACE_CHANGED`, and the
  only way to a folder was the File menu. Landed as
  `docs/superpowers/specs/2026-09-30-first-run-workspace-design.md` and its plan. The config gains
  one fact (`workspace_asked`, false for every config written before it), one pure rule reads it with
  the workspace itself (`needsWorkspaceQuestion`, checked in Node), a `QuestionCard` asks — and
  **says where a new workspace would be made**, `/…/Documents/Yi`, because a reader offered "create
  one" is owed the answer to "where" — and the flow hands the answer to the same call the menu makes
  (`workspaceManager.openWorkspace`), so the tree, the config and the session follow one path. Saying
  "not now" writes nothing at all and is asked again next start; a reader who already has a workspace
  is never asked. "Use an existing folder" is the system picker for a reader and a path field for a
  probe, and every test points the documents folder at one it made itself, so no test writes into the
  reader's own Documents. `npm run check` is **37/37** and `cargo test` **22/22**; the tests are
  `check-workspace-setup.mjs` and the probes `first-run.js` (the card, both answers, the tree and the
  config) and `first-run-create.js` (the folder made, then adopted). Measured end to end: with
  `{workspace: null, workspace_asked: false}` and a real page reload, the page that came up asked —
  "A new workspace will be made in /Users/urshanabi/Documents/Yi." — with all three answers on it.
- **Versions of a workspace, kept by Git**, as the reader argued it out: local version control for
  the notes, Git only, if the machine has it, with no account and no remote required, and never any
  of it without their own answer. Landed as
  `docs/superpowers/specs/2026-10-01-workspace-versioning-design.md` and its plan. Five rules, which
  are one table and one check: **no git at all** without consent for *this* workspace (the default,
  and what every config written before the field reads as); a repository the reader already has is
  theirs and is used as it stands — their identity, their remote, their branch — with only the files
  this app wrote ever committed; a folder *inside* a repository is never nested into; a folder a
  cloud drive could reach (or one the classifier cannot read enough to be sure about, treated the
  same way because the separate git directory costs nothing in the local case — the reader's own git
  keeps working through the one-line `.git` pointer file) gets
  `git init --separate-git-dir=<app data>/repos/<name>`, after the risk is shown; and anything else
  is a plain `git init`. A version exists **only when the reader asks**: `version:save`, the File
  menu's *Save a Version*, which captures the editor's text, refuses a note with no file, writes the
  file atomically, and commits it by pathspec (`git add -- <path>` then
  `git commit -m <message> -- <path>`) so the reader's staged work is never swept up. Nothing else
  runs git — no timer, no quit hook, no on-save commit — and the never-dos (no `fetch`, `pull`,
  `gc`, `clean`, `reset`, `checkout`, `amend`, no force, no hooks, no credentials in the repository)
  are held by a probe that points the app at a git which only records its arguments.
  `npm run check` is **38/38** and `cargo test` **33/33**. The facts are gathered in Rust because
  the webview cannot see them: `PATH` is never trusted for finding git (an app launched from Finder
  inherits no shell's), `/usr/bin/git` is used only when `xcode-select -p` answers — measured to
  answer without raising the Command Line Tools installer, where `/usr/bin/git` itself would — and
  the cloud answer is read from the path shapes, the dataless attribute, the mount table, the
  `~/Library/CloudStorage` listing the app *can* read, and, under `~/Library`, from a `readdir`
  refusal itself. Three measured facts shaped the tests. The webview's file plugin **refuses a
  hidden path** (`forbidden path` for `.git/HEAD`, and for `exists`), so a repository is observed
  only through the app's own commands — a probe cannot run `git`, and cannot read the index either.
  The app's own listing hides dot-named entries, which is what makes a clone safe to open: after the
  app opened a real clone, `git status --porcelain` was empty. And the session's write was already
  atomic (27 ms for 853 bytes); that shape moved into `files.rs: write_atomically` and now serves
  document saves too, so a cloud or git client reading mid-save never sees half a note. The probes
  are `versioning-facts`, `versioning-fake-git`, `versioning-save`, `versioning-staged`,
  `versioning-consent`, `versioning-repository`, `versioning-outer` and `versioning-no-git`; the
  first save probe held both halves of its subject and measured **4.9 s** against the bridge's 5 s,
  so it was split rather than gambled on, and the repository probe was split the same way at 5.0 s.
- **The versions of the note on screen**, as the reader asked: a button at the left of the status
  bar showing the newest version of the document in hand, and — one press away — the list of them,
  newest first, each row the stamp, the message and the comment under it. Landed as
  `docs/superpowers/specs/2026-10-02-document-versions-design.md`, built by
  `docs/superpowers/plans/2026-10-02-document-versions.md`. A version is **a commit that touched the
  file**, whoever wrote it, so the panel and the reader's own `git log` agree word for word; the
  read is `git log --follow --max-count=50 --format=…` through the one helper every git call goes
  through — measured at **14 ms** for fifty rows (45 ms with `--follow` over a long history), and a
  path git has never seen answers **nothing and exits 0**, so an empty list is a list and not an
  error; `--follow` is what keeps a renamed note's versions (with it `renamed|The note · …|first`,
  without it only `renamed`). It is the vocabulary's **fourth call and its first read**; the
  never-dos are unchanged. The button is there exactly when the reader agreed to versions in this
  workspace and hidden otherwise, read from the config alone — a workspace they said no to runs no
  git at all, which `versioning-status.js` holds with the recorder's log staying empty. The list
  says which of four things is true when there is nothing to show (no file yet, no repository here,
  no versions of this note, or a read that failed), and nothing in the panel acts: restoring a
  version stays out of scope. Saving a version now asks what to call it — an optional comment on a
  card with no native twin, the subject unchanged (`Title · 2026-10-01 20:15`) and the comment as
  the commit's body. `npm run check` is **38/38** and `cargo test` **34/34**; the probes are
  `versioning-status`, `versioning-list` and `versioning-list-empty`, beside the eight the versioning
  slice left. Two bugs the probes caught while this was built are worth remembering: a `QuestionCard`
  subclass must re-append what it is made of in its `ask` callback (`question_card.ts: askWith`
  clears the card first), and a probe cannot tell a card is up from its field being in the page — the
  field is there from the moment the module loads, so waiting on it clicks a card nobody opened.

## Open, in the order to take them

- **The file plugin is scoped to `$HOME`, and the app cannot open a workspace outside it.** A
  new note is written with `@tauri-apps/plugin-fs` — the same call the session's *Save* makes, and
  the one an inserted image is written with — and the asset protocol that *serves* a rendered image
  is scoped the same way (`tauri.conf.json`), so outside the home directory a note's images neither
  save nor paint. That plugin's scope is `$HOME/**` (`src-tauri/capabilities/default.json`).
  Measured while
  writing the probe: reading a file under `/private/tmp` from the page is refused
  (*"forbidden path: /private/tmp/yi-fs-scope/note.md, maybe it is not allowed on the scope for
  `allow-read-text-file`"*), while the app's own Rust commands (`list_folder_files`,
  `create_entry`, `move_entry`, …) reach anywhere, because they carry no scope of their own. So a
  folder outside the home directory can be listed, rearranged and deleted, but a click in the
  tree cannot open a file in it and *Save* cannot write one — not a limitation the app means to
  have. The fix is scope the reader grants when they open a folder (the dialog plugin's folder
  picker already returns the path), or a pair of commands of the app's own for the two calls the
  webview makes; the probe is `new-markdown.js`, which makes its workspace in the home directory
  for exactly this reason.
- **The backend still answers in English.** A failed write, a name the file system refuses, a
  folder it cannot read: those sentences are written where they happen (`src-tauri/src/files.rs`,
  and inside Tauri's own plugins), and they reach the reader in a toast beside translated chrome.
  The catalogues are already in the binary and `i18n::t` already reads them, so this is a pass over
  the Rust messages and a decision about the plugin ones — worth doing before a reader meets a
  mixed-language window.
- **The window decides what these probes measure.** A few of them sit on the bridge's 5 s
  budget, and a narrow one tips them over. `edit-cost.js` and `block-rebuild-cost.js` type into
  the 323 KB note and are the suite's two longest probes: in a pane narrower than the one
  `npm run tauri dev` opens with, that note wraps into more lines and they no longer finish
  inside the harness's 5 s budget — measured at a 709 px window: 5020 ms and 5037 ms, and the
  same on the layout without the A4 page, so it is the window and not the page. The project's
  own answer to a probe that needs longer is to split it (`docs/ai-context.md`); these are the
  ones it now applies to. The same budget is what makes the suite's tail noisy: the last full run
  was **101/104 (14 skipped)** with `edit-cost.js`, `edit-stability.js` and `insert-rule.js` (below)
  red, where the run before it (**97/101**) also failed `display-math-source.js` — which passes
  when run alone, measuring 5006 ms with only 3000 ms of that in its own sleeps. A *click* is the
  other thing the pane decides, and a wider one is not always kinder: at a 1200 px window
  `description-list.js`'s "typing after three widgets" clicked the end of its line in the A4
  layout in two runs and typed in the right place in the full-width one — and passed the next run
  in the A4 layout — so that check is measuring the page's scale and the frame it lands on as much
  as the caret's mapping.
  An **occluded** window is the other half of this, and the larger one: the system throttles a
  background window's timers, so every `t.sleep(...)` a probe takes can cost a second of wall clock.
  Measured while the versioning probes were written — the same probe, in the same state, took
  **2257 ms** with the app's window in front and **5008 ms** behind the terminal, where one `git
  init` through the app's own command measured 6.7 s. The app is brought forward before a timed run,
  and a probe that only sometimes finishes is read as too long whatever the window was doing;
  `test/README.md` says so where probes are written.
- **`insert-rule.js`'s `atTheEnd` check.** A rule written at the end of the document
  writes the right raw text (`only line\n\n---\n\n`) and leaves the caret at the top of the
  document (`y 49`) instead of on the line under the rule — measured on the app, and older
  than the phases above (it fails at `d4a26cf` too). The caret the command resolves for the
  document's end (`state.getText().length`, since no block starts after the rule) sits on a
  blank line, and the placement snaps somewhere else; the fix belongs in that resolver or in
  `nearestTextOffset`, with the probe as its test. It is the last check the strict harness
  reports: the harness never judged a probe's own verdict until the link branch fixed that
  (`test/tauri-probe.mjs: failedChecks`), which is why it and the formatting bug had both
  been invisible.

Everything else the phase handoffs left is either closed above or waiting in "measure
before deciding"; what is left is the "measure before deciding" column below.

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
- **What a drawn footnote label spells.** Measured in the phase above, by
  `test/probes/footnote-labelled.js`: a marker in the text and a definition's label in the
  notes run both draw the *identifier*, lowercased — `[^Ab]` draws `[ab]`, the shape a
  marker has always drawn — while the source at either end spells the author's characters
  (`[^Ab]`). The two ends therefore agree with each other and disagree with the source
  until the caret is in it. The decision is the user's: drawing the author's characters at
  rest would make the drawing agree with the source, and it is the last visible leftover in
  the footnote neighbourhood.
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
- **A definition indented inside a wide item is not borrowed.** The definition-line rule
  (`syntax/footnotes.ts`) reads the container markers markdown allows *on the line itself* —
  a `>` or a list marker, which covers `> [^1]: note`, `> - [^1]: note` and `- [^1]: note` —
  plus the up-to-three spaces of indentation that fit there. A definition inside a `10. `
  item sits four columns in, exactly like an indented code block, and one line of text
  cannot say which it is: the rule keeps the code block's reading, and
  `test/checks/check-footnotes.mjs` holds both cases. Telling them apart means tracking
  which containers a line is inside, which is the block model's job (`document/blocks.ts`),
  not a line reader's.

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
