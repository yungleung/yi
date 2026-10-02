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
| `check-blocks.mjs` | How the raw document splits into blocks (`document/blocks.ts`), and empty-paragraph runs |
| `check-brackets.mjs` | What typing a bracket writes (`syntax/brackets.ts`): the pair and the caret inside it, the second bracket that turns `[]` into `[[]]`, the literal region and the selection where nothing is written, the `]` the author steps over, and the empty pair Backspace takes away whole |
| `check-hints.mjs` | Where a hint goes (`services/hints.ts`): the tree row a file's hint is found by, and the escaping a quote, a backslash or a newline in a file name needs |
| `check-block-index.mjs` | Where the blocks are: the prefix sums over their lengths and line spans, across an edit inside one block and across one that changes how many there are (`document/block_index.ts`) |
| `check-block-sizes.mjs` | What a block is worth in pixels, the sums the window and the spacers are built from, and which blocks a scroll mounts |
| `check-code-edits.mjs` | Tab/Shift+Tab inside a fenced code block and a display formula |
| `check-completions.mjs` | What the caret is inside when a list should open, and which entries belong in it (`syntax/completions.ts`): a citation's query and the places an `@` is not one, a wikilink's query, the entries matching on either field, and the cap |
| `check-enter.mjs` | What `Enter` inserts at a block edge and on an empty paragraph, and list rules |
| `check-footnotes.mjs` | Footnote definitions, labels and appending notes |
| `check-history.mjs` | The edit log (`document/history.ts`): what an edit inverts to, the edges of undo and redo, and that a keystroke's history is bytes rather than a document |
| `check-image-edits.mjs` | How an image is written (`syntax/image_edits.ts`): the markdown of `![alt](destination)` and where the caret lands, which clipboard text counts as a destination, the name a saved image gets, and the kind it is encoded as |
| `check-locales.mjs` | The app's words (`locales/*.json`, read by `services/i18n.ts` and `src-tauri/src/i18n.rs`): one key set per language, nothing blank, every key used by a source, and one reading of a system locale |
| `check-list-edits.mjs` | List markers, indentation and item continuation |
| `check-math-source.mjs` | Which source is shown, and where a click enters it |
| `check-new-document.mjs` | The shape of a new note (`services/new_document.ts`): the id's fourteen digits and the local clock they read, the frontmatter built from the reader's template with the four required keys guaranteed, and the range the title's value sits in |
| `check-plain-edit.mjs` | Which edits cannot change how the text parses, and that every edit the rule accepts leaves the parse's shape unchanged (`syntax/plain_edit.ts`) |
| `check-placement.mjs` | Where a floating card sits (`ui/floating/placement.ts`): under what it points at when there is room, above it when there is not, inside the window on every side, and in the bottom-right corner when it names nothing |
| `check-workspace-setup.mjs` | Whether the app asks the reader for a workspace (`services/workspace_setup.ts`): a fresh install is asked, an empty workspace is no workspace, and a reader who has one — or has already answered — never is |
| `check-versioning.mjs` | What the app should do about versions (`services/versioning.ts`): the reader's consent turned into a plan over the facts of the machine and the folder — nothing without consent, their repository as it stands, never nested inside another, a separate git directory where a cloud drive could reach `.git`, and none of it without git — plus the answer read back for the workspace it was given for, the name a version carries (its stamp, the subject it leaves alone and the comment that becomes the body), the path its words name, whether the status bar's button belongs there at all, and which of the empty states the list is in |
| `check-table-edits.mjs` | Table row/column commands and alignment |
| `check-table-menu.mjs` | The table menu's model: what each entry does to the source |
| `check-table-source.mjs` | Reading and writing a table's raw source |
| `check-tag-offsets.mjs` | Which of the offsets a block's elements carry an edit moves, and that every one of them is on the moved list or exempt for a reason (`editing/typed_text.ts`) |
| `check-thematic-break.mjs` | What a rule insertion adds around the `---` line, and when it adds nothing |
| `check-text-store.mjs` | The document text as a piece table (`document/text_store.ts`): any sequence of edits must leave it holding exactly what a string holds |
| `check-tree-menu.mjs` | What the workspace tree's context menu offers for a file, a folder and the workspace itself, and which items cannot mean anything there |
| `check-tree-rules.mjs` | The tree's pure rules: what a rename starts with selected (the name, without the markdown extension) and whether a drop into a folder is allowed |
| `check-workspace-folders.mjs` | Where a new note may go (`services/workspace_folders.ts`): the order and depth of the walk, a folder that cannot be read, the folder it refuses to walk past, and the path rules the card, the tree and a system sheet's answer all read |
| `commands.mjs` | That a command has one name, one home and one way in: no module but the registry declares a command, and the editor reaches commands by name |
| `headers.mjs` | That every module under `src/ui/markdown` opens with the three-line header: what it is for, what it may import, what it upholds (`docs/writing-comments.md`) |
| `layering.mjs` | That the syntax layer imports nothing from outside itself (no DOM, no state) |
| `probe-markers.mjs` | That a probe opening the native table menu carries `@needs-foreground-window`, so `probe:all` skips it instead of leaving the menu open for every probe after it |
| `syntax-home.mjs` | That each markdown-syntax fact is defined in exactly one module |

