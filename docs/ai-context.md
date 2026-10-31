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
| Syntax (pure, no DOM) | `src/ui/markdown/document/blocks.ts` and `src/ui/markdown/syntax/**` | split text, and the pure rules of editing, heading and code-fence attributes, Pandoc identifiers, captions, listings, and document-owned reference vocabulary |
| Document | `document/state.ts`, `document/blocks.ts` (the text, its blocks, the parse cache) and `document/history.ts` (the edit log) | the text and everything derived from it |
| Render | `virtual_block_renderer.ts` (window orchestration), `renderer_dom.ts` (root/block DOM), `renderer_measurements.ts` (height policy), `renderer_geometry.ts` (scroll/spacers), `renderer_block_cache.ts` (mounted/spare elements), `block_sizes.ts` (pixel arithmetic), `viewport_window.ts` (which blocks to mount), `create_block.ts`, `registry.ts`, `create_node.ts`, `nodes/*`, `source_mode.ts`, `format*.ts`, with `editor_render_context.ts` adapting services and `editor_view_state.ts` owning remembered caret/view state | DOM for the window of blocks; `source_mode.ts` is how something whose markdown can stand in for its rendering — a link, a formula, an inline run (bold, italic, strikethrough, code), and every fenced block — is built as that source while the caret is inside it |
| Caret and offsets | `caret/*` — `offsets.ts` reads a rendered position back into the document, `dom_position.ts` places one from it | the logical caret, and mapping offsets |
| Commands | `src/commands/*` (contracts, registry, dispatcher, authority, triggers), `editing/*`, `markdown_editor.ts`, `click_routing.ts` | keys, menu, toolbar and table-menu actions — one typed command, one name, one dispatch path |
| Events | `src/events/local_bus.ts` and `src/services/event_manager.ts` over the payload/boundary map in `src/services/app_events.ts` | typed facts: local delivery is synchronous; only declared inbound events use Tauri |
| Shell | `src/ui/*` (the editor panel is `src/ui/editor_panel.ts`, the workspace tree is `src/ui/workspace/*`), `src/services/*`, `src/api/*` (one file per backend seam — the app's own commands through `invoke`, a granted plugin through its `@tauri-apps/plugin-*` package) | the window, workspace, settings, bibliography |

The workspace tree is a *view of the folder*: its menu, its drags and its renames all go
through the app's own file commands (`src-tauri/src/files/`, wrapped in `src/api/files.ts`)
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

**And the webview may work where the app is working.** The file plugin and the asset protocol that
serves a rendered picture start scoped to `$HOME` (`capabilities/default.json`, `tauri.conf.json`), which
is a scope about the app's own files rather than the reader's: outside it a folder could be listed and
rearranged by the app's own commands — they carry no scope — while a note in it could not be read by the
page and a picture inserted into it could not be written (measured: *"forbidden path: … maybe it is not
allowed on the scope for `allow-read-text-file`"*). So `src-tauri/src/access.rs` grants the folders the
app is *working in* at run time: the config's own — the workspace, the pictures folder, the library's —
where the config is read (`settings.rs`), and a document's own before the session reads it
(`api/files.ts: grantFolder`, called from `session.ts: openPath` and from a restore), which is what a
workspace, or a note, outside `$HOME` needs. Nothing else is granted, and `workspace-outside-home.js`
holds both halves.

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

A first start that restores no document opens the **tutorial** after the workspace question: eight
markdown documents under `src/ui/tutorial/` (one per catalogue language, chosen by
`tutorial_rules.ts`), a pathless document with `readOnly: true` and the stable id `yi-tutorial`.
The editor refuses writing commands, typing, paste and replacement; navigation, copy, find and export
stay. `session_rules.ts: openDecision` treats a read-only current document as replaceable whatever
its text says, so opening a file never asks to push it and never shows *Push and Open*. The same
document is **Help → Open Tutorial** (`menu.rs` emits `tutorial`; the command is `help:tutorial`).
`check-tutorial.mjs` holds the language and first-start rules, and `tutorial.js` /
`tutorial-first-start.js` hold the app behavior.

**Help → Documentation** (`F1`) opens the bundled English template-authoring guide
`src/ui/documentation/documentation.en.md` through the same pathless read-only reference rule
(`src/ui/reference_document.ts`). It needs no workspace, enters no stack and is replaced by another
file without a session question. The guide includes Pandoc and TeX installation requirements and
points to the seven complete packages under `examples/templates/`, including the
CC BY 4.0 Rho Class PDF article and its required attribution. The complete Reveal.js and Beamer
reference decks sit beside that directory as `examples/revealjs.md` and `examples/beamer.md`.
`examples/` is reader-facing reference material; `test/fixtures/` is separate controlled test data.

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
`⌘P`/`Ctrl+P`, `⌘T`/`Ctrl+T` and `⇧⌘T`/`Ctrl+Shift+T` are the same stack facts from the keyboard:
toggle membership, then move through the stack in panel order and wrap; a writable current document
is added before either navigation move, while a read-only reference stays out. The status bar reads
membership and savedness directly, tinting stack/saved green, editing amber and the absent/read-only
states muted.
Three things bite: a document's id is read at the *top* of it
(`document_identity.ts` — a note that links to another by id must not become it), a block's
offset is not the scroller's (a page puts 118px of desk and margin above the prose;
`virtual_block_renderer.ts: contentTop`), and placing a caret scrolls, so a view restore asserts
the scroll two frames later, as `keepScroll` does. A document that is neither stacked nor on
screen is dropped (`reachable`) — nothing could bring it back.

The frontmatter's `title`, `id` and `lang` are read by the YAML parser in `document_identity.ts`
with the *failsafe* schema, which keeps every scalar as text: a quoted colon, a comment, a folded
block and an id with leading zeros are all the author's value. A header the parser refuses falls
back to the old line reader, so a broken note keeps whatever title its `title:` line gives.

The `id:` line itself is the app's, not the reader's: `editing/id_lock.ts` refuses an edit that
would change it or either newline beside it, and `applyEdit` says why with `session.idLocked`.
The document manager's catalogue and indexes are invalidated by every create, rename, move and
delete the tree or the new-note flow makes, and by every save (`documentManager.invalidate()`);
the rebuild itself stays lazy, on the next question about a document.

A **new note** is one command, `file:newMarkdown`. `services/new_document.ts` is the rule: the
id's fourteen digits (`YYYYMMDDHHMMSS`, local — an author's own stamp), the four keys every note
carries (`title` → `Untitle`, `date`, `id`, `keywords` → a one-item list holding `untagged`), the
template the reader may write (the app config's `new_file_frontmatter`, a string or null for the
app's own, shown by settings → *New note*) and the range the title's value sits in, so the editor
can select it. A required key whose value is written *under* it — the keyword list — is the
reader's and is left alone; one with nothing under it gets the app's. A readable template package
with a root `metadata.yaml` may also seed one new note. `services/new_document_templates.ts` lists
those choices and reads the chosen file; the package's keys win over the configured frontmatter,
the configured template supplies keys the package omits, and `date`/`id` remain the app's stamps.
`services/new_document_builtins.ts` adds two app-owned presentation starters,
`builtin:revealjs` and `builtin:beamer`; they carry metadata for an export kind and are not template
packages in the library.
The choice belongs to that note only and is never written into `export_templates`; there is a
template-only card for the tree's *New file*, where the folder is already known.
`services/workspace_folders.ts`
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
type. A selected package does not stay selected: the next creation asks again, and export keeps its
separate per-kind choice. Two things bite here: the file plugin is scoped to `$HOME`
(`src-tauri/capabilities/default.json`), so a workspace outside it can be listed, moved and
deleted but not read or written by the webview; and making a note from a document that is not in
the stack asks the session's question first, the same one opening a file asks.

A **version** of a workspace is kept with git, and only ever because the reader asked for one:
*File → Save a Version* is the command `version:save` (`src/ui/versioning/save_version.ts`), and it
is the only action in the app that runs git — no timer, no quit hook, no on-save commit. The facts
are Rust (`src-tauri/src/versioning/`: `git.rs` finds the one git and runs every command, `facts.rs`
answers the repository and cloud-risk facts, and `versions.rs` reads a note's versions; which git
may be run — never by trusting `PATH`, and
`/usr/bin/git` only when `xcode-select -p` answers; whether the folder is in a repository of its
own or one above it; whether a cloud drive could reach it; and where the app would keep a git
directory outside the folder), the decision is pure (`services/versioning.ts: versioningPlan`, over
`consentFrom` and the config's `versioning`/`versioning_workspace` — an answer given for another
folder is *no answer*), and the doing asks the plan's own question first (`versioning_dialog.ts`,
the two hands `ui/prompt.ts` has), refuses a note with no file in one sentence, captures the
editor's text and writes it atomically (`files/atomic.rs: write_atomically` — temp file plus rename, the
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
(`services/versioning.ts: versionStamp`). The button's own word is the *state*: the newest version's
stamp when what is on screen is that version, and `version.unversioned` ("Not in a version") when it
is not (`versionedNow`: the newest version's text, read once with the history, against what the
editor holds — so a keystroke changes it), or "No versions yet" when there is nothing to compare
with at all.

