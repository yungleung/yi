# Versions of the note on screen

## Problem

The workspace keeps versions with git, and the only way to see them is to leave the app: the
repository is the reader's, `git log` is theirs, and nothing in the window says that a version
exists at all. What a reader needs while writing is the small fact — *is there a version of this
note, and when* — and, one press away, the list of them.

The other half is that a version made by the app has only a machine's name: the note's title and
the minute it was asked for. That says when, and nothing about why. The reader can put their own
words into a version, and those words are what a list is worth reading for.

## The rules, as the reader gave them

| Question | The reader's answer |
| --- | --- |
| What counts as a version of this note | **The commits that touched this file**, whoever wrote them — the ones *Save a Version* made and the ones the reader made with their own git. The repository is the truth; the list and their `git log` agree word for word |
| When the workspace's versioning is off | **No button at all**, and no git read: an answer for another folder, or *no*, must never touch the repository |
| When it is on | The button is **always there**, even with nothing to show — it says *why* it is empty rather than hiding |
| What a row holds | The formatted time, the message, and the comment under it |
| What pressing a row does | Nothing. Restoring a version is the versioning spec's own out-of-scope; this slice only shows |
| Saving a version | It may carry a **comment**: the subject stays exactly what it is today (`Title · 2026-10-01 20:15`), and the comment is the commit's body |

## Design

### 1. The read (Rust: `src-tauri/src/versioning.rs`)

One command, one git call:

```rust
#[tauri::command]
pub fn versioning_history(workspace: String, path: String, limit: usize) -> Result<Vec<Version>, String>

pub struct Version {
  hash: String,      // %H — what a row is named by, never shown
  at: i64,           // %at — unix seconds, the author's date, the one `git log` prints first
  subject: String,   // %s
  body: String,      // %b, empty when the commit has none
}
```

`run_git` runs `log --follow --max-count=<limit> --format=%H%x00%at%x00%s%x00%b%x1e -- <path>`
— the same single helper every other git call goes through. Measured in this repository: 50 rows of
a file cost **14 ms** (45 ms with `--follow` over a long history), and a path git has never seen
answers **nothing and exits 0**, so “no versions” is an empty list and not an error to invent.
`--follow` is what keeps a renamed note's versions (measured: with it `renamed|The note · …|first`,
without it only `renamed`). NUL between fields and `\x1e` between records, because a commit message
may hold any other character — including newlines, which is exactly what a body is.

This is a **read**, and the app's git vocabulary grows from three calls to four: `init`, `add` and
`commit` write, and `log` reads. The never-dos are unchanged, and nothing here touches the index,
the working tree or the configuration.

### 2. The living list (`src/services/versions.ts`, `src/api/versioning.ts`)

`versionsOfDocument` holds the versions of the document on screen, the way `documentSession` holds
the documents. It reads only when the config's answer for **this** workspace is *yes* and the
current document has a path; it keeps the path it read for and does nothing when the same document
changes (a keystroke announces the session, and a git call per keystroke would be absurd); it reads
again when the path changes, after a version is saved, and when the workspace or the consent
changes — and announces `VERSIONS_CHANGED`. What it can be in:

```ts
type VersionsState =
  | { kind: 'no-file' }                                  // the note has never been saved
  | { kind: 'no-repository' }                            // nothing has made one here yet
  | { kind: 'ready'; path: string; versions: Version[] } // possibly empty
  | { kind: 'unreadable'; message: string };             // git said no; the sentence is the panel's
```

Two of those are pure rules beside the plan, so the check walks them and this prose is not their
only home: `versionsVisible(stored, workspace)` — is consent *yes* for this folder, read from the
config with no git call at all — and `versionsState({ path, repository, versions })` — no file;
nothing has made a repository here; otherwise the list, which may be empty. `unreadable` is not
derived: it is what the service says when the read itself throws, which a probe reaches by pointing
the app's git seam at a git that is not there (`YI_GIT`; `versioning-no-git.js` is the precedent).

`src/api/versioning.ts` gains `versioningHistory(workspace, path, limit)`, the one way to the
command. The limit is **50**, the same cap the completion list uses.

### 3. The button (`src/ui/versioning/version_status.ts`)

At the **left** of the status bar — the left group exists and is empty today. It is the layout
button's own shape (`Toolbar`, the ghost button that never takes the focus or starts a window
drag), except that the shared 20 px status sizing moves from `layout_toolbar.ts` into `toolbar.ts`
so both use one constant rather than two copies. It hosts its panel the way `SessionToolbar` hosts
the stack popover.