## The probes

A hundred and thirty-seven of them, grouped by area: the workspace tree (`tree-rename` — a name edited
where it sits, the tree unmoved and the extension left out of the selection;
`tree-create`, `tree-file-actions`, `tree-delete` — what the context menu does;
`tree-drag`, `tree-drag-refusals` — a move that updates only the rows it touched, and the
moves that are refused; `tree-no-reload` — a change in the *fixture* workspace that leaves
the page it happened on in place), making a note (`new-markdown` — the card the menu item's
command opens: the generated id in the name field, the workspace's folders, the file written
where it was asked for with its frontmatter on screen and its title selected, and the tree's own
*New file* through the same command; `new-note-template` — a template written through the app's
config, the settings tab that shows it, and the note that comes out), blocks and spacing
(`block-gaps`, `spacing`,
`empty-*`, `insert-rule`), code and lists (`code-tab`, `code-shift-tab`, `list-*`), tables
(`table-*`), what typing offers (`brackets` — the pair, the `[[` that comes out as two pairs, the
pair Backspace takes away whole, the literal block and the selection it writes nothing around;
`completion` — the bibliography's keys, narrowed by key *or* title, the arrows and Enter;
`completion-wikilink` — the workspace's documents, the id Enter writes and the file name a document
with no id is written by, which its title beside it must not be mistaken for — the citation probe
also holds the popover's own geometry: a row flush inside the card, and a card that stays put while
the arrows move), footnotes
(`footnote-*` — the button, the marker's two clicks and its source,
the preview card, the label's own edits, and the shapes a definition is written in:
`footnote-containers`, `footnote-container-jump`, `footnote-table-cell`,
`footnote-repeat-label`, `footnote-labelled`, `footnote-label-undo`,
`footnote-label-rebuild`, `footnote-label-edge`), description
lists (`description-list`), the caret (`boundary-caret`, `pointer`,
`regression-arrows`, `edit-stability`, `regression-undo`, `undo-after-scroll`,
`plain-edit-offsets`, `undo-typing`, `undo-run-taken-back`, `undo-selection-return`),
and the page staying where the reader put it while the window turns over
(`scroll-caret-anchor` — scrolling up from the end of a document must not jump to a caret the
reader left behind), what a keystroke costs (`edit-cost`, `scroll-cost`, `block-rebuild-cost`,
`typed-text`,
`plain-edit-parse`, `plain-edit-markers`, `block-offset-cost`, `load-cost`,
`typing-cost-by-kind`, `code-local-write`, `keystroke-parts`, `code-markup-layout`), finding (`find-replace`),
localization (`localization` — the catalogues a component reads when it is built, and the locale rule both readers share; the *menu's* own strings are held by Rust's tests, since no page can read a native menu), paste (`paste-blocks`), source mode
(`display-math-*`, `math-*`, `inline-math-*`, `revealable-flows`,
`revealed-source-exit`, `reveal-click-scroll` — a click that opens a source keeps the
page where it was), links (`insert-link` — the button, the clipboard destination and the
caret in the title; `insert-link-clipboard` — a clipboard that offers no URL and one the
app cannot read at all, either way with the webview's clipboard never asked;
`link-cmd-click` — ⌘-click opens in the browser, a plain click opens the source) and images
(`insert-image` — the button, a URL, a path and a `file://` URL from the clipboard, a
selection becoming the alt text, and the empty image a clipboard the app cannot use leaves behind;
`insert-image-blob` — a picture on the clipboard, the card with it drawn in it, the name it starts
from, the file saved where the settings say, and the image *painted* once the note names it), the
highlighted source (`source-theme` — the palette of a code block, the frontmatter and a
formula's source, measured in both themes; `source-highlight-caret` — a click in the
frontmatter, and in a code block, writes the character it was aimed at), the
documents and their stack (`document-stack` — a file opened, pushed, and the next file replacing it without a question; `document-stack-restore` — a document coming back with its caret and its view; `document-stack-ask` — the four answers the session asks about; `settings-push-on-open` — the General tab's switch for that question, an editing document pushed without asking, a saved one replaced without being pushed; `document-session-restart` — the session file, and the startup path that reads it), the
things the app says (`messages-and-hints` — a failure raised from the tree waiting in the window's
bottom-right corner with its ✕ at the card's right edge, a press elsewhere leaving it, Escape and
the ✕ closing it, a second message stacking above the first; and a copied path as a hint beside
its row, with no ✕, gone at the next press), the
first start (`first-run` — the card the start-up path asks with, saying where a new workspace would
be made, a folder taken from the path field and becoming the workspace the tree then shows, the
answer remembered, and "not now" writing nothing; `first-run-create` — the other answer, with the
documents folder pointed at one the probe made, so the folder appears once and is adopted when it
is already there), the versions a workspace keeps (`versioning-facts` — what the backend says of a
folder it made itself, and what it says about `~/Library/CloudStorage` without asserting a vendor's
answer; `versioning-fake-git` — every argument the app hands git, watched by a git that only
records (`probes/fake-git.sh`, committed because a probe cannot set an executable bit);
`versioning-save` — the question a workspace nobody has answered for is asked, the answer remembered
with its path, and the note committed; `versioning-staged` — a file the reader had staged is still
there to commit after a version of another note; `versioning-consent` — the answer that is *no*,
nothing written or made, and the General tab's switch asking the same question; `versioning-repository`
— a repository the reader already has, used as it stands; `versioning-outer` — a folder *inside* one,
never nested into; `versioning-no-git` — the machine with no git, which is told and writes nothing),
the versions of the note on screen (`versioning-status` — the button at the left of the status bar:
hidden where the reader said no, with the recorder's log left empty, and saying the newest version's
stamp where they agreed; `versioning-list` — the panel's rows, newest first, the newest marked and
the comment under its own row and no other; `versioning-list-empty` — the four things it says
instead of a list, the last by pointing the git seam at a git that is not there),
the
page (`a4-page` — 210 mm of sheet, a 25 mm margin, centred on the theme's desk, the measure
the reader gets, the smaller page a narrower pane is given instead of a sideways scroll, and
the whole rhythm coming down with it; `page-layout-toggle` — the status bar button's two
layouts, driven by pressing it), the
fixture workspace (`fixture-*`), and the real
documents (`real-doc-math`, `real-docs`).

`npm run probe:all` prints every probe's name and result as it goes, which is the
live index; the newest probes carry a header naming what they cover:

```js
/**
 * One line on what this proves.
 *
 * @covers src/ui/markdown/<file>.ts
 * @fixture test/fixtures/workspace/...      (when it needs one)
 * @needs-workspace                          (when the app must open the fixtures)
 */
```

## Conventions

- **The fixture is a test's, never the reader's.** A dev app holds the maintainer's config (their
  workspace, bibliography and layout) and their session (the documents they had open).
  `--with-workspace` snapshots and restores the config for you; the session is the probe's own job —
  read `loadSessionText` before and put it back with `saveSessionText` in the `finally`
  (`src/api/session.ts`) — and a probe that writes works in a folder of its own under `$HOME`, never
  in the reader's notes.
- A probe header may declare what it needs: `@needs-workspace` (the app pointed at the
  fixtures: run with `--with-workspace`), `@needs-source-workspace` (the maintainer's own
  notes folder open: `probe:all` skips it), `@needs-large-document` (`probe:all` gives it
  the 323 KB fixture note; everything else gets the demo document), `@needs-foreground-window`
  (the editor window must be visible, so `probe:all` skips it).
- A probe whose subject is written *through the webview* — a new note is written with the file
  plugin — needs a workspace under `$HOME`, because that is all the plugin is scoped to
  (`src-tauri/capabilities/default.json`: a folder under `/private/tmp` can be listed, moved and
  deleted by the app's own Rust commands, but reading or writing it from the page is refused).
  `new-markdown.js` and `tree-create.js` make their own folder in the home directory, use
  `plugin:path|resolve_directory` for its path, and remove it in their `finally`.
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
- Name probes for the behaviour, not the file they touch.
- A check prints `all checks passed` on success and the failures on stderr.