Pressing the button reads once and opens `ui/versioning/version_history_modal.ts` only when the
history is `ready` and holds at least one version. A note with no file, no repository, no versions,
or an unreadable history opens nothing; the status button already says there is nothing to show.
The modal is modelled on the template editor: a centred panel, a history sidebar on the left, and
the selected version's diff in the right column. Rows show the stamp once above a subject containing
the title alone; the app-written ` · stamp` suffix remains in Git's subject but is hidden from this
row. Rows also show the comment, newest first; the newest is selected on open. Choosing another row
changes the selection and the right column without closing the modal. The living list is
`services/versions.ts`: it reads through
`src/api/versioning.ts` when the document's *path* changes (never on a keystroke), when the
workspace or the answer changes, and when the modal opens or a version is saved. `saveVersion()`
awaits the read after a successful commit, so the status stamp changes before the action returns.
The read is the
git vocabulary's **fourth call and its first read** —
`git log --follow --max-count=… --format=%H%x00%at%x00%s%x00%b%x1e -- <path>`, through the same
`run_git` — and the never-list is unchanged. Saving a version asks what to call it first
(`version_comment_dialog.ts`, a card with **no native twin**: no system surface answers with a line
of text), and the subject stays exactly what it was while the comment becomes the commit's body.

**A version can be seen and gone back to.** The right column is
`ui/versioning/version_diff_view.ts`: the whole note as one row per line, drawn from
`services/text_diff.ts` (the equal ends trimmed only to compute the change; the middle walked for
its longest common subsequence, removals before additions; past a cap the change is *named* — the
rule answers a count and the catalogue says the sentence), opening at the first change. The modal
keeps the keyboard while it is open; closing it with Escape or its ✕ hands the keyboard back
(`markdown_editor.ts: focusText`, and the scroller carries `tabindex="-1"` because WebKit only
makes a scroll container focusable when it has something to scroll). Its one action is *Restore
This Version*: **one question with a cancel that changes nothing** (*restore this version?*,
through the app's own `ui/prompt.ts`, so Escape is the cautious answer, naming the version and
saying nothing is committed), then
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
one item per kind (`src-tauri/src/menu.rs`, built from `src-tauri/src/export/kinds.rs: KINDS`), and the
item's own kind travels with the event it emits: *which* kind is being exported is settled in the
menu, before any card is drawn. That event runs the command `file:export`
(`src/ui/export/export_flow.ts`), and what it opens is a card whose workflow lives in
`src/ui/export/export_dialog.ts` and whose form lives in `src/ui/export/export_form.ts`
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
Yi's own, written in that shape). Every shipped file states `shift-heading-level-by: 0`: heading
levels belong to the note and the app's body rules, not to a defaults file. A reader's existing copy
is still never rewritten, so an older copy may keep another value. A row also says what the *window*
owes a kind's **body**: a book's
keeps the note's own level-1 heading, the note's name standing in it when the note keeps that heading in
its frontmatter `title:` (`src/ui/export/book_body.ts`, the kind's `names_its_body`) — the EPUB writer
would otherwise make a heading of its own, level 1, out of the book's name *outside* the document pandoc
makes identifiers unique in, and a section of the note that repeats the name is then the same id twice,
which epubcheck reports and `test/checks/check-epub-valid.mjs` fails on — while every other kind is
handed the note's own text, since a docx whose body opened with a heading of that name would say it
twice. A row can also say that the **card may set the page** (`takes_a_page_size`: the PDF, whose
engine lays one out, and nothing else): the card offers a size from `PAPER_SIZES` and an orientation,
both opening on *the settings file's own* so an untouched card asks for nothing, and the answer travels
as `geometry` options — **not** as a `papersize` variable, which pandoc *concatenates* with the one the
reader's file sets (`a4letterpaper`, and a LaTeX warning about an unused global option) while geometry's
options take the page with them (measured; `export-pdf-page.js` reads the page's own `MediaBox` back).
And one ask every kind answers is about the **citations**: a note that cites works gets them rendered
*and* a list at the end, and the card's own **No reference list** box asks for the first without the
second — unticked every time, so it changes nothing for a reader who never touches it. The kinds pandoc
writes are told in metadata (`--metadata suppress-bibliography=true`, passed only when there is a library;
measured, the same word under `variables:` does nothing), and the app's own hand writes no list at all.
The card also names a picture it cannot use: an image destination that is a `data:` URL of something
which is not an image (`src/ui/export/picture_hint.ts` — the note says the kind, so no machine is
asked). The export is written either way; measured, pandoc carries such a destination into a docx as a
`.txt` without a word, which is why the reader hears it from the app instead.
And whether a picture survives **as it is** is the *kind's* answer
(`export/kinds.rs: carries_pictures`): an
HTML page and a book keep an SVG and a webp, the app's own hand leaves the note's destinations as written,
and a Word file, an OpenDocument file, a TeX page or its `.tex` get a PNG the app draws itself
(`src/ui/export/raster_picture.ts` — the webview's canvas, twice a vector's own size and a webp's own, in a
folder of the app's own that the run removes). Pandoc draws a vector only where the machine happens to
have a rasteriser, and carries a webp as a file none of a Word file's five types promises; the app draws
both where the kind needs it. A picture **on the web** follows the same rule: an SVG or a webp is
fetched into the run's own folder and then treated exactly as a local one, carried where the kind can
hold it and drawn where it cannot (`image_extension` accepts `image/svg+xml` and `image/webp`;
`test/probes/export-web-picture-formats.js`). The one exception is processed markdown: the app writes
that file itself, so it keeps the note's URL rather than a path into a folder the run takes away.
**One kind is not pandoc's at all**: `markdown` (`needs_pandoc: false`) *is* the pre-process —
the app writes the text it prepared (`export_own_text`) — so it ships
no defaults file, and the card shows no settings row for it and refuses to make one. Every other kind
is pandoc's, so a machine without pandoc is told so and offered no run button; **pdf** is the one that
needs more than pandoc — a TeX engine, named in its file, **and a face for every script the note may be
written in**, because a page has no font fallback: a character outside the font in force is reported
*missing character* and drawn as nothing (measured: `你好，世界` came out as the space its words took and
none of the words). **This build draws those scripts itself.** It ships eight faces under
`src-tauri/assets/fonts/` (`bundle.resources` in `tauri.conf.json`, so `tauri-build` also puts them in
the target folder a development run resolves as its resource directory) — one per script, OFL, with the
licence beside them — and `src-tauri/src/fonts/bundled.rs` writes a header of its own,
`assets/export/pdf-fonts.tex`, into `<app data>/export/pdf-fonts.tex` before **every** PDF export (it
names the faces by absolute path, so a moved app would otherwise leave a header pointing at a bundle
that is gone) and hands it to pandoc as `--include-in-header`, which pandoc *adds* to whatever the
reader's file lists there (measured) — the reader's file is never edited and its own header entries are
still included. The header gives each Unicode block a `ucharclasses` character class and writes only
*entering* hooks for it: a leaving hook is written per class **pair**, so two of them overwrite each
other's entering hook (measured — that is how the first version lost Greek after Cyrillic). Measured,
one line of each on one page with **no** font named in the settings file: Greek, Cyrillic, Hebrew,
Arabic, Devanagari, Thai, Armenian, Georgian, Han, kana and Hangul all draw, with a `ToUnicode` map per
face so the page can be searched and copied from (`export-pdf-scripts.js` reads such a page back, and
reads the page's `/BaseFont` names to say they were *this build's* faces).
The same inter-character tokens are what made every `~~strikethrough~~` stop the PDF with *Package
soul Error: Reconstruction failed* once the header was included: pandoc's default template defines
`\st` and `\ul` with `soul`, whose scanner cannot see past them. The header therefore loads `ulem`
after pandoc's preamble and maps those two commands to `\sout` and `\uline` (`export-pdf.js` holds a
note with inline code and strikeout through the default document path).
**A custom PDF template is used exactly as imported.** It may not emit `header-includes`, may lack
Pandoc's `$highlighting-macros$` placeholder, and may not define `\st`, `\tightlist`, `Shaded` or
other writer macros; Yi does not rewrite its preamble or inject those pieces. `--include-in-header`
still reaches Pandoc, but a template that does not emit the header simply ignores it. Validation,
Test PDF and a normal export report Pandoc or the engine's own sentence naming what is missing. That
keeps the reader's template authoritative and avoids package/macro conflicts; template-authoring
documentation is the place to explain the Pandoc contract.

**What the reader's file names still wins**, and the header's own comment says how: `mainfont` is the
document's own font — `\normalfont`, so Latin and every block no shipped face answers for is set in it,
and a script *no* face is shipped for (Tamil, Ethiopic, …) is its business alone; `yi-<script>-font`
names a face of their own for **one** script, by the name their machine knows it by (`yi-hebrew-font:
"Frank Ruehl"`, and the slot list is `export_fonts::SLOTS` — one fact, holding the script, the key and
the shipped file together); `CJKmainfont` is Han and kana's, pandoc's own key. The header is written
from the same file pandoc is about to be handed, and each line it finds becomes
`\newfontfamily\yi<Script>{the name}` instead of the shipped file's — measured: with a Hebrew line
named, the page carries the reader's face and **not** the shipped Hebrew face
(`export-pdf-font.js` reads the page's own `/BaseFont` entries), while a script nobody named still gets
the shipped face. Hangul is why a face is shipped at all: the fonts a platform has for Han very often
have none of it — measured, the macOS `Songti SC` draws Han and kana and no Hangul, and a Korean note
set in it lost every syllable — so the shipped face draws Hangul whenever the file names none for it.
The **latex** kind ships no header and says `needs_a_font` for the same reason: a `.tex` is compiled on
the reader's own machine, where a path into this app's bundle will not exist — so a *name* in its file is
the only way a font gets in, and that file **names none**: a name the reader's machine does not have
stops their compile outright, where naming nothing leaves the card's hint to say which characters need
one (`mainfont:`, or `CJKmainfont:` for Han and kana) and which font this machine is known to have. The
name it used to ship was macOS `Songti SC`, and a Mac may be without it — the reader who reported the
problem had it from Microsoft Office, not the system, and on the machine this was written on the file
sits in Apple's `Supplemental` tree, which is both where macOS parks fonts it has not installed yet and
where Office puts some of its own.
**Every style the build can honestly ship, and emboldening for what it cannot.** `bold` and `italic` in
a shipped script were LaTeX's fallback — the regular face, with *"Font shape …/bx/n undefined"* in the
log and the weight the note asked for simply gone — so the real bold faces ship for all seven script
faces and the core face's italic too (1.75 MB in all; `SLOTS` names them per slot, and a slot with a
style gets no `AutoFakeBold` — measured: both at once makes fontspec embolden the *regular* and ignore
the bold face). The **Han and Hangul** face has no bold shipped because its real one is 25.5 MB
(measured) — one heading's worth of weight against as much again as every other face together — so those
two are emboldened by XeTeX (`AutoFakeBold=1.5`). A face the *reader* names is never emboldened: their
font's own bold is the one used. Italic in the scripts that have none (everything but Greek and
Cyrillic) still falls back to the regular face, written down rather than invented: a slanted Hebrew or
Arabic is not a thing those scripts have.
What the app *does* do about any of this is **say it before the reader exports**: a kind whose output
is typeset with those fonts (`needs_a_font`: the pdf and the latex) has its card drawn with the
characters no font in its settings can draw — and it says so in the app's own words, with the settings
file and its *Reveal in folder* button already beside it — and it *names the font to add*, in the line
for it (`mainfont:`, or `CJKmainfont:` for Han and kana), because that is what the measurements say
works: the widest font the machine is known to have
(`export_named_fonts` → `suggested_font`, a name to type and not a choice the app makes) — which is now
what the hint says only about a script **no face is shipped for**, since everything else draws already
(what the faces cover arrives as `NamedFonts.shipped`, read out of the fonts' own `cmap` tables so a
face swapped for another cannot leave the card quiet about a page that lost a character). A platform the
app has no entry for is named **nothing** rather than guessed at, and the shipped file's header says the
procedure for those readers instead: where this machine's fonts are listed, and what to look for in
them. **The name itself is the machine's to answer, and it is asked in the same breath**: when the hint
has characters nothing in the settings can draw, the window asks `export_font_for` for a family *this*
machine has that draws every one of them (`system_fonts::covering`), read out of the fonts' own `cmap`s
— not out of a list of platform names, because a name is not a coverage and the macOS `Songti SC` is the
proof (Han and kana, no Hangul). The card then names it for the reader to type, and the probe checks the
app's own claim: the name it gives, written into the settings file, must not raise the unknown-font line
beside it.
**And a name the machine does not have is said before the run, not by the engine after it**:
`system_fonts` reads the fonts this machine has — the family names in the platform's own folders, read
through the same table parser the shipped faces go through (`font_file`) and cached for the run
(measured here: 674 families, 783 ms in a dev build, once) — and the card says so in its own line for
every name the settings file writes that nothing answers to. That is a *name* question and not a
coverage one: `system_fonts` deliberately says nothing about what a font can draw, because the macOS
`Songti SC` draws Han and kana and no Hangul at all, and no name reveals that.
The two halves come from the two places that
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
what the docx embeds is what the page showed). A picture written as a web URL is kept as that URL
for HTML: the author's address must not become a temporary file that disappears after the run. For
the other pandoc kinds it is fetched by the app with an in-process `reqwest` request, because a
pandoc built without HTTP support cannot fetch it at all; those files land in
`<data>/export/tmp/remote/` and go at the end of the run. When an HTML page is not self-contained,
`export/html_media.rs` copies the note's local pictures to `<output>.assets/` and rewrites their
`src`; web URLs and data URIs are untouched — and a third rule, for the kind
pandoc is not the one converting for: each citation written as the words it reads as, with the works
it names listed under them (`services/bibliography.ts: format`, `referenceList`), because that kind
has no citeproc behind it. Those rules walk the *parse*,
so a `[[…]]` in a fence or in code, and an image inside one, stay exactly as written. The app's
scratch note (written under its data folder, because pandoc reads files) is deleted whether pandoc
succeeded or not — and pandoc's own warnings are **kept** (`ExportOutcome.warnings`) and shown to the
reader as a message, so a document missing a piece says why instead of leaving a hole.
The pre-process delegates image resolution to `ui/export/image_rewrites.ts`, listing output to
`ui/export/listing_markdown.ts`, and shared Markdown escaping to
`ui/export/markdown_escaping.ts`.

