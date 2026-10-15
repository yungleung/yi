# AI context pack

You are an AI agent (or a person) about to work on Yi, a Tauri + TypeScript
WYSIWYG markdown editor. This is the one document to read first: it says what the
code is, the rules that must not break, and how to prove your work. If you are an
agent, treat it as your brief; if it disagrees with the code, the code wins — then
fix this file.

## What this is

A local-first notes app: a folder of markdown files is the workspace, the editor
renders it, and every edit is a plain-text edit to the file. The raw markdown is the
only source of truth; blocks are slices of it; only the blocks near the viewport are
mounted.

`docs/README.md` maps the documents. Of them, this one is the brief, `docs/architecture.md`
is the model (the layers, the invariants, the four offsets), and `docs/structure.md` is the
shape (the tree, the class families, and which convention each check enforces).

## Map

| Layer | Files | Job |
| --- | --- | --- |
| Syntax (pure, no DOM) | `src/ui/markdown/document/blocks.ts` and `src/ui/markdown/syntax/**` | split text, and the pure rules of editing |
| Document | `document/state.ts`, `document/blocks.ts` (the text, its blocks, the parse cache) and `document/history.ts` (the edit log) | the text and everything derived from it |
| Render | `virtual_block_renderer.ts` (the DOM), `block_sizes.ts` (the pixel arithmetic), `viewport_window.ts` (which blocks to mount), `create_block.ts`, `registry.ts`, `create_node.ts`, `nodes/*`, `source_mode.ts`, `format*.ts` | DOM for the window of blocks; `source_mode.ts` is how something whose markdown can stand in for its rendering — a link, a formula, an inline run (bold, italic, strikethrough, code), and every fenced block — is built as that source while the caret is inside it |
| Caret and offsets | `caret/*` — `offsets.ts` reads a rendered position back into the document, `dom_position.ts` places one from it | the logical caret, and mapping offsets |
| Commands | `editing/*`, `commands/*` (the registry, the native-menu bridge, the keymap), `markdown_editor.ts`, `click_routing.ts` | keys, menu, toolbar and table-menu actions — one command, one name, one way in |
| Shell | `src/ui/*` (the editor panel is `src/ui/editor_panel.ts`, the workspace tree is `src/ui/workspace/*`), `src/services/*`, `src/api/*` (one file per backend seam — the app's own commands through `invoke`, a granted plugin through its `@tauri-apps/plugin-*` package) | the window, workspace, settings, bibliography |

The workspace tree is a *view of the folder*: its menu, its drags and its renames all go
through the app's own file commands (`src-tauri/src/files.rs`, wrapped in `src/api/files.ts`)
and it re-reads the disk after a change instead of patching its own rows. What a row may be
offered is a pure model (`src/ui/workspace/tree_menu_model.ts`), what a rename selects and
which drops are allowed are pure rules (`src/ui/workspace/tree_rules.ts`), and a row's name
is edited where it sits, without moving the tree (`src/ui/workspace/tree_rename.ts`).
The dev server must not watch that folder: the app is opened on `test/fixtures/workspace`
in development, and a tree write there is a file change Vite would answer with a full page
reload (`vite.config.ts` ignores it), while a row is barred from being a native drag source
so the webview cannot be navigated to a dropped path either. A probe that works *in* the
fixture workspace rather than in `/private/tmp` is how that stays true
(`test/probes/tree-no-reload.js`).

A **first start** has no workspace, and the app now says so rather than waiting to be asked: the
rule is `services/workspace_setup.ts` (`needsWorkspaceQuestion` over the config's `workspace` and
its new `workspace_asked`), the card and the flow are `src/ui/workspace_setup/`, and
`main.ts: initializeConfig` asks **before** the session restores a document — a restored document
opens into a window that has to know its folder. The card says where a new workspace would be made
(`Documents/Yi`), because a reader offered "create one" is owed the answer to "where"; "use an
existing folder" is the system picker for a reader and a path field for a probe. Declining writes
nothing at all, so the next start asks again, and a reader who already has a workspace is never
asked. What the answer *does* is the File menu's own path — `workspaceManager.openWorkspace(path)`,
which announces `WORKSPACE_CHANGED` and persists the config — and only then is `workspace_asked`
written.

Asking the reader a question is `ui/prompt.ts`: one `Prompt` with two hands — the system dialog
for a reader, a card in the page for a probe — chosen by whether the harness's `__t` is on the
window, not by a flag. Reach for it whenever the answer has to arrive before the work can go on (a
call, where `eventManager` carries news); the session takes it as a port (`attachPrompter`), and
the workspace tree's delete asks the exported `prompt` directly.

Everything that floats over the page is one shallow family in `src/ui/floating/`: `FloatingSurface`
(hidden until opened, the card's chrome, Escape, never the focus), and three kinds that say *where*
it sits — `BesideCard` (fixed on the body, placed by the pure rule in `floating/placement.ts` beside
a box the caller measures, or in the window's corner when it names nothing), `AnchoredPanel` (in its
`relative` host, above or below the button it hangs from) and `QuestionCard` (the veil, the centred
card, and one answer
with Escape giving the cautious one). The footnote preview, the citation preview, the completion
list, the stack panel, the table picker, the prompt and the two cards are all one of those kinds
now; a kind may *add* to Escape but never replace it, and the base must not grow a mode flag — a
fact one kind has is a parameter it is built with, or a subclass of it. `ui/messages.ts` replaces
the old toast: one `BesideCard` per message in the window's bottom-right corner *whatever it is
about*, stacked upward,
with its ✕ at the card's right edge, and nothing disappearing on its own: a **message** is for
something that needs the reader's attention — a failure — so it waits for the ✕ or Escape, and a
press elsewhere leaves it. What the reader only has to *notice* is a **hint** instead
(`services/hints.ts`, `ui/hints.ts`): the tree's three "copied" confirmations, a card beside the row
they happened on, with no ✕, gone at the next press (or Escape). A hint's place travels as a *name*
— a workspace path, which is the row it is found by (`hintPlaceSelector`, escaped) — never as an
element, because the event bus is Tauri's and its payload is JSON.

Documents are a *session*: `services/session_rules.ts` holds the rules (pure, checked in
Node), `services/session.ts` the living one, and `session.rs` behind `src/api/session.ts` the
file it is written to. It keeps the document on screen, the stack behind it, and where the reader
was in each; the editor is a view of it (`captureView`/`restoreView` on the panel,
`scrollAnchor`/`scrollToAnchor` on the renderer), and the workspace tree hands a clicked file to
the session rather than to the editor, because whether the document on screen has to be asked
about is the session's decision. That question is only asked when replacing the document on screen
would lose the reader's words — a document whose text its file holds is the file's copy, and is
replaced silently — and the reader may answer it in advance: the General tab's switch
(`push_unstacked_on_open`, off by default) pushes such a document into the stack instead of asking.
Pushing a *saved* document is never done for them; the stack button is where they choose that.
Three things bite: a document's id is read at the *top* of it
(`document_identity.ts` — a note that links to another by id must not become it), a block's
offset is not the scroller's (a page puts 118px of desk and margin above the prose;
`virtual_block_renderer.ts: contentTop`), and placing a caret scrolls, so a view restore asserts
the scroll two frames later, as `keepScroll` does. A document that is neither stacked nor on
screen is dropped (`reachable`) — nothing could bring it back.

A **new note** is one command, `file:newMarkdown`. `services/new_document.ts` is the rule: the
id's fourteen digits (`YYYYMMDDHHMMSS`, local — an author's own stamp), the four keys every note
carries (`title` → `Untitle`, `date`, `id`, `keywords` → a one-item list holding `untagged`), the
template the reader may write (the app config's `new_file_frontmatter`, a string or null for the
app's own, shown by settings → *New note*) and the range the title's value sits in, so the editor
can select it. A required key whose value is written *under* it — the keyword list — is the
reader's and is left alone; one with nothing under it gets the app's. `services/workspace_folders.ts`
walks the workspace for the places a note can go, and holds the two path rules the answers are
read with (`parentFolder`, `fileName`, `placementOfPath`). `ui/new_document/new_document_flow.ts`
does the four observable things in order — create the file, write the note into it, tell the tree
that folder changed, open it in the session — and reaches its question through a chooser it takes
as a port.

That question has **two hands**, the same two `ui/prompt.ts` has and switched by the same one rule
(`ui/under_test.ts`): a reader is asked by the system's own sheet (`save`, the one native surface
that means "where, and what is it called" in one breath, opened on the folder they are working in
with the id as the name to type over), and a probe is asked on a card in the page — the workspace's
own folders, indented like the tree, with the one the reader is in already chosen. A native sheet
cannot be driven by a probe, so only the card is probed (`test/probes/new-markdown.js`) and the
rule the sheet's answer is read by is checked in Node (`test/checks/check-workspace-folders.mjs`).
The tree's own *New file* runs the same command with the row's folder as its payload, so a note
made in the tree and one made from the menu cannot drift apart; it no longer starts an inline
rename, because the file is already named by its id and the *title* is what the reader is asked to
type. Two things bite here: the file plugin is scoped to `$HOME`
(`src-tauri/capabilities/default.json`), so a workspace outside it can be listed, moved and
deleted but not read or written by the webview; and making a note from a document that is not in
the stack asks the session's question first, the same one opening a file asks.

