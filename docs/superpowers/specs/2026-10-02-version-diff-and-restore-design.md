# Seeing a version, and going back to it

## Problem

The list of a note's versions says *when* each one was made and what it was called, and nothing
about what it held. Answering "what did this say before?" means leaving the app and running
`git diff` in a terminal, and going back to an older text means `git checkout` — which is exactly
the command the app promises never to run, and which would move the reader's own index under them.

The reader wants both in the window: **show me what changed**, and **put it back**. Both are
reachable only from a document that has a file, because that is the only state in which the versions
panel has rows at all.

## The rules, as the reader gave them

| Question | The reader's answer |
| --- | --- |
| What a version is | Unchanged: a commit that touched this file, whoever wrote it |
| What the diff compares | That version against **the text on screen** — the *now*, unsaved edits included |
| How much of the note is shown | **The whole text**, as one line stream: unchanged lines once, removals and additions in their places, each marked. Not hunks with the gaps collapsed |
| Which versions may be compared | Any row; always that version against the now — never two chosen versions against each other |
| Where it is shown | A sheet over the editor's area, full width, most of the height; it **takes the keyboard** while it is open, and closing it leaves the caret, the selection and the scroll exactly as they were |
| What restoring does | Writes **the file**, with the app's own atomic write; no git write of any kind; no version is made for the reader |
| The question before it | The session's own, unanswered: the text on screen is replaced, so it is pushed to the stack or let go — the reader's choice, as everywhere else |

## Design

### 1. The read (Rust: `versioning.rs`)

Two changes, both reads.

**Every row carries its own path.** `git show <revision>:<path>` needs the name the file had *at
that commit*: measured, `git show <old commit>:<new name>` answers *"path 'renamed.md' exists on
disk, but not in `<commit>`"*, while the row's own name works. `versioning_history` therefore adds
`--name-only` beside the format it already writes, and the format moves its record separator to the
front — `%x1e%H%x00%at%x00%s%x00%b` — so each record reads: separator, four NUL-separated fields,
then the path git printed (measured: `note.md` for the commits before the rename, `renamed.md`
after it). `Version` gains `path`.

**One new command.** `versioning_version_text(workspace, revision, path)` runs
`git show <revision>:<path>` through the same `run_git` and answers the text — or refuses when the
bytes are not valid UTF-8 (`This version is not text.`), never lossily rewriting them. The revision
must be a hash and the path repo-relative: an argument that could be mistaken for an option is
refused rather than passed on. The vocabulary stays what it is — three writes, and reads — and the
never-list is untouched.

### 2. The rule (`src/services/text_diff.ts`, pure, checked in Node)

No diff library exists in this project (measured: no such dependency), and this is rule-shaped
work, so it is ours: `textDiff(before, after, cap)` answers the whole document as one line stream,
each line `{ kind: 'same' | 'removed' | 'added', text }`, in order.

It works by trimming the equal first and last lines — that is about *cost*, never about what is
shown — and diffing the differing middle line by line; the trim's own lines come back as `same`.
When the middle is longer than the cap, it answers a single named hunk ("N lines replaced") instead
of trying to be clever, so a 300 KB note cannot make the app chew. `same` lines are carried from
either side (they are equal by definition), so the result always covers the whole note.

### 3. The sheet (`src/ui/versioning/version_diff_view.ts`)

A **mode**, not a floating surface. It lays itself over the editor's area inside the content shell
and **keeps the keyboard while it is open**, because the editor's caret stays alive behind it and a
keystroke reaching a document nobody can see is the one outcome worse than a modal. Escape or its ✕
closes it; the caret, the selection and the scroll are untouched, because the session holds them and
the sheet never writes to it. It is deliberately not a `FloatingSurface` — that family's rule is
that a surface never takes the focus — and its header says so.

Drawn in the app's source styling: one row per line, removals and additions marked in the gutter and
tinted with the source palette's diff colours, the whole note scrollable, opening **at the first
change** rather than at the top. Its title names the version it is showing (`Version of
2026-10-01 20:15`), and its one action is *Restore This Version*.

### 4. The flow

1. A press on a **row** of the versions panel (inert today) picks that version; the panel closes.
2. The sheet reads the version's text if it does not already hold it, and builds the stream against
   the text on screen *at that moment* (a snapshot, taken on opening).
3. Nothing changed → the sheet says so (`version.diff.none`, "This version is what you have now")
   and offers no restore.
4. *Restore* → **one question, with a cancel that changes nothing**: *restore this version?*, asked
   through the app's own prompt (`ui/prompt.ts`, so Escape is the cautious answer), naming the
   version and saying that the note and its file will hold it and that nothing is committed. When the
   text on screen is not in *any* version — the newest version's own text differs from it, or there is
   no version at all — the question says that too (`version.restore.unversioned`), because that text
   is the one thing here that exists nowhere else. Cancel
   leaves the sheet, the file and the text exactly as they were. Then
   `documentSession.openVersion(path, content)`: the file is written with the app's atomic write and
   the document on screen becomes that text, at its top, with its file believed to hold it. The text
   is the *version's*, but the file it is written to is the one the document has **now**: a note
   renamed since then keeps its present name, and its history stays its history.

   Two details the writing of it settled, both measured. A document with a file is keyed by its
   **path** (`document_identity.ts: documentId`), so a restore is not "open another document" —
   `openInto` would see the same id and bring the existing one forward, leaving the old text on
   screen — which is why `openVersion` replaces *that* document's text (its content, its `saved`, its
   title, its view). And **nothing is kept for the reader**: they were asked, they answered restore,
   and the text that was on screen is gone — no copy pushed into the stack on their behalf. (The
   first cut of this asked the *session's* question, "push it to the stack, or open without it",
   which was wrong twice: that question is about opening another document, and neither of its
   answers is "I did not mean to press that". The reader said so.)
5. The sheet closes. The versions list is unchanged — the newest *version* is still the newest
   commit — the app says *Saved* (the file holds what is on screen), and the reader's own
   `git status` shows the modification. Their next version, if they ask for one, records it.

### 5. The words

Six keys in all eight catalogues: `version.diff.title`, `version.diff.version`, `version.diff.restore`,
`version.diff.close`, `version.diff.none`, `version.diff.tooLong` — plus the refusal for a version
that is not text, `version.diff.notText`.

### 6. What this never does

No `git checkout`, no index change, no `add`, no `commit`, no `reset` — a restore is a file write and
nothing else, so the reader's staged work stays staged and nothing is committed on their behalf. No
editing inside the diff. No comparing two arbitrary versions. No whole-workspace restore. No binary
versions and no lossy text. No silently truncated diff: beyond the cap, and for a version that is
not text, the sheet says what it could not show.

## Testing

- **Node** (`test/checks/check-text-diff.mjs`): equal texts, one insertion, one deletion, a rewrite,
  a reordering, the trimming of equal ends, an empty side, a text with no trailing newline, and the
  cap's named hunk; plus, for the message rule, nothing new.
- **Rust** (`versioning.rs`): the parser reads a path per row out of `\x1e`-framed records, and the
  vocabulary test holds `show <revision>:<path>` (and that a revision or path that looks like an
  option is refused).
- **Probes**: `versioning-diff.js` — a row press opens the sheet, the whole note is there,
  the changed lines are marked and the first change is in view, a keystroke while it is open does
  not reach the document, and *Restore* leaves the file holding the version's text with the document
  on screen equal to it; and the recorder holds that the restore ran `show` and **no write-verb at
  all** (`init`, `add`, `commit` absent for that action). `versioning-list-empty.js`'s sibling
  covers "this version is what you have now".