The same pre-process lowers listings: HTML/EPUB/DOCX/ODT get one identified `.listing` Div with a
visible `.listing-caption` paragraph, processed Markdown gets an HTML figure, and LaTeX/PDF keep
native fenced shapes. `ui/export/reference_header.ts` writes the document's configured caption
names and literal counter prefixes into a temporary header, which Rust writes beside the run note
and passes as a second `--include-in-header`; empty prefixes leave native counters alone, while list
labels stay Yi-generated.

What the app may ask pandoc is one list in one place — `--defaults`, `--output`, `--resource-path`, the
**library and CSL style its own citations were formatted from** (`--bibliography`; `--csl`, from
citation-js's bundled styles, which is why `[@key]` resolves and the reference list is appended in
the style the page showed), and the note — held by `test/probes/export-pandoc-arguments.js` against
a pandoc that only records
(`test/probes/fake-pandoc.sh`); `export_use_pandoc` is the seam that points the app at it, put back
by the harness like the git one.
What citeproc makes of the syntax *around* a key is measured by `test/probes/export-citations.js`,
through an EPUB because a book is a zip and its pages can be read back: `[@key, p. 45]` carries the page
number where the style puts it (`(Smith, 2020, p. 45)` in APA), `-@key` leaves a parenthetical with the
year and no name, and the list is appended under the heading the app asks for. **`suppress-bibliography`
is metadata, not a variable** — a `variables:` line leaves the list exactly where it was (measured) —
so a reader who wants the keys resolved and no list writes a `metadata:` block in their settings file.