A **version** of a workspace is kept with git, and only ever because the reader asked for one:
*File → Save a Version* is the command `version:save` (`src/ui/versioning/save_version.ts`), and it
is the only action in the app that runs git — no timer, no quit hook, no on-save commit. The facts
are Rust (`src-tauri/src/versioning.rs`: which git may be run — never by trusting `PATH`, and
`/usr/bin/git` only when `xcode-select -p` answers; whether the folder is in a repository of its
own or one above it; whether a cloud drive could reach it; and where the app would keep a git
directory outside the folder), the decision is pure (`services/versioning.ts: versioningPlan`, over
`consentFrom` and the config's `versioning`/`versioning_workspace` — an answer given for another
folder is *no answer*), and the doing asks the plan's own question first (`versioning_dialog.ts`,
the two hands `ui/prompt.ts` has), refuses a note with no file in one sentence, captures the
editor's text and writes it atomically (`files.rs: write_atomically` — temp file plus rename, the
shape the session's own write uses too, so a cloud or git client reading mid-save never sees half a
note), and commits **only** the file it wrote: `git add -- <path>` then `git commit -m <message> --
<path>`. A repository the reader already has is used as it stands and never nested into; a folder a
cloud drive could reach — or one we cannot read enough to be sure about, which is treated the same
way — gets `git init --separate-git-dir=<app data>/repos/<name>`, so the drive never sees a `.git`
at all while the reader's own git keeps working through the one-line pointer file. Every git call
goes through one helper, and what the app may never ask git to do is a list held by a probe that
points it at a git which only records its arguments (`test/probes/versioning-fake-git.js`; a probe
cannot set an executable bit, so the recorder is committed next to it). The git may also be *named*
for a test: `YI_GIT` for a process started with one, and `versioning_use_git` — a debug-only command
— for a probe, which cannot change the environment of the app it is driving; the harness puts that
seam back before every probe, the way it puts the language back. Three things bite: the webview's
file plugin refuses a hidden path (measured: `forbidden path` for `.git/HEAD` *and* for `exists`),
so a repository is observed through the app's own commands and never read directly; the app's own
listing hides dot-named entries, which is what makes a clone safe to open; and a commit's *message*
is the note's own name and the minute it was asked for, because that message — with the reader's
own comment under it — is what the app's own list of versions shows.

