# The tests

This folder holds everything that proves the editor works. `docs/testing.md` is the
methodology; this file is the index and the conventions.

## Layout

| Path | What it is |
| --- | --- |
| `checks/` | Pure Node checks, run by `npm run check` (no browser) |
| `probes/` | DOM probes, run by `npm run probe -- <probe.js>` against the running app |
| `probes/lib.js` | The helpers the harness installs into the page (`window.__t`) |
| `tauri-probe.mjs` | The harness: talks to the running app over the Tauri MCP bridge |
| `run-checks.mjs`, `run-probes.mjs` | Runners behind `npm run check` and `npm run probe:all` |
| `fixtures/workspace/` | A committed notes folder the probes can open (see its README) |

## The checks

| Check | Covers |
| --- | --- |
| `class-names.mjs` | That every `markdown-…` class name the app uses is drawn by `styles.css` or on the list of rule-less hooks (with its reason), and that no rule in the stylesheet is for a name nothing sets |
| `check-blocks.mjs` | How the raw document splits into blocks (`document/blocks.ts`), and empty-paragraph runs — including direct and one-blank list/table captions, and that a fence or a display formula interrupting a paragraph is a block of its own, since both must be able to show their own text |
| `check-callouts.mjs` | GitHub-alert and Pandoc fenced-Div callout grammar: nested quote depth, all five built-in labels, custom kinds/titles, kind-only class edits, exact IDs/classes/attributes, malformed and escaped markers, offset-preserving parser input, and unclosed or nested Div fences left literal |
| `check-book-body.mjs` | The text a *book* is handed (`ui/export/book_body.ts`): the note's own level-1 heading where the note writes one, and the note's name written under the frontmatter where it does not — the line of a name that came from a heading, a name with a line break in it, no name at all, and what counts as the note's own heading (`#` at the line's own beginning, a bare `#` as much as `# A`, while `##`, `#foo` and `   # A` — which pandoc reads as prose — are not) |
| `check-documentation.mjs` | The bundled Documentation guide and its native F1 menu entry: stable identity, read-only source, install instructions for Pandoc, TeX Live, MacTeX and MiKTeX, package-authoring chapters, security limits, fixture-package pointer and no unfinished placeholders |
| `check-brackets.mjs` | What typing a bracket writes (`syntax/brackets.ts`): the pair and the caret inside it, the second bracket that turns `[]` into `[[]]`, the literal region and the selection where nothing is written, the `]` the author steps over, and the empty pair Backspace takes away whole |
| `check-hints.mjs` | Where a hint goes (`services/hints.ts`): the tree row a file's hint is found by, and the escaping a quote, a backslash or a newline in a file name needs |
| `check-block-index.mjs` | Where the blocks are: the prefix sums over their lengths and line spans, across an edit inside one block and across one that changes how many there are (`document/block_index.ts`) |
| `check-block-sizes.mjs` | What a block is worth in pixels, the sums the window and the spacers are built from, and which blocks a scroll mounts |
| `check-code-edits.mjs` | Tab/Shift+Tab inside a fenced code block and a display formula |
| `check-completions.mjs` | What the caret is inside when a list should open, and which entries belong in it (`syntax/completions.ts`): a citation's query and the places an `@` is not one, a wikilink's query, the entries matching on either field, and the cap |
| `check-enter.mjs` | What `Enter` inserts at a block edge and on an empty paragraph, and list rules |
| `check-equation-blocks.mjs` | Labeled `[$$…$$]{…}` syntax, trailing attribute whitespace, unfinished editor source, the complete plain/starred/inner environment matrix, unnumbered lowering, and one outer LaTeX equation |
| `check-events.mjs` | That every event the native menu sends from Rust is declared in `services/app_events.ts` — the map the event bus is typed by |
| `check-epub-valid.mjs` | The book the app writes, held to W3C's `epubcheck`: `pandoc` over the note `ui/export/book_body.ts` prepares (the app's own rule, bundled rather than retyped) with the *shipped* `export.epub.yaml` and the note's name as the book's title, then the validator over what comes out — the shape whose two `Duplicate ID "going-out"` errors either half of the fix alone leaves behind (the file's old `shift-heading-level-by: 1`, or the note handed over with no level-1 heading written in), and which the file's `0` *and* that rule together take away. It **skips with a line naming what is missing** when `pandoc`, `java` or the jar is not on the machine (`YI_EPUBCHECK` names a jar anywhere else), so `npm run check` stays green without them; it is also the one check that spends seconds rather than milliseconds, on the JVM the validator runs in |
| `check-export.mjs` | The export's shared pre-process (`ui/export/preprocess.ts`): a wikilink written as the words it renders as — its own title, the title of the note it names, or its target — and an image's destination written as the file the app resolves it to (`/notes/shot%20with%20space.png`, from either of the two folders and whichever spelling the author used; a picture on the web as the file the app fetched for it, once per URL; or left exactly as written when neither is there), both walked out of the parse, so a fence's body, an inline code span, frontmatter and a `data:` URL are left alone — and the third rule, for the kind whose conversion is the app's own: a citation written as the words it reads as with the works it names listed under them, each work asked about once in the order it is written, and no list at all when there is nothing to list. Captioned tables and lists cover every writer: shared caption and target behavior for HTML/EPUB/DOCX/ODT, semantic HTML for processed Markdown, and the native LaTeX/PDF reference macros |
| `check-export-font.mjs` | The card's font hint (`ui/export/font_hint.ts`): which characters of a note no font its settings name can draw — the covered set written down **character by character**, because the blocks are irregular (measured: `ə` draws and `ʃ ɐ ʰ` do not; `← ↑ → ↓` draw and `↔` does not; `√ ∞ ± × ÷` draw and `≤ ≥ ≠ ≈ ∑ ∏` do not; `♪` draws and `♭ ✓ ☺ ★ ☆` do not; `Δ Ω` draw and `α β γ` do not), `CJKmainfont` answering for CJK punctuation, kana and Han and **not** Hangul, `mainfont` for anything its font has — and that a character inside `$…$` is left alone, because a formula is set with the maths font |
| `check-footnotes.mjs` | Footnote definitions, labels and appending notes |
| `check-heading-attributes.mjs` | Pandoc heading attributes on ATX and setext headings: separation from the title, quoted and escaped values, malformed braces left as text, and exact serialization |
| `check-heading-index.mjs` | Pandoc automatic identifiers, Unicode, fallback and duplicate suffixes, explicit IDs staying literal, same-document target order, and first-match lookup |
| `check-auto-references.mjs` | Yi's `[#id]` source spelling: IDs, multiple references, escapes, empty forms, and line boundaries |
| `check-reference-header.mjs` | The generated LaTeX/PDF target header: native figure, table and listing labels/prefixes, table/equation/list counter macros, LaTeX escaping, and the `yilist` setup hook |
| `check-reference-index.mjs` | Shared heading, figure, listing, captioned-table, captioned-list, and labeled-equation targets; document-order numbering; first-match duplicate resolution; labels and literal prefixes; inferred reference text; and later targets surviving an equation's full-document parse |
| `check-reference-vocabulary.mjs` | Document-configured labels and literal number prefixes for every target kind, English/empty fallback, scalar validation, and interface-language independence |
| `check-figures.mjs` | Pandoc implicit-figure recognition, image attribute parsing, inline and empty-alt exclusions, malformed attributes, and source serialization |
| `check-code-fences.mjs` | Both Pandoc fenced-code attribute forms, language classes, captions, malformed attributes, and body offsets |
| `check-history.mjs` | The edit log (`document/history.ts`): what an edit inverts to, the edges of undo and redo, and that a keystroke's history is bytes rather than a document |
| `check-image-edits.mjs` | How an image is written (`syntax/image_edits.ts`): the markdown of `![alt](destination)` and where the caret lands, which clipboard text counts as a destination, the name a saved image gets, and the kind it is encoded as |
| `check-latex-images.mjs` | Where pictures go in a LaTeX source tree (`ui/export/latex_images.ts`): package pictures keep their relative path, a note picture may replace a package asset, and other or unsafe destinations are reduced to unique relative files under `<output>.assets/` |
| `check-locales.mjs` | The app's words (`locales/*.json`, read by `services/i18n.ts` and `src-tauri/src/i18n.rs`): one key set per language, nothing blank, every key used by a source, and one reading of a system locale |
| `check-list-edits.mjs` | List markers, indentation and item continuation |
| `check-list-captions.mjs` | A list's following `: …` caption line: direct and one-blank attachment, base indentation, ID-only and caption-only forms, trailing Pandoc attributes, malformed attributes left as text, and exact ranges |
| `check-math-source.mjs` | Which source is shown, and where a click enters it |
| `check-fence-edits.mjs` | Where a write inside a fenced block lands: a character typed at either edge of a body goes *in* the body, one with no content line gets a line of its own, `Enter` leaves a blank content line rather than a caret on a delimiter, and choosing a language rewrites the opening fence's own line |
| `check-bare-markers.mjs` | What the parser makes of a marker-only line (`syntax/bare_markers.ts`): an empty item when the marker has its delimiter space (`- `), text when it has not (`-`), and never a setext heading that swallows the paragraph above it |
| `check-spaced-destinations.mjs` | What the parser makes of a path with spaces in it, in an image or a link (`syntax/spaced_destinations.ts`): the run is the node it names wherever it stands, the words around it stay text, a title after the path is the title, the `%20` spelling stays a link, and an escaped `\![` or a run in code is left as the characters it is |
| `check-fence-open.mjs` | What typing a delimiter line opens (`editing/fence_open.ts`): fenced code, formulas, frontmatter and a six-kind fenced-Div callout, each with its closing delimiter and the caret on the blank body line |
| `check-new-document.mjs` | The shape of a new note (`services/new_document.ts`): the id's fourteen digits and the local clock they read, the frontmatter built from the reader's template with the four required keys guaranteed, a package's `metadata.yaml` winning every key it names except the app's date/id, broken metadata refused, and the range the title's value sits in |
| `check-native-bibliography.mjs` | Native-LaTeX bibliography packaging (`ui/export/native_bibliography.ts`): package opt-in, citation-key extraction, cited-only filtering for BibTeX and CSL-JSON, key precedence, missing-key reporting, and safe relative output paths |
| `check-plain-edit.mjs` | Which edits cannot change how the text parses, and that every edit the rule accepts leaves the parse's shape unchanged (`syntax/plain_edit.ts`) |
| `check-quote-edits.mjs` | The pure quote/callout line rules: paragraph splits, one-level exits, child-context delegation, exact blank-carrier typing, whole-line blank deletion, fenced-Div single-newline entry, and empty GitHub/Div body materialisation |
| `check-placement.mjs` | Where a floating card sits (`ui/floating/placement.ts`): under what it points at when there is room, above it when there is not, inside the window on every side, and in the bottom-right corner when it names nothing |
| `check-workspace-setup.mjs` | Whether the app asks the reader for a workspace (`services/workspace_setup.ts`): a fresh install is asked, an empty workspace is no workspace, and a reader who has one — or has already answered — never is |
| `check-versioning.mjs` | What the app should do about versions (`services/versioning.ts`): the reader's consent turned into a plan over the facts of the machine and the folder — nothing without consent, their repository as it stands, never nested inside another, a separate git directory where a cloud drive could reach `.git`, and none of it without git — plus the answer read back for the workspace it was given for, the name a version carries (its stamp, the subject it leaves alone and the comment that becomes the body), the path its words name, whether the status bar's button belongs there at all, and which of the empty states the list is in |
| `check-text-diff.mjs` | Two texts as the whole document in one line stream (`services/text_diff.ts`): equal texts, an insertion, a deletion, a rewrite, an empty side, a trailing newline, the equal ends carried, and a change past the cap answered as a `replaced` count rather than guessed at |
| `check-table-edits.mjs` | Table row/column commands and alignment |
| `check-table-captions.mjs` | A table's following `: …` caption line: zero or one blank separator, inline text, ID-only and caption-only forms, trailing Pandoc attributes, malformed attributes left as text, parser attachment, and exact serialization |
| `check-table-menu.mjs` | The table menu's model: what each entry does to the source |
| `check-table-source.mjs` | Reading and writing a table's raw source, and a mapper bounded by the table so a following line never resolves to its final cell |
| `check-tag-offsets.mjs` | Which of the offsets a block's elements carry an edit moves, and that every one of them is on the moved list or exempt for a reason (`editing/typed_text.ts`) |
| `check-tutorial.mjs` | The tutorial's language and first-start rules, and that all eight translated documents carry the same id and the markdown constructs they teach (`ui/tutorial/`) |
| `check-template-examples.mjs` | One complete, readable template package for each export kind under `test/fixtures/templates/examples/`: manifest and entry agreement, assets, metadata/defaults YAML, a metadata-driven three-author PRL source with native citations and a compiled figure/table manuscript, reference-document ZIPs, a complete DOCX style specimen, automatic two-level TOCs in Word and OpenDocument, and a dissertation ODT whose body numbering starts at 1; it runs real Pandoc conversion, REVTeX/BibTeX or DOCX/ODT checks, and an A4 ODT render when the tools are installed |
| `check-thematic-break.mjs` | What a rule insertion adds around the `---` line, and when it adds nothing |
| `check-text-store.mjs` | The document text as a piece table (`document/text_store.ts`): any sequence of edits must leave it holding exactly what a string holds |
| `check-tree-menu.mjs` | What the workspace tree's context menu offers for a file, a folder and the workspace itself, and which items cannot mean anything there |
| `check-tree-rules.mjs` | The tree's pure rules: what a rename starts with selected (the name, without the markdown extension) and whether a drop into a folder is allowed |
| `check-workspace-folders.mjs` | Where a new note may go (`services/workspace_folders.ts`): the order and depth of the walk, a folder that cannot be read, the folder it refuses to walk past, and the path rules the card, the tree and a system sheet's answer all read — including which file an image destination names, and that a `%20` spelling is tried *resolved* before it is tried as written |
| `commands.mjs` | That a command has one name, one home and one way in: no module but the registry declares a command, and the editor reaches commands by name |
| `headers.mjs` | That every module under `src/ui/markdown` opens with the three-line header: what it is for, what it may import, what it upholds (`docs/writing-comments.md`) |
| `layering.mjs` | That the syntax layer imports nothing from outside itself (no DOM, no state) |
| `probe-markers.mjs` | That a probe opening the native table menu carries `@needs-foreground-window`, so `probe:all` skips it instead of leaving the menu open for every probe after it |
| `syntax-home.mjs` | That each markdown-syntax fact is defined in exactly one module |

## The probes

two hundred and seventy-nine probes (`probe:all` runs 250 and skips 29, each skip for the reason its
header names), grouped by area: the workspace tree (`tree-rename` — a name edited
where it sits, the tree unmoved and the extension left out of the selection;
`tree-create`, `tree-file-actions`, `tree-delete` — what the context menu does;
`tree-drag`, `tree-drag-refusals` — a move that updates only the rows it touched, and the
moves that are refused; `tree-no-reload` — a change in the *fixture* workspace that leaves
the page it happened on in place), making a note (`new-markdown` — the card the menu item's
command opens: the generated id in the name field, the workspace's folders, the file written
where it was asked for with its frontmatter on screen and its title selected, and the tree's own
*New file* through the same command; `new-note-template` — a template written through the app's
config, the settings tab that shows it, and the note that comes out;
`new-note-package-metadata` — a package chosen for one note, its metadata merged over the configured
frontmatter with app-owned stamps, and the tree's next note keeping the configured default), blocks and spacing
(`block-gaps`, `spacing`,
`empty-*`, `enter-new-paragraph` — a letter typed after `Enter` at the end of a block is a
paragraph of its own, whether a block follows it or the block is the file's last, and the
same for a new note's blank body line — `insert-rule`), code and lists (`code-tab`,
`code-shift-tab`, `list-*`, `fence-open-typing` — a typed ` ``` `, `$$` and top-of-note `---`
become the whole fenced block with the caret on the blank line in it, and a fresh code fence's
label opens the language list — and `bare-marker-typing` — a typed `-` stays the character, and
the item begins at the space that follows it; `fence-source-mode` — a fenced block renders its body
while the caret is elsewhere and its own text, delimiters and all, while the caret is inside it;
`fence-exit` — the closing fence is a line the caret can sit on, and `Enter` at its end makes a
blank line under the block; `placeholder-boxes` — a blank paragraph, an empty list item, an empty
table cell and an empty fenced body hold no character, keep their line, and put the caret on it;
`list-marker-ink` — a list's bullet or number stands off the page it is drawn on, in both themes),
`list-caption-editing` — a list caption below its list, the optional source separator, source reveal,
label, target ID, attributes, direct/one-blank forms, and unchanged item editing;
`list-crossrefs` — configured list labels and prefixes, automatic-reference text, first-item
navigation, and an empty-item placeholder; `list-default-document` — the fixture's caption-only,
ID-only, ordered-start, task and nested list cases, manual and automatic links, and navigation;
callouts (`callout-rendering` — both source forms render one panel and reveal exact source;
`callout-empty-navigation` — empty, nested, quoted-Div and adjacent callouts are reachable in one
arrow from either side without source edits; `quote-enter` — paragraph, nested-level, list, table,
code, equation and empty-body Enter rules; `quote-list-enter` — a quoted parent inserts its next
sibling after nested children and an empty quoted item leaves the list without leaving the quote;
`quote-source-editing` — complete quote source, physical blank-line deletion, exact `>` spacing and
escaped-note Enter; `callout-div-enter` — one newline per Div Enter and repeated blank lines;
`callout-div-open` — `:::` creates a closed Note Div and its six-kind picker;
`callout-default-list-enter` — the fixture warning's last list item continues without document loss;
`quote-style` — the quote's side rule and closing glyph are gone, with two-sided inset and one large
opening mark;
`callout-default-document` — the fixture's five built-in kinds, custom Div, nested callout and
block-rich bodies);
tables (`table-caption-editing` — a caption below its table, an unrendered optional separator that
can be added or removed from the caption source boundary, source reveal, label, target ID, and
direct/one-blank forms; `table-caption-crossrefs` — configured labels and
prefixes, automatic-reference text, and command-click into the first header cell;
`table-crossrefs-default-document` — the fixture's caption-only, ID-only, and labeled tables,
manual and automatic links, unapplied `.margin`, and navigation; `table-blank-line-typing` — a
line after the table keeps its own caret instead of resolving to the last cell;
`table-cell-typing` and `table-enter-exit-caret` — existing cell editing and exit behavior stay
unchanged), equations (`equation-rendering` — plain and labeled formulas, one Yi number,
suppressed KaTeX environment tags, full source reveal, and `[$$` autocomplete;
`equation-crossrefs` — configured labels, automatic/manual links, and navigation to the formula
body; `equation-matrix-default-document` — all 13 environment/plain rows with and without IDs,
including numbering and native-tag suppression; `equation-source-editing` — unlabeled rendering,
exact source-line clicks, and unfinished attributes; `equation-empty-navigation` — Left from the
following line enters an empty equation's source), what typing offers (`brackets` — the pair, the `[[` that comes out as two pairs, the
pair Backspace takes away whole, the literal block and the selection it writes nothing around;
`completion` — the bibliography's keys, narrowed by key *or* title, the arrows and Enter;
`completion-wikilink` — the workspace's documents, the id Enter writes and the file name a document
with no id is written by, which its title beside it must not be mistaken for; `wikilink-cmd-click` —
the same resolver followed rather than typed: ⌘-click opens the document a rendered wikilink names,
through the session, the way a click on the tree's own row does, a target no document answers to is
said so, and a plain click still opens the link's own source — the citation probe
also holds the popover's own geometry: a row flush inside the card, and a card that stays put while
the arrows move), footnotes
(`footnote-*` — the button, the marker's two clicks and its source,
the preview card, the label's own edits, and the shapes a definition is written in:
`footnote-containers`, `footnote-container-jump`, `footnote-table-cell`,
`footnote-repeat-label`, `footnote-labelled`, `footnote-label-undo`,
`footnote-label-rebuild`, `footnote-label-edge`), description
lists (`description-list`), the caret (`boundary-caret`, `pointer`,
`wrapped-line-left` — a left arrow from a soft-wrapped line's start draws the caret at the visual
line above's right edge,
`click-away-deselects` — Select All leaves the document selected, and a click outside takes the
selection away with the caret so the next keystroke writes nothing —
`select-across-blocks` — a drag that crosses a block boundary keeps the selection it made, while a
margin click the pointer never moved through still places a caret —
`press-released-where-it-started` — a press the node's own click left standing does not judge the
next click, because a gesture released where it went down is not a drag —
`select-in-code-block` — a drag inside a fenced block keeps the selection it made, though the click
that ends it lands the caret back in the block whose own text is the shape being shown —
`regression-arrows`, `edit-stability`, `regression-undo`, `undo-after-scroll`,
`plain-edit-offsets`, `undo-typing`, `undo-run-taken-back`, `undo-selection-return`,
`undo-selection-across-blocks`, `undo-plain-write` — the page follows a plain write's undo, for a
committed word and a typed letter),
and the page staying where the reader put it while the window turns over
(`scroll-caret-anchor` — scrolling up from the end of a document must not jump to a caret the
reader left behind; `rebuild-keeps-the-caret` — a page-wide rebuild, which is what a saved setting
or the bibliography arriving asks for, leaves the caret in the note it was in: the reader's caret
is a live DOM range, the browser relocates it rather than dropping it when the element it sits in
is removed, and a letter typed at a caret that names no offset replaces the whole document;
`caret-rebuild-line` — undoing a table-caption edit never paints the caret at the table's
provisional height before the rebuilt caption has settled),
what a keystroke costs (`edit-cost` — the keystrokes at the end of the
document as it loaded, and `edit-cost-notes` — the same in a text with a thousand footnote
definitions pasted on: each round is bounded by the clock, because what a keystroke there costs is
not a constant; `scroll-cost`, `block-rebuild-cost` — what parsing, building and replacing the block
a keystroke lands in costs, `block-keystroke-cost` — the fast path's keys and the geometry reads
they make, and `block-keystroke-structural-cost` — the asterisk the editor answers by rendering the
block, from the same caret the fast path is measured at; `edit-keeps-the-window` — a keystroke at
the end of a long note leaves the window it was in rather than mounting the whole document),
`typed-text`,
`plain-edit-parse`, `plain-edit-markers`, `block-offset-cost`, `load-cost`,
`typing-cost-by-kind`, `code-local-write` — writing into a highlighted code block locally, which
shows nothing while the write is a letter or a digit, and `code-local-write-stale` — the delimiters,
where the rest of the line keeps its old colours — `keystroke-parts`, `code-markup-layout`), finding (`find-replace`),
localization (`localization` — the catalogues a component reads when it is built, and the locale rule both readers share; the *menu's* own strings are held by Rust's tests, since no page can read a native menu), typing through the system (`input-method` — an input method's word, dictation and the emoji panel land in the document because an invisible textarea holds the keyboard where the caret is, and the next author-typed space is not mistaken for the candidate key; `input-source-switch` — one source-change event rebinds the focused seam so Chinese pinyin starts after English, delivered by AppKit on macOS, `WM_INPUTLANGCHANGE` on Windows, and IBus/Fcitx D-Bus signals on Linux (the Windows and Linux delivery paths await platform checks); `input-method-blocks` — the same in a paragraph, a heading and a list item; `input-method-passthrough` — explicit 229 letters keep the method's own case and survive an editor-handled space, while English Caps Lock stays on the editor path across a source switch; `empty-task-composition-burst` — a committed word followed immediately by a fast burst keeps the empty task row, its placeholder and the input focus; `input-method-literals` — and in a table cell, a code block and an empty display formula; `input-method-escape` — a cancelled composition does not close the message the reader is reading, while a plain Escape still does), `space-typing-visibility` — spaces at the end of a leaf and in a run stay visible while the source keeps ordinary spaces, paste (`paste-blocks`), source mode
(`display-math-*`, `math-*`, `inline-math-*`, `revealable-flows`,
`revealed-source-exit`, `reveal-click-scroll` — a click that opens a source keeps the
page where it was; `reveal-keeps-its-height` — and the block it opens never spends a frame at
the `contain-intrinsic-size` fallback, which is what a reader sees as the paragraph blinking and
the page under it moving), links (`insert-link` — the button, the clipboard destination and the
caret in the title; `insert-link-clipboard` — a clipboard that offers no URL and one the
app cannot read at all, either way with the webview's clipboard never asked;
`link-cmd-click` — ⌘-click opens URLs in the browser, a plain click opens the source, and a same-document fragment asks the reference navigator while an empty href remains inert; `auto-references` — `[#id]` infers a heading title, reveals its source, navigates, and marks an unknown target unresolved; `blank-line-heading` — bare `#` characters stay visible until their delimiter space starts the heading, whose level marker remains visible while it is empty; `heading-crossrefs` — automatic, duplicate, custom and setext IDs reach distant virtualized headings without changing the hash, missing targets are named, and plain clicks still edit source; `heading-crossrefs-default-document` — the shipped demo's links and all three attribute kinds; `heading-attributes` — attributes hidden outside a heading, editable inside it, with only the ID applied to the DOM and one Left leaving the source block; `figure-rendering` — implicit figures, captions, inferred numbers, explicit IDs, source editing, and exclusion of arbitrary classes; `figure-crossrefs-default-document` — the shipped figure example with configured label and prefix; `listing-rendering` — caption-only, ID-only and fully attributed listings, generated labels, source mode and code bodies; `listing-crossrefs` — listing navigation lands on the first code line and follows document labels/prefixes; `listing-crossrefs-default-document` — the shipped listing examples; `link-opens-a-note` — a link whose destination is a *path*: ⌘-click opens the note it names, beside the note being read or written from the root of the workspace, in either spelling, and says which path failed when there is nothing there —
`link-click-stays-in-the-window` — the harness's own stand-in, with a ⌘-click still reaching the
app and asking for the URL while the window stays where it was) and images
(`insert-image` — the button, a URL, a path and a `file://` URL from the clipboard, a
selection becoming the alt text, and the empty image a clipboard the app cannot use leaves behind;
`insert-image-blob` — a picture on the clipboard, the card with it drawn in it, the name it starts
from, the file saved where the settings say, and the image *painted* once the note names it;
`image-path-with-spaces` — a path a reader wrote by hand, spaces and all, painted from the note's
own folder and from the folder the settings name, and a path that spells the space as a browser
does (`%20`) read as the file it resolves to, with the prose it shares its paragraph with left as
prose), the
highlighted source (`source-theme` — the palette of a code block, the frontmatter and a
formula's source, measured in both themes; `source-highlight-caret` — a click in the
frontmatter, and in a code block, writes the character it was aimed at), the
documents and their stack (`document-stack` — a file opened, pushed, and the next file replacing it without a question; `document-stack-restore` — a document coming back with its caret and its view; `document-stack-ask` — the four answers the session asks about; `settings-push-on-open` — the General tab's switch for that question, an editing document pushed without asking, a saved one replaced without being pushed; `document-session-restart` — the session file, and the startup path that reads it; `document-opens-without-a-caret` — a document opened with nothing remembered invents no caret, so a note opening on a picture draws the picture, while a caret the session *does* remember comes back where it was, and a keystroke with no caret writes at the text's own start), the
things the app says (`messages-and-hints` — a failure raised from the tree waiting in the window's
bottom-right corner with its ✕ at the card's right edge, a press elsewhere leaving it, Escape and
the ✕ closing it, a second message stacking above the first; and a copied path as a hint beside
its row, with no ✕, gone at the next press — or at Escape, which leaves no card behind), the
first start (`first-run` — the card the start-up path asks with, saying where a new workspace would
be made, a folder taken from the path field and becoming the workspace the tree then shows, the
answer remembered, and "not now" writing nothing; `first-run-create` — the other answer, with the
documents folder pointed at one the probe made, so the folder appears once and is adopted when it
is already there); `tutorial` — the Help item's event opens the tutorial, its status says read-only,
typing and a formatting command change nothing, and opening a file asks nothing;
`tutorial-first-start` — a first start with no restored document opens it, and a later start with
nothing restored does not), the versions a workspace keeps (`versioning-facts` — what the backend says of a
folder it made itself, and what it says about `~/Library/CloudStorage` without asserting a vendor's
answer; `versioning-fake-git` — every argument the app hands git, watched by a git that only
records (`probes/fake-git.sh`, committed because a probe cannot set an executable bit);
`versioning-save` — the question a workspace nobody has answered for is asked, the answer remembered
with its path, the note committed, and the status button stamped before the action returns;
`versioning-staged` — a file the reader had staged is still
there to commit after a version of another note; `versioning-consent` — the answer that is *no*,
nothing written or made, and the General tab's switch asking the same question; `versioning-repository`
— a repository the reader already has, used as it stands; `versioning-outer` — a folder *inside* one,
never nested into; `versioning-no-git` — the machine with no git, which is told and writes nothing),
watching what the app asks a tool (`export-pandoc-arguments` — the whole of what the app hands
pandoc, watched by a pandoc that only records (`probes/fake-pandoc.sh`, committed for the reason the
git one is): the kind's own defaults file, the output, the folders a relative destination resolves
against, the library and the CSL style the citations came from, the heading the appended list gets,
and the note — which is the text *after* the export's pre-process, so a wikilink arrives as the
words it renders as, an image's destination as the absolute path the app resolved it to, and a
fence's body untouched; `export-kinds` — one item per kind in the File menu's *Export* submenu: every
kind the app ships opens the card it names, about that kind, under the note's own name
(`note.processed.md` for the one kind whose output would otherwise be the note itself; HTML's
target is the bundle folder `note/`);
`export-docx` — the File menu's *Export* item for the docx, end to end: the card, the target field,
the settings button opening that file in the defaults editor, the real pandoc writing a Word file where
the reader asked with the note's picture inside it (`word/media/`, read out of the zip's own entry
names), a captioned table's bookmark/number/link relationship, the hint that says so, and Escape
writing nothing at all, plus captioned lists with shared full-width wrappers, captions, bookmarks,
and automatic links, and labeled/unlabeled equations sharing full-width one-row two-cell tables;
`export-refused` —
the two ways an export stops: a machine with no pandoc saying so with the button refused, and a
pandoc whose own sentence reaches the reader as a message while nothing of the note is left behind;
`export-odt` — the second kind: the menu's odt item opens its card and the target's extension is that
kind's own, the configuration file it names is that kind's own, and what comes out is a valid ODF
(`mimetype` first and stored, the note's picture in `Pictures/`) — the machinery a kind costs, which
is a row, an asset and a menu item — plus a table's named section, visible number, and link;
the same probe also holds a labeled equation's named section, the shared full-width formula table,
and a captioned list's named section and visible caption;
`export-latex` — the third, and the one where the *file the document refers to* is the test: the card's
target is a `.tex`, the document is whole (`\documentclass`, `\begin{document}`), and a picture
named `a b#c%.png` is referred to as `{a b\#c\%.png}`, whose un-escaped path is the file the app
resolved — plus the citations as `(Smith, 2020)` over a `\section*{References}` and its `\bibitem`, and
the kind's own font rule in both of its halves: a `.tex` of a CJK note carries **no** font setup as the
file comes (naming a font the reader's machine may not have would fail their compile where the card's
hint merely warns), and carries `\usepackage{xeCJK}` with the name for the length of one export where
the reader has written one into their own copy; its captioned tables keep native `\caption` and
`\label`, automatic references become `\yiTableRef`, and captioned lists use the namespaced
`yilist` counter with `\yiListRef`. Under idiomatic highlighting, a caption-only listing title
does not advance the counter, an ID-only listing advances it through a zero-width native caption,
and a fully captioned listing follows;
the template package probes sit beside them: `export-template-import` (a folder, a zip with one root,
a wrapper, a duplicate and a remove; the session stack stays empty), `export-template-defaults`
(pandoc's default template and reference document, and a validation that names a deleted entry),
`export-template-output` (HTML and LaTeX markers in the output, the class, bst and every other
package asset delivered beside the `.tex`, and a Word export through a reference document),
`export-template-assets` (Yuki's `template/css/…` spelling embedded in self-contained HTML, the full
LaTeX asset tree, and an EPUB with its package assets packed into the book),
`export-template-defaults-package` (a package's `defaults.yaml` reaching Pandoc after the app's file
without replacing the explicit template or output),
`template-examples` (all seven authoring examples imported and validated by the app, including the
XeLaTeX PDF example and the pdfLaTeX Rho Class article), `documentation` (Help → Documentation as a read-only, replaceable guide
with the installation and template-authoring chapters),
`export-template-metadata` (a cover from the note's YAML and a literal seal path, with both files in
the bundle), `export-template-nested-wrapper` (a complete sample in `samples/` wrapped beside itself,
literal dollars escaped for Pandoc, and another sample selected without losing the folder), `export-template-ui` (the Template row,
the library's inspect-then-import, CodeMirror, an atomic save, validation and the defaults panel),
`export-template-create-ui` (Create…, details, duplicate and remove) and `export-template-pdf` (the
entry's folder as the engine's working directory with the package root on `TEXINPUTS`, which is what
finds both `sampleteaser.pdf` and `acmart.cls` for nested entries), with
`export-template-broken` holding a newer manifest to the sentence it names and the library row it
can still be removed from; `export-template-native-bibliography` drives the PRL package through the
ordinary export card with a selected `.bib` and then a CSL-JSON library, proving both become a
cited-only `references.bib` in the output tree;
`export-citations` — the three citation forms nobody had asked citeproc about, read through an EPUB
because a book is a zip and `lib.js: zipEntry` inflates its pages: a locator lands where citeproc's
grammar expects it (`(Smith, 2020, p. 45)`), a suppressed author leaves a parenthetical with the year and
no name (`(2020)`), the reference list is appended under the heading the app asks for, and
**`suppress-bibliography` is metadata and not a variable** — measured: a `variables:` line leaves the
list exactly where it was, and the file's own `metadata:` block is what resolves the keys and appends
nothing;
`export-html` — the fourth: the card's Self-contained box is off by default and the target is a
bundle folder whose `note.html` is read back; a web picture stays the URL the note wrote instead of
becoming an app temporary; the heading is shifted the way the file says, the math is marked for
KaTeX (a CDN script and stylesheet), and the citations become a headed `References` list; a
captioned table keeps its ID, numbered caption, class, and automatic link; labeled and unlabeled
equations share one borderless layout-table row with formula and a left-aligned reserved cell;
`export-html-local-assets` — the bundle's contents: the note's local picture is copied to
`note.assets/`, a web picture stays its URL, and Yuki's `template/` tree travels beside the page;
`export-epub` — the fifth, and the one whose output is a *container*: the probe reads the book the way
a reader's software does and inflates entries by name, so the stored `mimetype`, the note's own
frontmatter as `<dc:title>`/`<dc:creator>`/`<dc:language>`, the web picture carried in `EPUB/media/`,
the navigation and the chapter's `References` list are all values it asserts — as are a captioned
table's anchor, visible number, automatic link, and preserved `.margin` class, and labeled and
unlabeled equations sharing adjacent formula and reserved-number cells;
`export-font-hint` — the card's font hint: a note written in characters this export cannot draw is said
so in the app's own words, with the characters it is written in and the settings file beside it. This
build ships a face per script, so Chinese, Korean and Greek are quiet and stay quiet; what is left is a
script with no face (Tamil, named as `mainfont: "…"` — the widest font the machine is known to have) and
the characters the TeX suite's own font was measured to miss (a bare `≤` is named where `√ ∞ ± × ÷`
beside it draw, and the same character inside `$…$` is not, because pandoc sets a formula with the maths
font). A docx never says it, because what opens that file picks a font itself. The name it gives a reader
for those characters comes from **this machine** (`system_fonts::covering`, out of the fonts' `cmap`s),
and the probe holds the app to its own suggestion: it reads the name out of the hint and writes it into
the settings file, where the card's unknown-font line must stay quiet — a suggestion the machine does
not answer to is the very failure that line exists for. And the other thing the
settings file can get wrong is in the same probe: a font name this machine has none of — a run that never
happens, where the hint is about a run that loses characters quietly — said in its own line on the card
by the name the reader wrote, and *not* said when the name is one this machine's fonts answer to;
`export-config-replace` — the settings row's second button: a copy that is already the file this build
ships is not offered for replacement, one that differs is, the cautious answer leaves it exactly as it
was, and agreeing writes the shipped bytes back (the first half of the measurement above: a shipped file
that changes reaches nobody who already has one, and this is the reader's way to ask for it);
`export-pdf-scripts` — the ten scripts this build ships a face for, with **nothing** added to the
settings file: the shipped copy is put back, the export runs, and the page is read back one font at a
time (`lib.js: pdfText`) — every script on it, and drawn by the faces this build ships rather than by
whatever the machine happens to have (`lib.js: pdfFonts`, since text alone cannot say *which* font
drew it). It fails if the app ever stops handing the reader's file to pandoc as it stands;
`export-pdf` — the sixth: the card for a PDF (its own target, the settings file it names) and a real
`%PDF-` through the TeX engine that file names — one of the three probes that always outrun the
bridge's five seconds, because a single TeX run is four of them (the harness says so and reads the
result out of the page's stash; there is nothing to split, since the overrun *is* one export) —
the compiled page's table, equation and list references and captions follow their literal prefixes,
and document-configured figure and listing labels reach the native PDF captions;
`export-pdf-table-template` — a copied Rho package redefines `\thetable`, its Lua filter rewrites
the table, and the compiled page proves the filter kept `\caption`/`\label` while `\yiTableRef`
read `R-1` from the package counter;
`export-pdf-equation-template` — a copied Rho package redefines `\theequation`; the compiled page
proves automatic equation references and the displayed equation both use the package's `R-1`;
`export-pdf-list-template` — a copied book template implements `\yiListCounterSetup`; lists in two
chapters compile as `1.1` and `2.1`, and automatic references follow those chapter-local values;
`export-pdf-page` — the page the card offers for that kind: both fields open on the settings file's own
and come out A4 portrait, letter + landscape comes out 792 x 612 points read from the page's own
`/MediaBox`, another kind is offered no page row at all, and the reader's settings file is untouched
(two TeX runs, so it outruns the bridge exactly as `export-pdf` does);
`export-pdf-font` — the same kind with faces of the *reader's* own named in their settings file for one
export: `CJKmainfont: "Songti SC"` for Han and kana and `yi-hebrew-font: "Arial Unicode MS"` for one
script, with the page's own `/BaseFont` entries read back to say which face drew what — their CJK face
on Han and kana, their Hebrew face on Hebrew *and the shipped Hebrew face absent from the page*, the
face this build ships on Hangul (measured: `Songti SC` draws Han and kana and has no Hangul at all,
which is why a Korean note survives that line) and on a script the file named nothing for; the third
TeX-run probe;
`export-picture-hint` — the card's other hint about a *note*: a destination that is a `data:` URL of
something which is not an image is named on it, and a picture's own `data:` URL leaves it quiet — read
out of the parse by `ui/export/picture_hint.ts`, and drawn before any export is asked for;
`export-picture-formats` — a picture whose format a Word file does not promise, and the *kind*: one note
naming a local `figure.svg` and a local `shot.webp`, exported as a docx (PNGs the app drew and neither
format — the vector at 240 x 120 for a 120 x 60 vector, the webp at its own size) and as an EPUB (both
as they are, and no PNG), with the pictures a run drew gone when it ends;
`export-markdown` — the seventh, and the one conversion that is *entirely* the app's (no pandoc is
asked for it and none is needed): the note as every other export is handed it, written as
`note.processed.md` (never over the note), with the wikilink rendered, the citation as the words it
reads as, the works it names appended under the app's own heading, and the note's own headings left
at their own levels; figures, listings and captioned tables become identified HTML with visible
captions, labeled equations become ID-bearing MathML blocks, captioned lists preserve task boxes,
nested lists and numbered captions, and every automatic reference is resolved to an ordinary link;
`export-web-image` — the picture a note names on the web: the app fetches it with `reqwest` from the
local HTTP fixture (a redirect to a real PNG), follows the redirect, hands pandoc a local file, and
the document that comes out has `word/media/` in it and no fetched copy left behind;
`export-web-picture-formats` — the same fetch for an SVG and a webp: a note naming both on the web,
exported as a docx (PNGs the app drew and neither format) and as an EPUB (both originals and no PNG),
and as the app's own markdown (both URLs kept, because that file outlives the run), with the fixture
answering both content types and the fetched copies gone at the end),
the versions of the note on screen (`versioning-status` — the button at the left of the status bar:
hidden where the reader said no, with the recorder's log left empty, and saying the newest version's
stamp where they agreed; `versioning-list` — the history modal's two columns, the newest row
selected with its title shown separately from the stamp, and the comment under its own row and no
other; `versioning-list-empty` — the four states
that open no modal, the last by pointing the git seam at a git that is not there),
seeing a version and going back to it (`versioning-diff` — the modal's row press replacing the
right column: the whole note as lines, the changed one marked on both sides, the first change in
view, the keyboard with the modal rather than the text behind it, and Escape closing it with nothing
changed; `versioning-diff-large` — a long diff keeps the modal inside the window, the history row
visible beside it, and scrolls only the right column;
`versioning-restore` — *Restore This Version* asking the session's own question, the file holding
the version's text, the document on screen being it and *Saved*, and what was there kept in the
stack as a document of its own),
the
page (`a4-page` — 210 mm of sheet, a 25 mm margin, centred on the theme's desk, the measure
the reader gets, the smaller page a narrower pane is given instead of a sideways scroll, and
the whole rhythm coming down with it; `heading-level-markers` — all six heading levels carry
their supplied hidden glyph at one page-scaled size; hovering shifts only the glyph into the
left margin, leaving heading indentation and text still, without entering the text or taking
its pointer; `page-layout-toggle` — the status bar button's two
layouts, driven by pressing it), the
fixture workspace (`fixture-*`), and the real
documents (`real-doc-math`, `real-docs`).

`listing-source-horizontal-caret` holds the source box's horizontal scroll across
both typing and deleting at the end of a long fenced-code opening line.

`npm run probe:all` prints every probe's name and result as it goes, which is the
live index; the newest probes carry a header naming what they cover:

```js
/**
 * One line on what this proves.
 *
 * @covers src/ui/markdown/<file>.ts
 * @fixture test/fixtures/workspace/...      (when it needs one)
 * @needs-workspace                          (when the app must open the fixtures)
 * @needs-http-fixture                       (when the app fetches a web picture)
 */
```

## Conventions

- **The fixture is a test's, never the reader's.** A dev app holds the maintainer's config (their
  workspace, bibliography and layout) and their session (the documents they had open).
  `--with-workspace` snapshots and restores the config for you, and the harness snapshots and
  restores the **session** for every run (`test/tauri-probe.mjs`): the reader's own goes back into
  the file, the app is left holding **no** documents (a probe drives a document of its own, and a
  live session that holds one turns the harness's starting document into a question), and a run that
  dies leaves a note the next one puts back. A probe does not have to do any of that, and a probe
  that writes works in a folder of its own under `$HOME`, never in the reader's notes.
- A probe header may declare what it needs: `@needs-workspace` (the app pointed at the
  fixtures: run with `--with-workspace`), `@needs-source-workspace` (the maintainer's own
  notes folder open: `probe:all` skips it), `@needs-large-document` (`probe:all` gives it
  the 323 KB fixture note; everything else gets the demo document), `@needs-foreground-window`
  (the editor window must be visible, so `probe:all` skips it), and `@needs-http-fixture` (the
  harness starts `test/http_fixture.mjs` on loopback and puts its base URL in
  `window.__probeHttpBase`; its PNG, SVG, webp, redirect, missing page and no-type endpoints need no
  network).
- A probe whose subject is written *through the webview* — a note opened, a picture inserted — may work
  in a folder anywhere the app's own commands can make one: the file plugin and the asset protocol start
  scoped to `$HOME` (`src-tauri/capabilities/default.json`), and the app grants the folders it is
  *working in* at run time (`src-tauri/src/access.rs`) — the workspace and the folders the settings name
  where the config is read, and a document's own before the session reads it. Measured:
  `workspace-outside-home.js` reads, writes and paints in a folder under `/private/tmp`, while a folder
  nobody asked about is still refused. `new-markdown.js` and `tree-create.js` still make their folder
  under `$HOME` with `plugin:path|resolve_directory` and remove it in their `finally`, which is a
  convention rather than a limit now; a probe that *means* to work outside it says so in its header.
- A probe **cannot run a command**, and it cannot read inside a dot-named one either: the file
  plugin answers `forbidden path` for `.git/HEAD` and for `exists` on `.git` (measured), so a
  repository is observed through the app's own commands — which is what `versioning-*.js` do — and
  anything that must *be* a command is committed, not written (`probes/fake-git.sh`, which the app
  is pointed at by name through its own seam).
- **The app's window has to be in front.** An occluded window is throttled by the system, and every
  sleep a probe takes then costs a second of wall clock or more: the same probe measured **2257 ms**
  with the window in front and **5008 ms** behind the terminal, where one `git init` through the
  app's own command took 6.7 s. Bring the app forward before reading a probe's time
  (`osascript -e 'tell application "System Events" to set frontmost of (first process whose name is
  "yi") to true'` is what this project's sessions use), and read a probe that only sometimes
  finishes as too long whatever the window was doing.
  It is not only the clock: an occluded webview stops the *frames*, so what depends on the
  frame-scheduled sync of the window fails outright rather than slowly — measured, four probes of
  that kind (`document-opens-at-its-top`, `document-session-restart`, `completion`,
  `footnote-label-edge`) failed at the five-second line while the app was behind, and passed by
  name at 2 900–4 200 ms with it in front. Two things put it behind without anyone noticing.
  **A ⌘-click on a link asks the system to open it, and the system's browser then takes the
  front** — measured, a ⌘-click on a link in a probe's own document brought Google Chrome to the
  front while the probe ran, and a browser held the front through part of one sweep with the page
  reporting `document.hidden === true`. (A *plain* click on a link is not this: it places the
  caret, `click_routing.ts: routeLinkClick` asks for ⌘ or Ctrl.) The harness takes the opener's
  system hand away before every probe and keeps what the app asked for in
  `window.__probeOpenedUrls` (`tauri-probe.mjs: holdTheOpener`), so this cannot cost a run its
  front; a probe that checks the opener itself installs its own stand-in over that and still sees
  the call, and the hand goes **back** when the run is over (`tauri-probe.mjs: releaseTheOpener`):
  the app is the reader's, and while the hold stood their own ⌘-click on a link asked the stub and
  no browser opened — measured after a sweep, `String(window.fetch).includes('__probeOpenedUrls')`
  was true in the running page and false again one run after the release was added.
  `link-click-stays-in-the-window.js` holds both halves of the seam, and the release is a line of
  its own in the log, not something a probe can see: it runs inside the hold. And a window that
  has been **closed** leaves the process answering with a page that never paints at all: the tell
  is the page's own, `document.hidden === true` (`visibilityState: "hidden"`, and
  `document.hasFocus()` false), and a sweep on such a page measured 5 007 ms for *every* probe,
  each one recovered, with the same four failing. Restarting `npm run tauri dev` clears the second,
  and `frontmost` is worth a look whenever a cluster of frame-dependent probes fails.
- **A run that died mid-probe leaves the *config* — and the reader's export settings — where the probe
  put them, and the next run puts them back.** The harness reads both before a run and writes them back
  after, and neither happens when the run is gone before the probe reports. Measured this round, the
  hard way: a page reload while `export-pdf-scripts.js` was running took its own restore with it and
  left two `mainfont:` lines in the maintainer's `export.pdf.yaml` — which is invalid YAML, so every
  pdf export after it failed until the file was written back by hand. So the export settings files the
  app names (`export_kinds` → `config_path`) are read and written down beside the config's note
  (`<tmpdir>/yi-probe-export-settings.json`), and a note left behind means a run died: its files go
  back before the next run measures.
- **A run that died mid-probe leaves the *config* where the probe put it — and the next run puts it
  back.** The harness reads the config before a run and writes it back after (`--with-workspace` does
  it for the workspace and the bibliography; a probe that points the app at a folder of its own
  restores it itself), and none of that happens when the run is gone before the probe reports:
  measured, after a sweep whose app had died, `get_config` still named a workspace the fixtures'
  notes are not in, and five probes that silently depend on the fixtures (`completion-wikilink`,
  `document-stack`, `document-stack-ask`, `document-stack-restore`, `settings-push-on-open`) failed
  *identically on `main` and on the branch under test*, on a freshly started app. So the config a run
  *finds* is written to `<tmpdir>/yi-probe-config.json` before the probe runs and the note is removed
  when the run is over: a note still there means the run that wrote it never finished, and the next
  run writes that config back — with a line saying so, because a reader who changed their own
  settings after such a crash would otherwise see them revert unexplained (`tauri-probe.mjs:
  openTheConfig`; measured with a note left by hand and a different value in the app: the next run
  printed the line, put the config back, and removed the note). Read `get_config` before believing a
  cluster of failures like that anyway — a crash in the middle of a *sweep* still costs the rest of
  that sweep.
- A file read over the raw bridge (`plugin:fs|read_text_file`) comes back as an **`ArrayBuffer`**,
  and `Uint8Array.from(buffer)` on one is an *empty* array rather than its bytes — take it as it
  is: `bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes)`, which is what the plugin's
  own wrapper does. Two probes were written the other way round and both read `''`; the one that
  then *saved* what it had read wrote nothing into
  `test/fixtures/workspace/default-document.md` and the demo document had to be restored with
  `git restore`. Anything that stands in for a *person* — a save, an answer — can write the
  fixtures, so a probe that would do either in the fixture workspace should work in a folder of
  its own under `$HOME` instead.
- A **native** surface — the system's save sheet, a window menu, the prompt's own dialog — cannot
  be driven, and cannot be stood in for from the page either: the dialog plugin's `save` does not
  travel over the webview's `fetch` (measured; a `fetch` stand-in that works for an app command
  and for the opener never sees `plugin:dialog|save`, and the real sheet then blocks the harness
  for its whole budget). So the app gives every question two hands and a probe drives the card:
  which hand is in the room is `src/ui/under_test.ts`, one rule for the prompt, the new-note card
  and whatever comes next. A rule that only the native hand reaches belongs in a pure module with
  a check beside it — `check-workspace-folders.mjs` holds the one the new-note sheet's answer is
  read by.
- A probe is one expression returning `{ checks, failed }`; a probe that only
  measures returns its numbers. The harness reads that verdict: a probe with a
  non-empty `failed` exits non-zero, so `npm run probe:all` fails with it (it did
  not always — two probes had been failing quietly, see `docs/roadmap.md`). Use
  `t.report(...)` for progress, so a bridge timeout still yields evidence.
  Every report a run makes is stamped with that run, and the harness reads back only its own:
  a probe cut off at five seconds keeps running while the next probe drives the page, so
  without the stamp its numbers were read as the next probe's — measured, a probe that never
  reported at all passed on another run's result (`test/probe_stash.mjs` is the rule,
  `docs/testing.md` the account).
- **`raw()` leaves the document selected.** Reading the whole text is Select All + Copy, and the app
  paints that selection a moment after the command; a probe that reads the document and then types
  *without clicking* replaces the whole document with what it typed (`raw()` then `t.key('x')` leaves
  `'x'` — measured). It is the app behaving as any editor does over a live selection; click the line
  you mean to type in first. `click-away-deselects.js` holds both halves: the selection after Select
  All, and the click outside that takes it away with the caret.
  A read's selection does not, on its own, explain what fails: measured while `fence-exit.js` was
  being fixed, the *editor* holds the read's selection only until the read's own clear lands as a
  `selectionchange`, and the case that eats its document does so with the editor's selection
  `null` (traced). The open item in the roadmap says what is ruled out and what to measure next.
- **A click a probe makes is a gesture: send the press with it.** The editor remembers where the
  pointer last went down, to tell a click from the drag its click may be ending — a gesture that
  travelled a few pixels and left a selection asks for no caret (`editing/pointer.ts: endedADrag`).
  A reader's click always carries its own press, a probe's need not: `t.click` now dispatches
  `pointerdown`, `pointerup` and the click at the point, and a probe that dispatches a bare
  `MouseEvent('click')` is judged against whatever press the page last saw — which may be another
  probe's, standing there since a markdown node answered *its* click and stopped it. Measured, with
  the document selected from `raw()`: a bare click moved the caret to the end of the block, a bare
  click with one fabricated press left in the page did **not** move it at all, and `t.click` did —
  `insert-link.js` lost its last check in a whole suite to exactly that, and passed by name the whole
  time.
  The editor's own half of that is closed now, in the same rule: a press is forgotten when the
  gesture is released where it went down — a gesture that travelled nowhere cannot have been a drag
  — and when it is cancelled, which no click follows. What a bare click can still be judged against
  is a press no release has ended, which a reader cannot make and a probe has to be caught making;
  `press-released-where-it-started.js` holds the pair (the same click with no press, and with one a
  node's click left standing) and fails against the old rule: measured there, the caret stayed where
  the node's click put it, at 0, against the control's 15.
- Name probes for the behaviour, not the file they touch.
- A check prints `all checks passed` on success and the failures on stderr.