**An ODT contents field is made visible before either office suite opens it.** Pandoc writes
`text:table-of-content-source` and its title but leaves the generated `text:index-body` empty.
LibreOffice may refresh that field; OnlyOffice displays no contents at all until a body exists.
After Pandoc succeeds, `src-tauri/src/export/odt_toc.rs` reads the heading bookmarks it wrote and
caches level-one/two entries in the field, preserving `mimetype` as the first ZIP entry. The note is
not edited and no TOC is authored in Markdown; `toc: true` remains the package's instruction.

**A template is a package under the app's export data, not a note.** The folder is
`<app data>/export/templates/<id>/`; `template.json` is the app's manifest — schema, id, name, export
kind, `template`/`wrapper`/`reference-doc` mode, provenance and licence, one entry, the CSL and the
asset/deliver lists — and the reader never writes it by hand. The manifest's `id` is a slug of the
display name (`-2`, `-3` on collision); it is edited through the details form, and the raw JSON is a
read-only view in the package editor. A package belongs to one export kind. `assets` are every other
file, and `deliver` names the TeX support subset (`.cls`, `.sty`, `.bst`, `.bbx`, `.cbx`). A LaTeX
export copies the whole `assets` tree beside its `.tex`, not only that subset, so a figure or data
file the template names travels too. Pictures the note itself names are made portable by
`src/ui/export/latex_images.ts` and copied by `run/delivery.rs`: a local picture that replaces a package asset
keeps the same relative path and its bytes win, while other local pictures go under
`<output-stem>.assets/`; Pandoc never sees an absolute note path in the finished `.tex`.

Import is **inspect, then confirm**. `src-tauri/src/export/templates/scan/mod.rs` reads a single file, a
folder or a zip without copying: a `.tex`/`.html` is a text template, a `.docx`/`.odt` a reference
document, a lone `.csl` is refused, and a lone defaults file is refused in favour of the defaults
panel. A folder or zip is walked recursively, dot-entries ignored, and the main `.tex` chosen by
`$body$`, then a document environment, then `main.tex`/`template.tex`/`article.tex`, then size; equal
candidates come back for the reader to choose. A complete document becomes a **wrapper** proposal:
`source.tex` stays as an asset beside it, `template.tex` is a copy with `$body$` before
`\end{document}`, and mapping its `\title{}`/`\author{}` to `$title$`/`$author$` is offered
unchecked. A document in `samples/` wraps in `samples/`, so its relative inputs and graphics keep
their folder; literal `$` characters are doubled (`$$`) for Pandoc's template parser and return to
one dollar in the output. Choosing another complete document in the details form makes the same
wrapper conversion. A zip is extracted
into a hidden staging folder and renamed into place only when complete; absolute paths and `..` are
refused, as are symlinks, more than 2,000 files or 200 MB. `createDefault` is the other factory and
writes the same shape, from `pandoc --print-default-template` or
`--print-default-data-file=reference.docx`.

The Rust scan and package facades keep the caller-facing paths stable while their children own one
rule each:

```text
scan/archive.rs       ZIP safety and extraction
scan/detection.rs     entry, kind and mode detection
scan/source.rs        file/folder listing, limits and copies
scan/wrapper.rs       complete-document conversion
package/import.rs     staged creation, import and Pandoc-default factories
package/inspect.rs    source inspection and wrapper preview
package/details.rs    manifest, entry and mode updates
package/options.rs    optional provenance normalization
package/library.rs    discovery, summaries and resolution
package/editor.rs     code-panel file access
package/alias.rs      export-time alias staging
package/storage.rs    package paths, naming and file classification
```

`scan/mod.rs` and `package/mod.rs` remain the stable orchestration and IPC-facing boundaries.

The choice is per kind in `AppConfig.export_templates` (kind → package id) and the card's **Template**
row changes it for later exports too. The chooser filters readable packages to the export kind it was
opened for. A package whose manifest cannot be read remains available for read-only details and
removal; when its kind cannot be read either, the Export Manager lists it once under **Unassigned**.
**File → Manage Export Templates…** opens one kind-first manager from the typed
`manage_export_templates` menu event and `export:manageTemplates` command. The manager and the export
card share `src/ui/export/templates/package_browser.ts`; the manager owns the selected kind,
inspected package, defaults state and active-package writes, while the card owns transient per-export
choices. The manager changes only the existing `AppConfig.export_templates` map and existing
`export.{kind}.yaml` files, never a session document or a second package registry.
`ExportRequest.template_id` carries only the id: `run/arguments.rs`
resolves it under the app's export folder, refuses one for another kind, and hands pandoc
`--template` or `--reference-doc`, the package's `--csl` after the reader's own, and the package
folder as the first `--resource-path`. A PDF run works from the entry file's folder, so a sample's
relative graphics and inputs resolve, and puts the package root on `TEXINPUTS`, `BIBINPUTS` and
`BSTINPUTS`, so its class, bibliography and style still resolve. The package is
also staged under the folder name its template uses in relative links (`template/css/…` for Yuki),
so the card's **Self-contained HTML** box, off by default, embeds the package's local CSS,
JavaScript and pictures when ticked. HTML's target is a bundle folder: `/notes/note` becomes
`/notes/note/note.html`, with `note.assets/` and the template's files inside it. When the box is
off, the page keeps relative links. The bundle always receives the package's whole asset tree,
whether or not the page also embedded those files; web URLs stay URLs.
The distinction between the manifest CSL and a `csl` entry in package defaults is the precedence
the order above creates: a package default is loaded before the reader's explicit `--csl`, while
the manifest CSL is appended afterward. A template that must enforce its own citation style names
the file in `template.json`; one that should follow Settings → Citation leaves the manifest `csl`
null. Do not add a second citeproc filter merely to change style: Yi already supplies citeproc, and
running it twice duplicates references.
`ExportRequest.self_contained` becomes an explicit `--embed-resources=true|false`, so an older
reader defaults file cannot silently turn embedding back on. For EPUB, `epub_pack.rs` rewrites
chapter links to an `assets/` folder, copies the package's web resources there and declares them in
`content.opf`. DOCX, ODT and PDF are containers and need no sidecars. The app never runs TeX's
unrestricted shell escape or `tlmgr`, and it does not download journal kits.