**The versions of the note on screen** are shown, not just kept. The status bar's left group holds
a button (`ui/versioning/version_status.ts`) that is there exactly when the reader agreed to
versions in this workspace — `versionsVisible`, from the config, so a workspace they said no to
never runs git — and hidden otherwise, showing the newest version's stamp
(`services/versioning.ts: versionStamp`). Pressing it opens the panel **above** it — the status bar
is the bottom strip of the window, so a panel hanging below it is off-screen, which is a parameter
of the kind (`panel.ts: side`) rather than a mode —
and the button's own word is the *state*: the newest version's stamp when what is on screen is that
version, and `version.unversioned` ("Not in a version") when it is not (`versionedNow`: the newest
version's text, read once with the history, against what the editor holds — so a keystroke changes
it), or "No versions yet" when there is nothing to compare with at all.
(`versions_panel.ts`): one row per version, newest first — the stamp, the message, and the comment
under it — and *nothing in it acts*, because restoring a version is out of this slice's scope
(`docs/roadmap.md`). Both draw from `services/versions.ts`, the living list: it reads through
`src/api/versioning.ts` when the document's *path* changes (never on a keystroke), when the
workspace or the answer changes, and when a panel opens or a version is saved; it can say
`no-file`, `no-repository`, `ready` or `unreadable`, and the panel turns those into the four
sentences a reader gets instead of a list. The read is the git vocabulary's **fourth call and its
first read** — `git log --follow --max-count=… --format=%H%x00%at%x00%s%x00%b%x1e -- <path>`,
through the same `run_git` — and the never-list is unchanged. Saving a version asks what to call it
first (`version_comment_dialog.ts`, a card with **no native twin**: no system surface answers with
a line of text), and the subject stays exactly what it was while the comment becomes the commit's
body.

**A version can be seen and gone back to.** A press on a row of the versions panel opens the
sheet (`ui/versioning/version_diff_view.ts`): the whole note as one row per line, drawn from
`services/text_diff.ts` (the equal ends trimmed only to compute the change; the middle walked for
its longest common subsequence, removals before additions; past a cap the change is *named* — the
rule answers a count and the catalogue says the sentence), opening at the first change. The sheet is
a **mode**, not a floating surface: it covers the editor's area and keeps the keyboard while it is
open, because `FloatingSurface`'s rule — never take the focus — is right for a question asked
mid-gesture and wrong for this, where a keystroke reaching a document nobody can see is worse than a
modal; closing it hands the keyboard back (`markdown_editor.ts: focusText`, and the scroller carries
`tabindex="-1"` because WebKit only makes a scroll container focusable when it has something to
scroll). Its one action is *Restore This Version*: **one question with a cancel that changes
nothing** (*restore this version?*, through the app's own `ui/prompt.ts`, so Escape is the cautious
answer, naming the version and saying nothing is committed), then
`documentSession.openVersion(path, content)` — the file is written with the app's atomic write and
the document adopts that text, at its top. Three facts about it: a document with a file is keyed by
its **path**, so a restore replaces *that* document's text rather than opening another; **nothing is
kept for the reader** (they answered restore, so no copy of what was on screen is pushed into the
stack on their behalf); and **no git write happens at all** — the reader's staged
work stays staged, `git status` shows the modification, and a version is still only made when they
ask (held by the recorder: a whole restore is one `show` and none of the write verbs).

The settings file itself is the reader's, and the card hands it to them as such: *Reveal in folder*
always, and *Replace with the shipped file* only when their copy is **not** the one this build ships
(`ExportKindInfo::config_is_shipped` — the bytes, compared) — behind the app's own question, which says
what is replaced, because a copy that differs may be an edit or an older build's file and the two cannot
be told apart from here. Escape leaves the file exactly as it was.