It is present exactly when the config says *yes* for this workspace, and hidden otherwise — read
from the config alone, so a workspace the reader said no to never runs git at all. With versions it
draws the reader's icon and the newest version's stamp; with none, the icon and a muted
`version.none` ("No versions yet"); pressing it toggles the panel. Its tooltip and accessible name
are one key, `version.button` ("Versions of this note"). A probe finds it by `[data-version-status]`.

### 4. The panel (`src/ui/versioning/versions_panel.ts`)

An `AnchoredPanel` under the button, `left-0`, `max-h-80 overflow-auto`, newest first: one row per
version — the stamp, the subject, and the comment under it in muted text. Rows are read-only; a
press on one does nothing (Escape and a press outside close the panel, as the kind does). Empty, it
says which reason it is:

| State | The words |
| --- | --- |
| `no-file` | `version.noFile` — the sentence the action already refuses with ("This note has no file yet…") |
| `no-repository` | `version.noRepository` ("No versions yet in this workspace") |
| `ready`, empty | `version.empty` ("No versions of this note yet") |
| `unreadable` | `version.unreadable`, with git's own sentence in the console under its context |

Opening it asks the service to read again — one git call, on a press rather than on a keystroke — so
a version the reader made in their own terminal a minute ago is in the list when they look.

Each row carries `data-version-row` and, for the row that is the newest, `data-version-latest`.
One honest wart: a version the app made carries its own stamp *inside* its subject
(`The Human Condition · 2026-10-01 20:15`), so such a row reads its time twice. The row shows the
message exactly as `git log` does rather than trimming the app's own words out of it — the price is
visible, the alternative is a rule that inspects messages it did not write.

### 5. The stamp (`src/services/versioning.ts`)

`versionStamp(at)` answers `YYYY-MM-DD HH:MM` in the reader's local time — the same stamp the app
already writes into a version's message, so the button, a row and `git log` read alike, and the
rule has one home: `versionMessage(name, at, comment)` builds its subject from `versionStamp`, and
the check beside them walks both.

### 6. The comment (`src/ui/versioning/version_comment_dialog.ts`, `save_version.ts`)

Before writing a version, `saveVersion` asks for a comment — **after** the “no file” refusal, so
nobody types for a version that cannot be made, and after the plan's own questions. The card has
**no native hand** (the image card's precedent: no system surface takes a line of text as an
answer), so it is one card for readers and probes both: an optional field, `data-version-comment`
on it, Enter or the yes button saving with what is typed, Escape cancelling the whole version —
the card family's cautious answer. The field carries the caret when it opens, the way the new-note
card's name field does.

The words: `version.comment.title` ("Save a Version"), `version.comment.label` ("A note about this
version — optional"), `version.comment.save`, `version.comment.cancel`.

`commit_paths` gains `body: Option<String>`, so the commit is `git commit -m <subject> -m <body> --
<path>` — the same verb, one argument more — and the body is sent only when the trimmed comment is
not empty. The pure rule answers both halves (`{ subject, body }`), which is what its check walks.

### 7. What this does not do

No restoring, no diff view, no push, no browsing another document's or the workspace's versions —
each is the versioning spec's own out-of-scope list, and this slice only reads.

## Testing

- **Node** (`test/checks/check-versioning.mjs`): the stamp in a pinned timezone, the subject
  unchanged by a comment, the body trimmed or `null`, and the two rules the UI reads — whether the
  button is shown at all, and which of the empty states the list is in.
- **The recorder** (`test/probes/versioning-fake-git.js`): the fourth call, watched the same way as
  the other three — `log --follow --max-count=… --format=… -- <path>` — and still nothing from the
  never-list. With the app pointed at the recorder, the read answers nothing, so the probe can also
  hold the empty-list sentence.
- **A new probe** (`test/probes/versioning-list.js`): a workspace of its own under `$HOME`; hidden
  with consent off (and no git call made); the button and its stamp after two versions the app
  itself committed; the panel's rows newest-first with a comment under its own row; the two empty
  sentences; and a note with no file.
- The probes that save a version (`versioning-save.js`, `versioning-staged.js`) learn to answer the
  comment card, and the Rust vocabulary test gains the `log` case and a commit with a body.