**Reveal.js and Beamer are first-class, template-free export kinds.** Their rows in
`src-tauri/src/export/kinds.rs` use `KindTemplate::None`, so the card exposes no package choice.
Beamer uses Pandoc's Beamer writer and the shared LaTeX source-rewriting family; its frontmatter
controls sections, frames, theme and geometry, and it writes one PDF without the PDF card's page-size
controls. Reveal.js uses Pandoc's Reveal.js writer and the HTML-like rewrite family, but always writes
a non-self-contained folder named after the deck: `<deck>/<deck>.html`, `images/`, and `js/dist/`.
`src-tauri/src/export/revealjs.rs` owns the output shape and bounded HTTP downloads. Pandoc names
local distribution files `js/dist/...`, while the pinned package root contains `dist/...`; the
downloader removes the local `js/` prefix before building the CDN URL. A newly created Reveal.js
bundle is removed when its export fails, while an existing destination is never deleted. The first
Reveal.js build wrote four template variables as invalid top-level defaults; `ensure_defaults_in`
migrates that exact shipped byte sequence to the corrected file without replacing any edited copy.
The export card
has two independent choices, both off: keeping the pinned Reveal.js CDN URLs, and keeping remote
picture URLs. Local mode downloads every referenced distribution file into `js/dist/`; local
pictures are always copied into `images/`, while remote pictures are fetched there unless the picture
switch is on. The Reveal.js downloader and picture packager run after Pandoc has produced the page,
so they consume the HTML's actual asset references rather than a second list that could drift.
The Rho Class example preserves the original callout title as a bold lead-in inside the class's
native Note/Information environment and constrains its figure to 70% of the two-column text width.

**A native-BibTeX LaTeX package receives a cited-only bibliography from Settings → Citation.**
`src/ui/export/native_bibliography.ts` recognizes package defaults with a `bibliography: …bib`
target and a filter list that does not contain `citeproc` (the example also sets
`cite-method: natbib`). It reads citation keys through the same Markdown parser the editor uses,
filters the selected BibTeX or CSL-JSON library, and converts the result to BibTeX. The shared
`src/citations/library.ts` owns the `citation-key`-then-`id` rule for both editor formatting and
this export. `ExportRequest.native_bibliography` carries the generated text and relative target;
`run/delivery.rs` omits the ordinary `--bibliography`/`--csl` citeproc arguments, refuses a target outside
the output folder, skips the package's sample file, and writes the generated `.bib` beside the
`.tex`. Missing cited keys and a missing citation-tab selection are reported rather than silently
falling back. `export-template-native-bibliography.js` drives both a `.bib` and CSL-JSON selection
through the running app and proves uncited works do not reach the source tree.

The editor is `src/ui/export/templates/editor.ts`: a CodeMirror 6 panel (YAML and TeX through
`StreamLanguage`, line numbers, search, undo, bracket matching), never the markdown editor and never a
session document. It lists the package's files, shows binaries read-only with *Open in system*, saves
with `Mod-S` atomically, and **Validate** / **Test PDF** run pandoc on a one-paragraph fixture and
show its stderr. The same panel edits a kind's defaults YAML, which is why the export card's old
*Reveal in folder* is now **Edit defaults**. The library is `library.ts` (choose, import, create,
details, duplicate, remove), the confirmation is `import_dialog.ts`, and the manifest shape is held
by `check-template-manifest.mjs` over `test/fixtures/templates/manifest.fixture.json`. The probes are
`export-template-import.js`, `export-template-defaults.js`, `export-template-output.js`,
`export-template-ui.js`, `export-template-create-ui.js`, `export-template-broken.js` and
`export-template-pdf.js`; `export-template-native-bibliography.js` covers cited-only BibTeX source
packaging, and `template-examples.js` validates and exports the seven authoring examples.

The editor is a *page*: the prose root is 210 mm of A4 with a 25 mm margin, centred on the
scroller, which is the desk (`styles.css: .markdown-page`, `.markdown-scroller`; the box is
named in `virtual_block_renderer.ts`, and scaled to fit the pane by `markdown_editor.ts:
fitPage` — the sheet, its margin and its type take one `--page-scale`, capped at 1, so a
narrow window gets a smaller page rather than a sideways scroll). It is one of *two*
layouts: `data-layout="auto"` on the scroller is the column at the pane's width, the editor
as it was before the page, switched by the status bar's layout button (`view:togglePage`) and
remembered in the app config (`editor_layout`); its left padding is `2.5rem`, the original `1rem`
margin plus the `1.5rem` marker gutter, while its right margin stays `1rem`. Four consequences
worth knowing before you touch it:
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

Every heading names its level in a decorative left margin (`nodes/heading_marker.ts`): the supplied
h1-h6 SVG is fixed at `calc(1rem * var(--md-page-scale))`, so it follows the page scale without
growing with the heading's type. `nodes/heading_hover.ts` supplies an invisible target in that
gutter, while `create_block.ts` marks and `styles.css` expands the containing block into it with a
cancelling negative margin and equal padding; this keeps WebKit's `content-visibility` hit area over
the marker without moving any content. The browser's native heading `:hover` state then slides the
glyph into view; only the marker's opacity and transform change, so heading indentation and text
geometry do not move. The marker is `aria-hidden`, has no pointer events and contains no text,
leaving the heading's source, copying and caret offsets untouched. `heading-level-markers.js` holds
all six glyphs, sizes, gutter hit-testing, hover geometry, full-width gutter room and typing.
An empty heading keeps its marker visible without hover because it has no title text to show its
level; `markdown-heading-marker-empty` is the single state for that case.

**A heading attribute block is source, not title text.** `syntax/heading_attributes.ts` reads the
trailing Pandoc `{#id .class key=value}` block on ATX and setext headings;
`plugins/remark-heading-attributes.ts` removes it from rendered children while keeping its exact
range on the heading, and the heading serializer writes it back. `nodes/heading.ts` applies only the
ID and reveals the attributes while the caret is anywhere in that heading. `document/heading_index.ts`
caches every heading target for the current text, using `syntax/pandoc_identifiers.ts` for automatic
IDs and Pandoc's numeric suffix for duplicates. ⌘-click or Ctrl-click on `[text](#id)` reaches
`editing/references.ts`, which reveals the target block and focuses it without changing
`location.hash`. `heading-attributes.js`, `heading-crossrefs.js` and
`heading-crossrefs-default-document.js` hold the rendering, navigation and fixture behavior.