**A note goes out through pandoc**, one kind at a time. The File menu's *Export* is a **submenu**,
one item per kind (`src-tauri/src/menu.rs`, built from `src-tauri/src/export.rs: KINDS`), and the
item's own kind travels with the event it emits: *which* kind is being exported is settled in the
menu, before any card is drawn. That event runs the command `file:export`
(`src/ui/export/export_flow.ts`), and what it opens is a card (`src/ui/export/export_dialog.ts`)
**about that one kind**: the target the file is written to, and the
**conversion settings** file the reader may edit — a button reveals it in its folder
(not "opened in your editor": which editor a file belongs to is the reader's own arrangement). The
kinds are Rust's (`KINDS`) and there are seven of them so far, **docx**,
**odt**, **latex**, **html**, **epub**, **pdf** and **markdown**: each is a name, the extension its
output is written under, whether pandoc writes it at all, and the bytes of a pandoc *defaults file* —
`src-tauri/assets/export/export.<kind>.yaml`, written into
`<app data>/export/` the first time that kind is used and **never overwritten again**, which is what
makes a reader's edit theirs (the docx one is Zettlr's own defaults file, less one key: their
`default-image-extension: .jpg` is applied by pandoc to a URL whose path has no extension, turning a
working web image into a 404 — measured — so it is left out and the header says so; the epub one is
Yi's own, written in that shape). **One kind is not pandoc's at all**: `markdown` (`needs_pandoc:
false`) *is* the pre-process — the app writes the text it prepared (`export_own_text`) — so it ships
no defaults file, and the card shows no settings row for it and refuses to make one. Every other kind
is pandoc's, so a machine without pandoc is told so and offered no run button; **pdf** is the one that
needs more than pandoc — a TeX engine, named in its file, and a **font for a note that is not written
in Latin**, which is a fact of the *file* and not of the app: `export.pdf.yaml` ships with
`CJKmainfont: "Songti SC"` under `variables:`, measured to draw Han and kana with a `ToUnicode` map a
reader can search and copy by (`export-pdf-font.js` reads such a page back; without a font named, XeTeX
draws the space the words took and none of the words, and the app shows the reader its warning for each
character). What the two variables reach is **measured, not assumed**: `CJKmainfont` is what xeCJK
routes CJK punctuation, kana, Han **and Hangul** to (with both variables named, a Korean note's Hangul
was set with the CJK font and lost with it), and `mainfont` is what every other script is set with —
and what cannot answer for Hangul while a CJK font is named. So the default covers Han and kana and
nothing else, the file's own header carries the recipe for the rest (Hangul: a CJK font that has it;
Greek/Cyrillic/Hebrew/Arabic/Indic/Thai/Armenian/Georgian: `mainfont`; both at once: both lines naming
one wide font, measured), and the reader's file is theirs — the app never rewrites it. The **latex** kind names the same font in `export.latex.yaml`
and for the same measured reason: without it the `.tex` carries no font setup at all, and the reader
who compiles it gets XeTeX's *"Missing character"* for every CJK character in the document.
What the app *does* do about any of this is **say it before the reader exports**: a kind whose output
is typeset with those fonts (`needs_a_font`: the pdf and the latex) has its card drawn with the
characters no font in its settings can draw — and it says so in the app's own words, with the settings
file and its *Reveal in folder* button already beside it — and it *names the font to add*, in both
lines, because that is what the measurements say works: the widest font the machine is known to have
(`export_named_fonts` → `suggested_font`, a name to type and not a choice the app makes). The two halves
come from the two places that
hold them: **the file**, which the Rust side reads (`export_named_fonts`, `named_fonts` — the reader's
copy, or the shipped bytes when they have not exported that kind yet, comments counting for nothing
because a shipped header talks about fonts at length), and **the note**, which the window walks out of
the *parse* (`ui/export/font_hint.ts`), because a formula is not a paragraph: `$\le$` draws with the
maths font where a bare `≤` does not. What the TeX suite's own font holds is written down character by
character there, not by blocks, because the blocks are irregular — measured: `ə` draws and `ʃ ɐ ʰ` do
not, `← ↑ → ↓` draw and `↔` does not, `√ ∞ ± × ÷` draw and `≤ ≥ ≠ ≈ ∑ ∏` do not, `♪` draws and
`♭ ✓ ☺ ★ ☆` do not, `Δ Ω` draw and `α β γ` do not.
The window is told the list (`src/api/export.ts: exportKinds`) and knows no
kind by name except the one that labels its menu item, so a new kind is a row and an asset and
nothing else. A row also says whether
its kind **carries its own name** (a book's title page and its
`<dc:title>`, a page's `<title>`) and whether it **must declare a language**: the window hands over
the note's own name and language whatever the kind is, and the row decides whether they are used —
measured, a docx whose body already opens with the note's own heading says that name *twice* if it is
given one, and a `lang` in a LaTeX run picks a hyphenation package by language. And every kind shares
one **pre-process** (`src/ui/export/preprocess.ts`), which is the app's own reading
of the note rather than pandoc's guesses: each wikilink written as the words it renders as, and each
image's destination written as the file the app resolves it to (absolute and encoded, through
`workspace_folders.ts: destinationPaths` — the very rule the renderer finds the picture with, so
what the docx embeds is what the page showed — and for a picture *on the web*, fetched by the app,
through the system's curl, because a pandoc built without HTTP support cannot fetch it at all; the
files land in `<data>/export/tmp/remote/` and go at the end of the run) — and a third, for the kind
pandoc is not the one converting for: each citation written as the words it reads as, with the works
it names listed under them (`services/bibliography.ts: format`, `referenceList`), because that kind
has no citeproc behind it. Those rules walk the *parse*,
so a `[[…]]` in a fence or in code, and an image inside one, stay exactly as written. The app's
scratch note (written under its data folder, because pandoc reads files) is deleted whether pandoc
succeeded or not — and pandoc's own warnings are **kept** (`ExportOutcome.warnings`) and shown to the
reader as a message, so a document missing a piece says why instead of leaving a hole. What
the app may ask pandoc is one list in one place — `--defaults`, `--output`, `--resource-path`, the
**library and CSL style its own citations were formatted from** (`--bibliography`; `--csl`, from
citation-js's bundled styles, which is why `[@key]` resolves and the reference list is appended in
the style the page showed), and the note — held by `test/probes/export-pandoc-arguments.js` against
a pandoc that only records
(`test/probes/fake-pandoc.sh`); `export_use_pandoc` is the seam that points the app at it, put back
by the harness like the git one.

