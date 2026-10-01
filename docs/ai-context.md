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

## Map

| Layer | Files | Job |
| --- | --- | --- |
| Syntax (pure, no DOM) | `src/ui/markdown/document/blocks.ts` and `src/ui/markdown/syntax/**` | split text, and the pure rules of editing |
| Document | `document/state.ts`, `document/blocks.ts` (the text, its blocks, the parse cache) and `document/history.ts` (the edit log) | the text and everything derived from it |
| Render | `virtual_block_renderer.ts` (the DOM), `block_sizes.ts` (the pixel arithmetic), `viewport_window.ts` (which blocks to mount), `create_block.ts`, `registry.ts`, `create_node.ts`, `nodes/*`, `source_mode.ts`, `format*.ts` | DOM for the window of blocks |
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
`relative` host, under the button) and `QuestionCard` (the veil, the centred card, and one answer
with Escape giving the cautious one). The footnote preview, the completion list, the stack panel,
the table picker, the prompt and the two cards are all one of those kinds now; a kind may *add* to
Escape but never replace it, and the base must not grow a mode flag — a fact one kind has is a
parameter it is built with, or a subclass of it. `ui/messages.ts` replaces the old toast: one
`BesideCard` per message in the window's bottom-right corner *whatever it is about*, stacked upward,
with its ✕ at the card's right edge, and nothing disappearing on its own: a **message** is for
something that needs the reader's attention — a failure — so it waits for the ✕ or Escape, and a
press elsewhere leaves it. What the reader only has to *notice* is a **hint** instead
(`services/hints.ts`, `ui/hints.ts`): the tree's three "copied" confirmations, a card beside the row
they happened on, with no ✕, gone at the next press (or Escape). A hint's place travels as a *name*
— a workspace path, which is the row it is found by (`hintPlaceSelector`, escaped) — never as an
element, because the event bus is Tauri's and its payload is JSON.

Documents are a *session*: `services/document_session.ts` holds the rules (pure, checked in
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
is the note's own name and the minute it was asked for, because `git log` is the only browser a
reader has of it for now (`docs/roadmap.md`).

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
And the closing click has to be *captured*: a click that lands on a markdown node is answered by the
node itself and stops there, so a listener that waits for it to bubble never sees it. And the card
is placed from the caret's *range*, never from the span that draws the caret: `scheduleCaret` draws
that span a frame later, so the redraw a keystroke triggers would measure where the caret has just
left, and the popover would open one character off and slide across on the first ArrowDown. A row
of the card is also the card's own width — daisyUI's `menu` sizes an item to what it holds, so a
long title has to be clamped (`min-w-0` and a truncating title) or the row is wider than the card
it is drawn in.

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
re-derived from, and when.

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

## If you are an AI agent

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
harness snapshots `get_config` and writes it back; `test/tauri-probe.mjs`), and the session half is
the probe's own: a probe that opens documents into the session leaves them in the reader's next start
unless it reads `loadSessionText` first and puts it back with `saveSessionText` in a `finally`
(`src/api/session.ts`; `test/probes/first-run.js` is the pattern for the config half). A fixture is
disposable *as a fixture* — `npm run fixtures` refreshes it — while the reader's own notes are not,
and a probe that writes belongs in a folder of its own under `$HOME`.

Do not invent files or functions: every path in this document exists. If you need a
name that is not here, search with `rg` before writing.