**`[#id]` is an automatic reference, and a standalone captioned image is a figure.** The remark
transformer `plugins/remark-auto-references.ts` splits `[#id]` from ordinary text while preserving
offsets; `nodes/auto_reference.ts` renders the target's inferred label. `document/reference_index.ts`
owns document order, IDs, duplicate resolution, heading, figure, listing, captioned-table,
captioned-list and labeled-equation targets. `syntax/reference_vocabulary.ts` reads document-owned
labels and literal prefixes from frontmatter, with English and empty fallbacks and no dependency on
the app's interface language. Figures with a non-empty alt are recognized after all parser repairs by
`syntax/figures.ts`; their Pandoc attributes stay in the source while normal rendering shows the
image, caption, and computed number. `auto-references.js`, `figure-rendering.js`, and
`figure-crossrefs-default-document.js` hold the app behavior.

**A captioned pipe table owns its optional separator and its following `: …` line.** The table
source mapper is bounded by the pipe rows, so a caret after the table never resolves to its last
cell. `syntax/table_captions.ts` accepts zero or one blank line, parses the final Pandoc attribute
block, and preserves the exact table/caption source on the table node. `create_block.ts` groups the
three lines but renders no node for the optional separator, so a direct and separated caption have
the same appearance. The shared `nodes/caption.ts` numbers table and list captions and reveals the
complete line from any point on its row. At the caption source's start, `Enter` adds the separator
and `Backspace` removes it.
`document/reference_index.ts` counts every captioned table but targets only one with an ID. The
non-LaTeX lowering lives in `ui/export/table_rewrites.ts` and `table_html.ts`; LaTeX/PDF get
`\yiTableRef`, written by `ui/export/reference_header.ts` and the run-local Rust header file.
Shipped LaTeX/PDF templates expand `$header-includes$`, and their table filters preserve the caption
and ID as `\caption` and `\label`. `table-caption-crossrefs.js`, the table editing probes, and
`table-crossrefs-default-document.js` hold the editor behavior; the export probes hold each kind,
and `export-pdf-table-template.js` proves the package counter contract.

**A labeled equation is one bracketed display-math block, never one target per
environment row.** `syntax/equation_blocks.ts` owns `[$$…$$]{…#id}` parsing,
the `[$$` autocomplete skeleton, and the environment matrix. An ID is optional
for display; the structural reader keeps a block visible while its final
attributes are unfinished. Plain or environment math is lowered before KaTeX so
no native automatic tag can depend on virtualization. `create_block.ts` and
`nodes/equation.ts` render one Yi-owned number or the exact, clickable wrapper source;
`document/reference_index.ts` indexes only labeled blocks.
`ui/export/equation_rewrites.ts` gives every HTML/EPUB/DOCX/ODT display equation
one full-width row with the formula first and a minimum-width, left-aligned second cell;
only a label fills that cell. `equation_html.ts` gives processed-Markdown MathML
the same layout, and LaTeX/PDF get one outer `equation` with `\yiEquationRef`.
The default fixture contains every
matrix row with and without an ID;
`equation-matrix-default-document.js`, `equation-rendering.js`,
`equation-source-editing.js`, `equation-crossrefs.js`, and
`export-pdf-equation-template.js` hold the feature.

**A captioned list is a normal list followed by one shared colon caption line.**
`syntax/caption_lines.ts` owns the grammar for both tables and lists;
`syntax/list_captions.ts` attaches it only at the list's base indentation and
masks the line for remark without changing offsets. This keeps a colon after a
paragraph as definition-list syntax and leaves `:::` free for callouts.
The same shared `nodes/caption.ts` reveals the caption as its own source while
list items remain editable. HTML/EPUB/DOCX/ODT all receive one target wrapper
and numbered caption; processed Markdown renders equivalent list HTML. LaTeX/PDF use the
namespaced `yilist` object counter and native labels/references, with
`\yiListCounterSetup` letting a template choose the reset level and
`\yiListNumber` its base format. The default fixture and the caption, crossref,
and export probes hold the feature.

**A callout is either a GitHub alert blockquote or an attributed Pandoc fenced
Div.** `syntax/fenced_divs.ts` owns complete colon fences, nesting, quote carriers
and body ranges for all Pandoc Divs. `syntax/callouts.ts` is the stable facade;
`callout_model.ts` owns the value, built-in titles and class grammar,
`callout_reader.ts` classifies alerts and complete Divs with exact source ranges,
`callout_parser_source.ts` performs offset-preserving parser normalisation, and
`callout_kind_edit.ts` builds the minimal kind/Default edit.
`plugins/remark-callouts.ts` converts both forms to one
positioned callout node; nested outer quotes stay quotes. `nodes/callout.ts`
draws the rendered panel, and `nodes/quote_source.ts` exposes exact block
source while editing for both ordinary quotes and callouts, including escaped
markers, physical blank lines and raw child delimiters that a rendering cannot
give an exact caret. `syntax/quote_edits.ts` and `syntax/callout_body.ts`
implement the shared quote rule: Enter adds two fully prefixed lines, a second
Enter exits exactly one level, blank quote lines delete as physical lines,
typing never invents a delimiter space, child blocks keep their own Enter
semantics with every inserted line prefixed, and an empty callout's invisible
body anchor is reachable by Left or Right and materialised only on typing. An
empty list item exits to the quote/callout body as one block-relative edit, and
ordinary quotes render with a two-sided inset and one oversized opening mark
instead of the typography plugin's side rule and paired quote glyphs.
Unknown Pandoc Divs such as columns, speaker notes, wrappers and incremental
lists always render as exact source through `nodes/fenced_div_source.ts`; a
quote or callout containing one also falls back to complete source.
A run of three or more colons stays literal until its following space creates a
closed bare Default Div with the same fence length on both lines and opens
`editing/callout_kind_picker.ts` with Default plus the six callout choices; a
callout choice adds only its class metadata, and an inner Div uses a longer run
so its choice edits only that inner opening. A Div body inserts one newline per
Enter after the child list/table/code/equation rules decline it, and a single
backtick is literal there while three typed backticks open a nested code fence.
accepts repeated blank lines with the caret left on the newest.
`ui/export/callout_rewrites.ts` lowers both authoring forms to one semantic
`.callout` / `.callout-<kind>` / `.callout-title` Div before all overlapping
source rewrites, so template Lua filters receive one stable AST shape.
`callout-rendering.js`, `callout-empty-navigation.js`, `quote-enter.js`, `quote-list-enter.js`, the
default-fixture probe, and the export/filter probes hold the feature.

**An attributed fenced code block is a listing only when its ID or caption makes it one.**
`syntax/code_fences.ts` reads both Pandoc opening-fence attribute forms; `syntax/listings.ts`
creates an ID/caption listing block, while `create_block.ts` keeps the code body editable and
draws the caption below it. Only an ID consumes a listing number; a caption alone is visible but
unnumbered. Export rewrites automatic references to ordinary links, lowers non-LaTeX listings to
identified Divs or processed-HTML figures, and leaves LaTeX/PDF with native listing shapes plus a
generated label/counter header. `listing-rendering.js`, `listing-crossrefs.js`, and their
default-document probes hold the editor behavior. `listing-source-horizontal-caret.js` holds the
source box's own horizontal scroll: typing or deleting near the end of a long opening fence
can rebuild the highlighted `pre` when the edit changes its shape, so the restored caret must
scroll that box back to the caret. Ordinary characters in highlighted source use the plain
write path and keep the existing `pre`.