The editor is a *page*: the prose root is 210 mm of A4 with a 25 mm margin, centred on the
scroller, which is the desk (`styles.css: .markdown-page`, `.markdown-scroller`; the box is
named in `virtual_block_renderer.ts`, and scaled to fit the pane by `markdown_editor.ts:
fitPage` — the sheet, its margin and its type take one `--page-scale`, capped at 1, so a
narrow window gets a smaller page rather than a sideways scroll). It is one of *two*
layouts: `data-layout="auto"` on the scroller is the column at the pane's width, the editor
as it was before the page, switched by the status bar's layout button (`view:togglePage`) and
remembered in the app config (`editor_layout`). Four consequences worth knowing before you
touch it:
the root's `max-width` has to be `none` or the typography plugin caps the sheet at `65ch`,
the page's type size is `calc(1rem * var(--page-scale))` on `.prose.markdown-page` (the
`.prose` in that selector is what beats the plugin's own `font-size: 1rem`), the whole
vertical rhythm is written in the same scale (`.prose`'s `--md-page-scale`, which
`block_sizes.ts` also reads: the estimator of an unmeasured block's height is the page's own
line height and paragraph skip, and mixing a scaled page with an unscaled estimate moves the
document's total height under the reader), and a document opens at the top of its own page
(`setContent`) because a fixed sheet is taller than the pane, so nothing clamps a scroll left
over from the note before it. A probe that measures one layout should ask for it
(`t.useLayout('page')`) rather than inherit whichever one the reader left behind.

One rule keeps the page still while the window turns over: **a caret that did not move must not
move the page.** The renderer drops the blocks outside the window and mounts them again as the
reader scrolls back, and a caret whose block was dropped is placed again once it is there — but
that is a *putting back*, not a move, so it must not scroll (`caret.ts: showCaret`/`scheduleCaret`
take a `scroll` flag; `markdown_editor.ts: reanchorCaret` and `restoreView` pass false). Measured
the other way round, one 24px step up from the end of the demo document moved the page **1097px**
to a caret the reader had left in the first paragraph (`test/probes/scroll-caret-anchor.js` holds
it). It is the same rule a click that opens a source already follows: a rebuild under the reader
is not a request to move the page.

**A document opened with nothing remembered is opened without a caret.** The view the session
hands over is the truth about where the reader was (`services/session_rules.ts`: `caret: null` when
nothing is remembered, and a remembered one comes back exactly where it was); a caret the app
invents is one nobody put anywhere, and it *decides what the page shows*, because a node the caret
is in renders its own markdown — which is how a note that opens on a picture used to open on that
picture's markdown, with the picture hidden. So a document with no remembered view is drawn as it
is written, the reader's first click or keystroke places a caret (the keystroke at the text's own
start: `editing/text_commands.ts: textSelection`), and `test/probes/document-opens-without-a-caret.js`
holds both halves.