Every revealed node uses that same literal surface. `data-source-from` marks links,
citations, wikilinks, images, formulas, formatting, captions, automatic references and
heading attributes; a fenced block's complete text is `.markdown-source-text` with
`data-text-from`. While one is open, any non-newline character is written locally,
including Markdown markers. The parse and rendered view wait until the caret leaves.
`source_text.ts` owns the shape, and `editable-source-burst.js` holds every
node family to it. The existing deferred parse check also reconciles dependent blocks
once per burst, so renaming a footnote definition updates markers in other blocks
without rebuilding the source under the caret for every character.

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
is what `src/commands/triggers/native_menu.ts` maps to a command. The language is a config field whose empty default
means *the reader's system locale* (`src/services/language.ts`, `i18n::language_for`), offered by
its own name in the General tab; changing it rebuilds the menu in Rust and **reloads** the windows,
because a label is read where it is drawn and the session brings the document, the caret and the
view back. `check-locales.mjs` holds the two readers to one set of keys, and the probe harness puts
the app in English before a probe — a probe asserts behaviour, and its expectations are English —
then puts the reader's choice back.
`src-tauri/build.rs` watches `../locales`, because the binary embeds those files at compile time:
without that line a new key reaches the webview but the menu keeps the old catalogue and shows the
key itself.
**Sentences the *backend* writes are the third caller of the same keys**: a failed write, a folder it
cannot make, a kind with no configuration file — written where they happen, deep inside a command, and
met by the reader in a toast beside translated chrome. They go through `i18n::now`, which is `t` with
the language the app is speaking (`i18n::remember`, set where the config is read and where it is
written — the menu's `load_config` at startup is the first of those). A path operation also has a
system reason, so it uses `i18n::path_error(key, path, reason)`; that helper supplies both `{path}`
and `{reason}` once instead of repeating their parameter names at every call. Both are held by a unit
test that sets the language and reads the sentence back, and by `check-locales.mjs`, which walks
`src-tauri/src` as well as the webview's tree so a message that uses a key counts as a use of it.
**Every sentence the backend writes for the reader goes through them now** — the file tree's
refusals, the export path's, the fonts', the versioning seam's, the settings guard's, the external
programs' (`app.cannotRun`) and the bibliography's — 419 keys in each of the eight catalogues, and a
new one is held by the catalogue check
(used, and present everywhere) and by the unit test that sets a language and reads a sentence back. What
stays English is what no reader meets: the **Tauri plugins' own** messages (not this app's to
translate), the development seams' sentences (a probe's bad call, a fetch error whose only consumer is a
`catch` that replaces it with the app's own), and the versioning facts' `cloud_evidence`, which no window
shows and one probe reads.

Typing is not a command, so **what a bracket writes and the lists that open as the author types**
live in the editor's key path: `syntax/brackets.ts` says what a `[` (or `(`, `{`, a quote) writes
— its pair with the caret inside, and only where prose is being written: nothing in a fenced code
block, a display formula or an inline code span, nothing around a selection, and Backspace on an
empty pair takes both characters back — while `syntax/completions.ts` says what the caret is
*inside* (an `@` the citation plugin itself would make a citation of, `[#` or a same-document
`](#`, or `[[`) and which entries match what has been typed. A one-character input-method commit
takes the same bracket rule as a key, including in quote and callout source; the rule runs before
an empty line or callout body is materialized so the caret stays between the pair.
`editing/completions.ts` is the list in hand and `completion_card.ts` draws it beside the caret,
clamped to the window the way the footnote preview is; the editor asks it *before* its own text
path, so while a list is open the arrows, Enter, Tab and Escape are the list's, every other key
types and redraws it, and a click in the document closes it — a click is not typing. Enter writes
the citation's key, a reference or link-fragment target's ID, and a document's **id** — or its
**file name** when it has none, *not* the title the row shows beside it — so what is written is
what the resolver reads back (`documentManager.resolve` falls back by name first). Link-fragment
completion is same-document only: it asks after `](#` and deliberately declines a path such as
`note.md#section`. The entries come from `bibliographyManager.entries()`,
`document/state.ts: referenceEntries`, and `documentManager.documents()` — a document's `target`
is the id or the file name, which is exactly what `resolve` takes. Three things bite. The second
`[` must write its own pair *in front of* the `]` the first one's pair left after the caret — that
is what makes `[[` two pairs, `[[]]`, with the caret inside them — and writing only the `[` leaves
the wikilink one bracket short, which is exactly what Enter then writes into (measured:
`[[<id>]`, against `test/probes/brackets.js`). The list also has to remember the end of the query
it is showing: the parse check after a structural character can rebuild the block and leave the
live DOM caret on the block wrapper. Accepting from the recorded document range is what makes
Enter write the filtered row after that rebuild. Non-owned text keys are re-anchored to the same
endpoint first, and Escape or a query with no matches restores it before closing, so the next
Backspace still edits the query. A query records how many delimiter characters follow it, so
acceptance can put the caret after `]`, `)`, or `]]` while keeping the completed node's source
open at that edge. A boundary character is then decided again from the rebuilt paragraph: it
leaves source mode when it is surrounding prose, so the completed node renders, while a character
that continues the same construct keeps its source open (a narrative citation accepting another
key character is the exception). A growable source such as a caption keeps its content end moving
with the local write, so a burst at that end does not rebuild each character. A delimiter pair
rebuilds through the ordinary path: typing `(` after `[title]` must open `()` around the caret and
rebuild the block as a link source.
`completion-filtered-accept.js` holds every kind in ordinary prose, quotes, GitHub callouts and
fenced-Div callouts, including completed nodes at the end of a line; `revealable-edge-exit.js` and
`revealable-edge-exit-format.js` hold the boundary decision.
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
that span after the pending layout settles, so the redraw a keystroke triggers would otherwise
measure where the caret has just left, and the popover would open one character off and slide
across on the first ArrowDown. `span.ts: scheduleRender` also leaves the old caret in place for the
first frame of a rebuild: measuring a table there catches its provisional height and paints the
caption's caret above its line for one frame (`caret-rebuild-line.js`). A row
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

**A delimiter line typed on its own opens the block it names**, and **a bare block marker is the
character rather than markup**. `editing/fence_open.ts` writes both delimiter lines at once with the
blank lines markdown needs around them. Formula and frontmatter carets land in the body. A code
fence keeps its caret after the opening backticks: typed characters filter the language list, Enter
chooses, Escape closes without a source change, and Space closes filtering while staying in the
opening line so attributes can follow. A Div waits for a space after its three-or-more-colon run,
then retains the exact fence length and keeps its caret on that opening run while asking for a Div
kind. Both pickers are
`markdown/choice_card.ts`: one active list, no focus capture, filtering where requested, and Arrow
Up/Down, Home/End, Enter, Space and Escape handled by the editor key path. `$$` needs no such thing,
and `---` is frontmatter *only* on the note's very first line, where it would otherwise be a
thematic break. That frontmatter is YAML,
closed by `---` or its `...` end marker; `+++` is ordinary text, not a fence. `syntax/bare_markers.ts` is
the parse repair behind the other half: markdown reads a lone `-` as an empty item and, under a
paragraph line, as a setext underline, while a lone `#` is an empty heading. The repair makes those
characters text; the delimiter space is what starts an item (`- `) or heading (`# `), and the line
above a bare `-` is never swallowed. Each rule has its check
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

**A soft wrap is a visual line without a newline character.** Stepping left from the first character
of a wrapped line can name the collapsed space that ended the line above; WebKit can give that
collapsed range no rectangle at all. The caret geometry therefore searches from the zero-sized
boundary to the nearest character that paints, taking its right edge when stepping back and its left
edge when stepping forward (`caret/geometry.ts: boundaryGlyphRect`). A Left arrow from the second
visual line lands at the first line's real right edge rather than at the paragraph's top-left;
`wrapped-line-left.js` holds it.

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
`test/probes/input-method-backspace.js`). A structural edit hands the keyboard back to the seam,
as do a click and an *undo* — the last is a change that never goes through `applyEdit` and so has
its hand-back named where it happens (`markdown_editor.ts: applyHistory`). Ordinary character
typing and an in-place committed word keep the focused seam; blurring and refocusing during a
burst lost input (`source-burst-editing.js`, `empty-task-composition-burst.js`). Three facts follow
from the seam: a *document* selection is one inside
the prose root (`editing/context.ts: isDocumentRange`), because a focused textarea makes the browser
report one of its own; where the keyboard goes is one hook (`EditorContext.focusText`), because a
command that focuses the page and a command that selects it are then asking for the same thing; and
a synthetic click cannot warm an input context, so a probe drives the seam with dispatched
composition events rather than pretending to type.

The same committed text also refreshes the completion list. A `[#`, `[[` or `@` arriving through
the native seam therefore opens its choices immediately, exactly as a `keydown` path does; the next
Tab is never the event that makes the card appear.

The hand-back deliberately blurs the seam for one turn so the input method gets a
fresh context after a structural edit. Ordinary typing and an in-place committed word do not take
that path, because the focus round trip is slower than a burst and loses keys. App
activation can likewise leave the keyboard on the page while the editor still owns a
live caret. The editor catches a page-targeted key whenever that caret exists, so neither
a quick burst nor the first key after activating the app is lost
(`test/probes/typed-text-focus-burst.js`); a click outside removes the caret, so losing
focus there still writes nothing.

A key the input method routes is the method's, whether a composition is behind it or not: a
`keydown` marked `keyCode` 229 that carries a character belongs to the method, and the seam writes
that character — typing it as well writes it twice (measured with Caps Lock on, where the method
composes nothing and passes every letter through; `test/probes/input-method-passthrough.js`). A 229
key that carries no character — `Enter`, an arrow, `Backspace` — is still the editor's. Caps Lock
alone is not a delegation signal: in the English source its key is ordinary editor input, and
sending it to the seam leaves stale native context when the reader then switches to Chinese. A
printable keydown after a commit also proves that the next space is the author's rather than the
duplicate space that chose the prior candidate.

Caps Lock pass-through can deliver several native insertions without a composition. The seam
tracks the prefix already committed and defers clearing its textarea until the current input event
is over; clearing it synchronously makes WebKit reject every insertion after the first at that
caret (`input-method-passthrough.js` holds three consecutive characters). A 229-routed Latin
letter is also normalized to lower-case when Caps Lock supplied an upper-case form, because the
method uses Caps Lock as its English-mode switch. When an editor-handled key such as a space ends
that native burst, the seam resets its native input context immediately; a frame-delayed reset
still loses the next ultra-fast Caps Lock key.

The system's keyboard-source notification is the other context boundary. `input_source.rs` sends
one `input_source_changed` event through the native observer for each desktop: AppKit's
`NSTextInputContextKeyboardSelectionDidChangeNotification` on macOS, `WM_INPUTLANGCHANGE` on the
main window on Windows, and the IBus/Fcitx source-change signals on the session bus on Linux.
While the seam is focused it clears native text and reacquires focus, so a switch from English to
Chinese starts pinyin in the next key. The shared page path is held by
`input-source-switch.js`; the Windows and Linux native deliveries await platform integration
tests.

The prose fast path writes into the rendered text, so it uses `text_spacing.ts` for both its
equality proof and its output. A run of spaces, or one at a text node's end, is a no-break space on
screen while the document keeps ordinary spaces; the source and rendered length stay equal
(`space-typing-visibility.js`).

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

The design rules for new code extend the invariants above:

7. Commands are typed requests; events are typed facts emitted after an authoritative state change.
   State owners remain the source of truth, and events never become a second copy of that state.
8. A UI trigger, built-in agent, MCP client, menu, and test use the same command catalogue and
   dispatcher. They differ by origin and authority, not by a second implementation of the action.
9. Ordinary typing and IME input stay synchronous. Local same-window facts use the typed local event
   path; Tauri transport is for facts or triggers that genuinely cross a window or process boundary.
10. A module has one clear reason to change. Prefer small stable interfaces, dependency inversion,
    composition, and named adapters over hidden globals, cross-feature reaches, inheritance for code
    reuse, or flags that make one base class behave as several classes.
11. Abstract only a rule that is genuinely shared. A design pattern belongs where it names real
    ownership or removes real duplication; it is not a requirement to add ceremony.
12. A refactor preserves behaviour unless change is requested. Its focused test must fail without
    the new boundary, and interface changes must include the affected app probes.
13. When writing a method or function, include a short concrete example whenever it explains the
    purpose or contract better than prose. Show an input and result, a before-and-after state, or
    the failure it prevents; do not stop at restating the goal. Trivial getters and obvious
    one-line helpers do not need a ceremonial example.
14. External document edits must read `document:getRevision` and send its document key and revision
    to `document:replaceRange`. A mismatch is `stale` and changes nothing; an agent must re-read and
    replan rather than guess offsets against newer text.
15. A committed load, edit, undo or redo emits one local `document_changed` fact with document key,
    previous/new revision, reason and text. Consumers read that fact; no feature may add a second
    change notification.

The approved target architecture, including typed command results, origin-based authority,
document revisions, stale-agent-edit rejection, event correlation, and the phased migration, is
`docs/superpowers/specs/2026-10-31-human-maintainable-command-event-architecture-design.md`.
New work follows that direction while the migration is in progress; it must not introduce a second
command registry, event vocabulary, or editing API.

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
cargo test                              # Rust tests
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
2. `cargo test` → every Rust test passes.
3. `npm run check` → every check passes (`n/n checks passed`, where `n` grows as checks are
   added — one per pure rule).
4. Run the probes that touch what you changed; if a probe fails, read
   `test/README.md` for how probes report. A probe that "timed out" is usually its own
   length: the bridge gives a script **5 s**, and the harness waits for the probe's own
   result from the stash before it restores the session or settings, then recovers it
   (`P21` measured the app's own cost as flat over a whole suite — a load of the 314 KB
   fixture note stayed at ~330 ms, and a bridge call at ~3 ms).
5. If you changed behaviour, add or update a test that fails without your change and
   say which one proves it. Pure rules go in `test/checks/`; anything about DOM,
   caret or rendering goes in `test/probes/`.
6. Keep the house rules above; if a rule has to give, say so in the commit message.

**Merging proves the final tree once.** A merge commit's identity does not affect the app;
its tree does. Start from a clean branch whose tree passed the checks above. If
`git merge-base --is-ancestor main codex/<branch>` fails, merge `main` into the branch first,
resolve the integration there, and prove that resulting tree. Run `npm run probe:all` when the
tree to be merged has not already passed it; a moved `main`, a conflict, or a dependency,
toolchain, capability or bridge change always requires that full run. Documentation-only
changes still owe `npx tsc --noEmit`, `cargo test`, and `npm run check`, but do not need
unrelated application probes. Record `git rev-parse HEAD^{tree}` and compare it after merging;
when the merge contains that same tree, do not repeat the full suite. If the tree differs, the
merged result is untested and must run it.

**The fixture is a test's, never the reader's.** The app you develop against is the maintainer's
own: its config names *their* workspace, bibliography and layout, and its session holds the
documents they had open. So a test run that points the app at `test/fixtures/workspace` — or at a
folder a probe made — **backs both up before it starts and puts both back when it ends**, and no
test ever runs *in* the reader's own folder. `--with-workspace` does the config half for you (the
harness snapshots `get_config` and writes it back; `test/tauri-probe.mjs`). The harness also starts
every run with `export_templates` empty — a reader's Yuki choice must not turn an export probe into a
measurement of their selection — and the snapshot puts the choice back afterwards. It does the
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