An **image** is written by the button beside the link button, one command `edit:insertImage`, and
the clipboard decides what that means (`ui/image/image_flow.ts`): a destination it is offering — a
web URL, a `file://` URL, a path to an image — is written as `![alt](destination)` where the caret
is, exactly as a link is; an image on the clipboard opens the app's card
(`ui/image/image_dialog.ts`, which has **no native twin** because a system surface cannot draw the
picture) with the pixels drawn in it and a name to type over; a clipboard with neither leaves an
empty `![]()` for the author. A saved image is drawn on a canvas and written through the file
plugin — into the folder the settings' **General** tab names, or beside the note when it names none
— and the text carries a path *relative* to the folder it is read from
(`services/workspace_folders.ts: destinationForFile`). Reading it back is
`ui/markdown/image_sources.ts`: a relative destination is resolved against the note's folder first
and the image folder after it, and a *file* becomes a URL the page may load through Tauri's asset
protocol (`convertFileSrc`, enabled in `tauri.conf.json` with the `$HOME/**` scope the file plugin
already has — so a workspace outside the home directory paints no local images, the same limitation
the roadmap's *Open* item records). The pixels come from the clipboard plugin
(`clipboard-manager:allow-read-image`), never from `navigator.clipboard` — the same reason the link
button's read is the app's own.

The app's **words** live in one place: `locales/<language>.json`, flat dotted keys with `{name}`
parameters, one file per language (`en`, `ja`, `zh-Hans`, `zh-Hant`, `de`, `fr`, `es`, `pt`; English
is the language every key is written in and every fallback lands on). Two readers read those files
and nothing else reads a string: `src/services/i18n.ts` imports them into the bundle — no IPC, no
flash of untranslated chrome — for every window, and `src-tauri/src/i18n.rs` brings the same files
into the binary with `include_str!` for the **menu**, which is built before any page exists and has
to survive one that never loads (that is why the menu is Rust's, and stays Rust's). Tauri's
predefined items are English unless they are given text, so every label is passed from the
catalogue through the `*_with_text` forms; ids and accelerators are *not* translated, because an id
is what `commands/menu.ts` maps to a command. The language is a config field whose empty default
means *the reader's system locale* (`src/services/language.ts`, `i18n::language_for`), offered by
its own name in the General tab; changing it rebuilds the menu in Rust and **reloads** the windows,
because a label is read where it is drawn and the session brings the document, the caret and the
view back. `check-locales.mjs` holds the two readers to one set of keys, and the probe harness puts
the app in English before a probe — a probe asserts behaviour, and its expectations are English —
then puts the reader's choice back.

Typing is not a command, so **what a bracket writes and the two lists that open as the author
types** live in the editor's key path: `syntax/brackets.ts` says what a `[` (or `(`, `{`, a quote)
writes — its pair with the caret inside, and only where prose is being written: nothing in a fenced
code block, a display formula or an inline code span, nothing around a selection, and Backspace on
an empty pair takes both characters back — while `syntax/completions.ts` says what the caret is
*inside* (an `@` the citation plugin itself would make a citation of, or `[[`) and which entries
match what has been typed. `editing/completions.ts` is the list in hand and `completion_card.ts`
draws it beside the caret, clamped to the window the way the footnote preview is; the editor asks
it *before* its own text path, so while a list is open the arrows, Enter, Tab and Escape are the
list's, every other key types and redraws it, and a click in the document closes it — a click is
not typing. Enter writes the citation's key, and a document's **id** — or its **file name** when it
has none, *not* the title the row shows beside it — so what is written is what the resolver reads
back (`documentManager.resolve` falls back by name first). The entries come from
`bibliographyManager.entries()` and `documentManager.documents()` — a document's `target` is the
id or the file name, which is exactly what `resolve` takes. Three things bite. The second `[` must
write its own pair *in front of* the `]` the first one's pair left after the caret — that is what
makes `[[` two pairs, `[[]]`, with the caret inside them — and writing only the `[` leaves the
wikilink one bracket short, which is exactly what Enter then writes into (measured: `[[<id>]`,
against `test/probes/brackets.js`).
A rendered wikilink is followed by the *same* resolver: ⌘-click (Ctrl-click) asks for the document
its target names and it opens through the session, exactly as a click on a row of the tree opens
one — a plain click still opens the link's own source, and a target no document answers to is said
so rather than opened as source. The editor asks through a port with no service in it
(`ui/markdown/wikilink_open.ts`; the session owns the editor, so the shell answers —
`ui/editor_panel.ts`), and `test/probes/wikilink-cmd-click.js` holds both gestures.
An ordinary link takes the same gesture for the *same reason* when its destination is a **path**: a path is not something the webview may be handed, so ⌘-click asks the app for the note it names — the note's own folder first and the workspace root next, with a `%20` spelling resolved (`syntax/link_edits.ts: isFilePath`, `services/workspace_folders.ts`) — and the plain click still opens the link's own source. A `#fragment` and an empty href name no file, so they keep the plain click; a URL keeps the browser's (`test/probes/link-opens-a-note.js`).
And the closing click has to be *captured*: a click that lands on a markdown node is answered by the
node itself and stops there, so a listener that waits for it to bubble never sees it. And the card
is placed from the caret's *range*, never from the span that draws the caret: `scheduleCaret` draws
that span a frame later, so the redraw a keystroke triggers would measure where the caret has just
left, and the popover would open one character off and slide across on the first ArrowDown. A row
of the card is also the card's own width — daisyUI's `menu` sizes an item to what it holds, so a
long title has to be clamped (`min-w-0` and a truncating title) or the row is wider than the card
it is drawn in.

A **rendered citation is also a place to read**, not only a thing to click: resting the pointer on
it shows the reference entries the works it names are listed under, in the CSL style and
bibliography file the settings name — `services/bibliography.ts: reference` over the pure rule in
`services/citation_reference.ts` (the keys the citation names, each once, only the ones the library
holds), drawn by `ui/markdown/citation_preview.ts` as one of the floating family's `BesideCard`s.
It shows the *reference*, not the in-text form the sentence already carries, and a key the library
does not hold shows no card at all; the citation's own source travels on the rendering
(`data-citation`, written by `nodes/citation.ts`) because the formatted span no longer holds the
keys, so a citation showing its own source is one no card can appear on
(`test/probes/citation-preview.js`).

**A click that ends a drag is the drag's, not the caret's.** The browser fires that click at the
nearest common ancestor of the press and the release, so a selection that crosses two blocks ends
it on the page itself, which owns no node — the one spot the editor answers by placing a caret, and
placing it drops the selection the drag just made. A selection inside one paragraph ends on its
node and was never affected, which is why only the cross-block drag was broken. `editing/pointer.ts`
remembers where the pointer went down and refuses the caret for a gesture that both travelled past
a few pixels and left a selection; a margin click the pointer merely jittered through still places
one (`test/probes/select-across-blocks.js`).

**A delimiter line typed on its own opens the block it names**, and **a bare list marker is the
character rather than an item**. `editing/fence_open.ts` writes both delimiter lines at once — with
the blank lines markdown needs around them — and puts the caret on the blank line between them,
where the author is about to write: ` ``` ` asks for its language as soon as the fence exists
(`editing/language_picker.ts`), `$$` needs no such thing, and `---` is frontmatter *only* on the
note's very first line, where it would otherwise be a thematic break. `syntax/bare_markers.ts` is
the parse repair behind the other half: markdown reads a lone `-` as an empty item and, under a
paragraph line, as a setext underline, so the repair makes it text — the delimiter space is what
starts an item (`- `) — and the line above is never swallowed. Each rule has its check
(`check-fence-open.mjs`, `check-bare-markers.mjs`) and its probe (`fence-open-typing.js`,
`bare-marker-typing.js`).

**A path a reader writes by hand has spaces in it, and markdown refuses those**: a link destination
may not contain a space unless it is wrapped in `<…>` (which is what the app *writes*,
`syntax/link_edits.ts`), so `![shot](my shot.png)` — the way another editor writes a path, and how a
reading library of imported notes is written — is a paragraph of that literal text, and the picture
it names is never asked for. `syntax/spaced_destinations.ts` is the repair: such a run is read as the image
wherever it stands, since the `)` ends the path, and the words around it stay text; an escaped
`\![` and code are left alone, because those characters are meant literally. Its check is
`check-spaced-destinations.mjs` and its probe is `image-path-with-spaces.js`, which holds the file beside
the note and the one in the settings' image folder, through the asset protocol to the pixels. The
same path *copied* may spell the space as `%20`, and `services/workspace_folders.ts` tries the
spelling that resolves to the file **before** the one as written — a `%2520` URL's 404 is what the
webview reports as a *load*, so the written spelling would end the search where it stands.

**A fenced block has two shapes**, decided by the caret, and one component draws both
(`nodes/fence_text.ts`): its *body* with the delimiters hidden — a display formula's KaTeX comes
from its parse instead (`nodes/math.ts`) — while the caret is elsewhere, and its *own text*,
delimiters and all, while the caret is inside it. That is what lets the reader leave a block by its
own lines: the closing ` ``` ` is a line like any other, `Down` and `End` reach it, and `Enter` at
its end puts a blank line under the block with the caret on it — for all three kinds
(`test/probes/fence-exit.js`). `document/blocks.ts: hasSourceMode` names the three;
which is also why such a block may not be folded into a paragraph: `document/blocks.ts` ends a
paragraph run before a fence or a `$$` line, because both may interrupt a paragraph and both *must*
be blocks for their own text to have a shape to be shown in (a `$$` region with no blank line
around it was exactly that — a formula whose click entered the paragraph's text and showed nothing;
`display-math-source.js` holds the gesture both ways);
`editing/context.ts` shows a fenced block's own range while the caret is in it *and no selection is
live* — a selection is the reader acting on text they can see, and the shape change would take the
text it covers (a new note opens with its title selected, and that title is inside a frontmatter
block). The caret observer holds that ask back too while a selection is live, for the block that is
*already* showing its own text: the click a drag inside a fenced block ends with places the caret in
that same block, and the rebuild it would ask for replaces the element the selected text is drawn on
(`markdown_editor.ts: followCaret`, `test/probes/select-in-code-block.js`). A character typed at the
body's own end still belongs to the body, all three alike
(`syntax/fence_edits.ts`), `Tab` indents a line of any of the three (`editing/code.ts`), and the two
shapes and their labels are pinned by `test/probes/fence-source-mode.js`.
A caret position that sits *right after a newline* — the body's first line, the body's end — is
drawn on the line below it, never a space past the line the newline closed: a caret anchored at the
end of a text node whose last character is a newline belongs to the text that follows it
(`caret/dom.ts: afterNewline`, read by the caret's own drawing in `caret/caret.ts: onTheLineItNames`
and by the position a raw offset resolves to in `caret/dom_position.ts`). Stepping *left* onto such
a line lands one character in from the node's end (`caret/navigation.ts: endOfPreviousText`), since
the end itself is the line the caret is already on. `fence-source-caret.js` holds both through the
editor.

**An empty line is a box, not a character.** A blank paragraph, an empty list item, an empty table
cell and an empty fenced body all hold an *empty* text node: the space they used to hold was a
character the reader could select and copy, and the document never had it. What gives each of them a
line is the block's own box — a fence body's `code` is a block one line tall (`styles.css`) — and
what gives the caret a place is the line the geometry falls back to
(`caret/geometry.ts: lineBoxAround`, read by the caret's own drawing, by a click's nearest line, and
by the choice between a node's two ends). The caret's *bar* is the height of the type rather than of
the line (`caret/geometry.ts: caretFontHeight`, the font's own ascent and descent, which is what a
range over a character measures as), so a blank line's caret looks like a caret in text. A
composition written at such a node goes *beside* it and must not join it away: `normalize()` drops
an empty text node, and a caret anchored in one becomes an element position the offsets mapping
cannot read (`editing/composition_view.ts`). `test/probes/placeholder-boxes.js` holds all four.
An empty *item* takes its line from a *generated* mark inside its placeholder (`styles.css`,
`.markdown-list-placeholder::before`), not from a character: WebKit paints a replaced block without
the marker a list draws outside its item's content box unless the item has a line of its own, so the
bullet the reader has just made is otherwise missing from the screen until the next repaint (a
bridge screenshot re-renders the page and cannot show it; measure with `screencapture`).

Typing is not only keystrokes: an input method, dictation and the emoji panel go through
`editing/composition_input.ts` — a textarea that holds the keyboard wherever the caret is, so the
system has something to compose into and puts its candidate window at the caret — and what it
commits is inserted by `text_commands.ts: insertCommitted` as one step of its own. Nothing of a
composition is drawn in the seam: it is invisible because its *ink and background* are transparent,
never with `opacity: 0` — macOS composes only into a field it can see, and `styles.css` records what
the system's own keystrokes measured (transparent, a real box, no declared `caret-color`), along with
a probe that holds that shape. What the *system* paints in the field besides its ink is not
transparent — the selection over a marked word is a blue box — and WebKit does not honour
`::selection` for a textarea's own selection, so the field is drawn inside a box the size of the
editor and *that* is what is clipped (`styles.css: .markdown-composition-clip`). The other blue box
was the field's own focus ring: a textarea keeps the browser's default outline, which the *page*
layout hid behind the sheet's opaque paper and the full-width layout showed at the caret — the
field writes `outline: none` now, and `input-method-seam-box.js` holds it. What the method has *marked* is drawn instead where the reader is
writing it — `editing/composition_view.ts`, the pinyin, the kana, the syllable, in the page's own
type at the caret and underlined, *in* the line so the words after the caret move along. That span
is not the document's text: it is marked `data-composing`, which is how the offsets mapping steps
over it (`caret/offsets.ts`), the block it lands in is measured again because a longer word can wrap
the line, and it is taken out — the text node joined again — before the word commits. A key that
edits the marked word is the method's, not the editor's: Backspace is left to it while a word is
marked and for the moment after one is let go, because the key that emptied the word arrives with
the composition already over (`composition_input.ts: markedText`;
`test/probes/input-method-backspace.js`). And the keyboard comes back to the seam after every change that
moves the caret — an edit, a click, and an *undo*, which is a change that never goes through `applyEdit`
and so had its hand-back named where it happens (`markdown_editor.ts: applyHistory`). Three facts
follow from the seam: a *document* selection is one inside
the prose root (`editing/context.ts: isDocumentRange`), because a focused textarea makes the browser
report one of its own; where the keyboard goes is one hook (`EditorContext.focusText`), because a
command that focuses the page and a command that selects it are then asking for the same thing; and
a synthetic click cannot warm an input context, so a probe drives the seam with dispatched
composition events rather than pretending to type.

A key the input method routes is the method's, whether a composition is behind it or not: a
`keydown` marked `keyCode` 229 that carries a character belongs to the method, and the seam writes
that character — typing it as well writes it twice (measured with Caps Lock on, where the method
composes nothing and passes every letter through; `test/probes/input-method-passthrough.js`). A 229
key that carries no character — `Enter`, an arrow, `Backspace` — is still the editor's.

`docs/architecture.md` is the same map with the data flow and a "where does this
change go?" table.

Two recipes cover the changes an editor like this gets most: `docs/adding-a-node.md`
for a markdown construct, and `docs/adding-a-command.md` for a name the author can
ask for. `docs/writing-comments.md` is the third page a contributor needs — the
module header every file opens with, and the voice the rest of the comments use.
`docs/roadmap.md` is what is planned next and what is closed, with the numbers each
decision was taken on.

## The rules

1. The document text is the only source of truth; edits are raw-text range
   replacements.
2. A block's rendering is a pure function of its own source, never of where it sits.
3. A caret's document offset is the truth; a rendered position is derived from it
   and re-derived after any rebuild.
4. Source mode is decided from the document, never by swapping an element behind the
   caret.
5. One fact about markdown syntax has one home.
6. A syntax module never imports the DOM.

## The four offsets (learn these first)

`document` (index into the raw markdown) → `block-relative` (minus
`block.charStart`) → `rendered` (index into an element's text) → `DOM range` (a live
`Range`, which the browser *relocates* rather than drops when its node is replaced).
`caret/offsets.ts: documentOffsetAt` and `caret/dom_position.ts: domPositionAtOffset`
are the two directions; `editing/context.ts: applyEdit` and `placeCaret` are where
they are used. The table in `docs/architecture.md` says what each mapping is
re-derived from, and when. A sweep of the DOM captures the caret *before* it removes
anything (`virtual_block_renderer.ts: syncWindow`'s snapshot, and `refresh`), because the
range a removal relocates names no offset for a snapshot taken after it — a letter typed
at one replaces the document (`test/probes/rebuild-keeps-the-caret.js`).

## Commands you will need

```bash
npm install
npm run tauri dev                       # the app (Tauri MCP bridge on 9223)
npx tsc --noEmit                        # types (strict, noUnusedLocals)
npm run check                           # pure checks, no browser
npm run probe -- test/probes/<name>.js  # one DOM probe, app must be running
npm run probe:all                       # probes that need no fixture workspace
npm run fixtures                        # refresh the fixture workspace
```

Setting those up — the MCP server and CLI that drive the app, and the skills this
project uses (`tauri-mcp-cli`, the official `daisyui` one) — is in `README.md`
under *AI agents*.

**Restart the app on a new branch.** The dev app holds the modules it loaded, and a branch
change swaps the files under it: what answers a probe is then some mixture of the two branches,
and a measurement against that says nothing. Restart `npm run tauri dev` on the new branch
before measuring anything.

## If you are an AI agent

**Work on a branch, never on `main`.** Every change is made on a branch of its own —
`codex/<slug>` unless told otherwise — and lands on `main` by a merge, so the whole of a feature
or a fix is reviewable as one thing and `main` only ever moves by a merge.

**Merge only when asked to.** Committing is part of the work — the change is proved and committed
on its branch — but landing it on `main` waits for the maintainer to ask, in that turn. What is
reported before that merge is what changed, which test fails without it and what was measured.

Before claiming a change works:

1. `npx tsc --noEmit` → silent.
2. `npm run check` → every check passes (`n/n checks passed`, where `n` grows as checks are
   added — one per pure rule).
3. Run the probes that touch what you changed; if a probe fails, read
   `test/README.md` for how probes report. A probe that "timed out" is usually its own
   length: the bridge gives a script **5 s**, and the harness recovers anything longer
   from the stash (`P21` measured it, with the app's own cost flat over a whole suite —
   a load of the 314 KB fixture note stayed at ~330 ms, and a bridge call at ~3 ms).
4. If you changed behaviour, add or update a test that fails without your change and
   say which one proves it. Pure rules go in `test/checks/`; anything about DOM,
   caret or rendering goes in `test/probes/`.
5. Keep the house rules above; if a rule has to give, say so in the commit message.

**The fixture is a test's, never the reader's.** The app you develop against is the maintainer's
own: its config names *their* workspace, bibliography and layout, and its session holds the
documents they had open. So a test run that points the app at `test/fixtures/workspace` — or at a
folder a probe made — **backs both up before it starts and puts both back when it ends**, and no
test ever runs *in* the reader's own folder. `--with-workspace` does the config half for you (the
harness snapshots `get_config` and writes it back; `test/tauri-probe.mjs`), and the harness does the
session half too, for **every** run: it reads `load_session` up front and writes it back through
`save_session` once the probe has reported, waiting out the app's own 800 ms session debounce first —
because a probe loads documents into the maintainer's app, and one that types into them leaves its
copy in the session the reader's next start restores. The app is then left holding **no** documents
at all (`emptyTheAppSession`: the empty session is written, the app reads it, and the reader's own
goes back into the file afterwards) — because the live session is the one the *next probe* drives,
and a live session that holds a document turns the harness's own starting document into an *already
open* question: measured, a prompt card was up at the start of every run and `typed-text` failed 27
of its checks. The session the run found is written to a note
(`<tmpdir>/yi-probe-session.json`, the config's own arrangement) so a run that dies mid-probe has its
documents put back rather than left as the reader's. A fixture is
disposable *as a fixture* — `npm run fixtures` refreshes it — while the reader's own notes are not,
and a probe that writes belongs in a folder of its own under `$HOME`.

Do not invent files or functions: every path in this document exists. If you need a
name that is not here, search with `rg` before writing.
