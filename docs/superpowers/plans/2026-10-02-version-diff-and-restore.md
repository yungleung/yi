# Seeing a Version and Going Back to It — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** the reader can open any version of the note in hand, see the whole note with the changes
marked, and put that version back — without the app ever writing to their repository.

**Architecture:** one more git *read* (`git show <revision>:<path>`, with each history row carrying
the name the file had at its commit), one pure rule (`services/text_diff.ts`: two texts → the whole
document as a line stream with `same`/`removed`/`added`), a sheet over the editor that takes the
keyboard while it is open (`ui/versioning/version_diff_view.ts`), and one new session entry point
(`openVersion`: the file is written atomically and the document on screen becomes that text).

**Tech Stack:** Rust (`std::process::Command`), TypeScript (strict), daisyUI, the content shell's
own styling, the Tauri MCP bridge for probes.

**Spec:** `docs/superpowers/specs/2026-10-02-version-diff-and-restore-design.md` — its rules table is
the authority; read it with this plan.

## Global Constraints

- **The whole text is shown** — one line stream of the entire note, unchanged lines once, removals
  and additions in place, each marked. The equal ends are trimmed only to *compute* the change.
- **A restore writes the file and nothing else**: no `checkout`, no index, no `add`, no `commit`, no
  `reset`. The reader's staged work stays staged; a version is still only made when they ask.
- **The restore asks one question, with a cancel that changes nothing** — *restore this version?*,
  through the app's own prompt, so Escape is the cautious answer; nothing is kept for the reader.
- **The sheet takes the keyboard** while it is open (typing must not reach a document nobody can
  see) and is deliberately *not* a `FloatingSurface`; closing it leaves the caret, the selection and
  the scroll exactly as they were.
- The diff compares a version against **the text on screen**, snapshotted when the sheet opens; any
  row may be opened; never two versions against each other.
- The git vocabulary is three writes and the reads it already has, plus this one `show`; the
  never-list is unchanged and `versioning-fake-git.js` holds it.
- Every new string goes into **all eight catalogues**; `npm run check` must stay green (a new check
  file takes the count to **39/39**).
- `npx tsc --noEmit` silent, `npm run check` green and `cargo test` green after every task; probes
  need the app running and its window in front, each inside the bridge's 5 s.
- Commit style `type(scope): subject`; work on `codex/versioning`; **do not merge**.

---

### Task 1: each row's own path, and a version's text

**Files:** `src-tauri/src/versioning.rs`, `src/api/versioning.ts`, `src/services/versioning.ts`,
`test/probes/versioning-fake-git.js`

**Interfaces:** `Version` gains `path: string` (repo-relative, the name at that commit);
`versioningVersionText(workspace, revision, path): Promise<string>`.

- [x] **Step 1: The failing Rust test** (the parse, and the guards):

```rust
    #[test]
    fn a_row_carries_the_name_the_file_had_at_that_commit() {
        let output = "\u{1e}abc\u{0}1790855254\u{0}The note · 2026-10-01 20:15\u{0}why\n\nrenamed.md\n\
                      \u{1e}def\u{0}1790855300\u{0}first\u{0}\n\nnote.md\n";
        let rows = versions_from(output);
        assert_eq!(rows.len(), 2, "{rows:?}");
        assert_eq!(rows[0].path, "renamed.md");
        assert_eq!(rows[0].body, "why");
        assert_eq!(rows[1].path, "note.md");
    }

    #[test]
    fn a_revision_or_path_that_could_be_an_option_is_refused() {
        assert!(version_text_arguments("--upload-pack=x", "note.md").is_err());
        assert!(version_text_arguments("abc123", "/etc/passwd").is_err());
        assert!(version_text_arguments("abc123", "../note.md").is_err());
        assert_eq!(
            version_text_arguments("abc123", "notes/note.md").unwrap(),
            "abc123:notes/note.md"
        );
    }
```

- [x] **Step 2: Run it, expect failure** — `cd src-tauri && cargo test versioning` fails to compile
  (`no field path`, `cannot find function version_text_arguments`).

- [x] **Step 3: The rows carry their path** — in `versioning.rs`: `Version` gains
  `pub path: String`; the format becomes `const VERSION_FORMAT: &str = "%x1e%H%x00%at%x00%s%x00%b";`
  (the separator leads, so the path git prints *after* the format belongs to the same record), the
  call gains `--name-only`, and the parser reads four NUL-separated fields and then the path from
  what is left:

```rust
fn versions_from(output: &str) -> Vec<Version> {
    output
        .split('\u{1e}')
        .filter(|record| !record.trim().is_empty())
        .filter_map(|record| {
            let mut fields = record.split('\u{0}');
            let hash = fields.next()?;
            let at = fields.next()?.trim().parse().ok()?;
            let subject = fields.next()?;
            // The rest is the body, then the blank line `--name-only` leaves and the name itself:
            // the name is the last line, and everything before it is the body.
            let rest = fields.next().unwrap_or("");
            let (body, path) = match rest.trim_end().rsplit_once('\n') {
                Some((body, name)) => (body.trim_end(), name.trim()),
                None => ("", rest.trim()),
            };
            Some(Version {
                hash: hash.to_string(),
                at,
                subject: subject.to_string(),
                body: body.to_string(),
                path: path.to_string(),
            })
        })
        .collect()
}
```

- [x] **Step 4: The version's text** — the guard and the call, beside `read_versions`:

```rust
/// `git show <revision>:<path>`, with both halves checked first: this is the one place a caller's
/// string becomes part of a git *revision expression*, so an argument that could be read as an
/// option is refused rather than passed along.
fn version_text_arguments(revision: &str, path: &str) -> Result<String, String> {
    let hash = revision.trim();
    if hash.len() < 4 || hash.len() > 40 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("That is not a version this app can read.".to_string());
    }
    let name = path.trim();
    if name.is_empty() || name.starts_with('/') || name.starts_with('-') || name.contains("..") {
        return Err("That is not a file this app can read from a version.".to_string());
    }
    Ok(format!("{hash}:{name}"))
}

fn read_version_text(git: &Path, workspace: &Path, revision: &str, path: &str) -> Result<String, String> {
    let expression = version_text_arguments(revision, path)?;
    let output = Command::new(git)
        .arg("-C")
        .arg(workspace)
        .args(["show", &expression])
        .output()
        .map_err(|error| format!("Could not run {}: {error}", git.display()))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    // A version whose bytes are not text is refused, never lossily rewritten.
    String::from_utf8(output.stdout).map_err(|_| "This version is not text.".to_string())
}

#[tauri::command]
pub fn versioning_version_text(
    workspace: String,
    revision: String,
    path: String,
) -> Result<String, String> {
    let git = git_to_run()?;
    read_version_text(&git, Path::new(&workspace), &revision, &path)
}
```

  (This one needs `Command` directly rather than `run_git` because its output is **bytes** — a
  restore must not corrupt a file — and it says so in the comment. Register the command in
  `lib.rs`.)

- [x] **Step 5: The vocabulary test learns it** — in the `vocabulary` module, after the read:

```rust
            read_version_text(&git, &workspace, "abc123", "note.md").unwrap();
```

  with `--version-text` asserted on the tenth line (`show abc123:note.md`, and no never-list word).

- [x] **Step 6: The seam** — `src/api/versioning.ts` gains
  `versioningVersionText(workspace, revision, path): Promise<string>` (`invoke('versioning_version_text', …)`),
  and `src/services/versioning.ts`'s `Version` gains `path: string` (repo-relative, the name at that
  commit).

- [x] **Step 7: The recorder sees both** — in `test/probes/versioning-fake-git.js`, after the
  existing history read, assert the log line now carries `--name-only` (update the exact string it
  compares), then ask for a version's text and assert the line
  `git -C <folder> show abc123:note.md`:

```js
    const text = await versioningVersionText(folder, 'abc123', 'note.md');
    const afterText = (await read(`${folder}/argv.log`)).trim().split('\n');
    check(
      'and a version’s text is read from that revision and name',
      text === '' && afterText[4] === `git -C ${folder} show abc123:note.md`,
      { text, line: afterText[4] ?? null }
    );
```

  (the recorder answers nothing, so the text is empty and the *arguments* are the evidence).

- [x] **Step 8: Verify and commit** — `cargo test`, `npx tsc --noEmit`, `npm run check`, the probe,
  then `git commit -m "feat(versioning): a version's text, from the name it had then"`.

### Task 2: the diff rule

**Files:** create `src/services/text_diff.ts`, `test/checks/check-text-diff.mjs`

**Interfaces:** `textDiff(before: string, after: string, cap: number): DiffLine[]` with
`type DiffLine = { kind: 'same' | 'removed' | 'added'; text: string }`.

- [x] **Step 1: The failing check** — `check-text-diff.mjs` bundles the module (the rolldown
  pattern) and walks: equal texts (all `same`), an insertion, a deletion, a rewrite in the middle,
  an empty `before` (all `added`), an empty `after` (all `removed`), a text with no trailing
  newline, and a middle longer than the cap answering one `removed`/`added` pair whose text says
  `N lines replaced`. Each case prints `expected`/`actual` like the other checks.

- [x] **Step 2: Run it, expect failure** (`Cannot find module`).

- [x] **Step 3: The rule** — `src/services/text_diff.ts`:

```ts
/**
 * Two texts, as one line stream for a reader: the whole document, with what changed marked.
 *
 * The equal first and last lines are trimmed only to *compute* the change — they come back as
 * `same` lines — and the differing middle is diffed line by line. When that middle is past the cap
 * the rule stops being clever and names the change instead ("N lines replaced"), so a 300 KB note
 * cannot make the sheet chew. May import: nothing. Upholds: what it answers covers both texts
 * line for line, in order, and never drops an unchanged line.
 */

export type DiffKind = 'same' | 'removed' | 'added';
export interface DiffLine {
  kind: DiffKind;
  text: string;
}

export function textDiff(before: string, after: string, cap: number): DiffLine[] {
  const oldLines = lines(before);
  const newLines = lines(after);
  let head = 0;
  while (head < oldLines.length && head < newLines.length && oldLines[head] === newLines[head]) {
    head += 1;
  }
  let tail = 0;
  while (
    tail < oldLines.length - head &&
    tail < newLines.length - head &&
    oldLines[oldLines.length - 1 - tail] === newLines[newLines.length - 1 - tail]
  ) {
    tail += 1;
  }
  const oldMiddle = oldLines.slice(head, oldLines.length - tail);
  const newMiddle = newLines.slice(head, newLines.length - tail);
  const same = (text: string): DiffLine => ({ kind: 'same', text });
  const stream: DiffLine[] = oldLines.slice(0, head).map(same);
  if (oldMiddle.length + newMiddle.length > cap) {
    stream.push({ kind: 'removed', text: `${oldMiddle.length} lines replaced` });
    stream.push({ kind: 'added', text: `${newMiddle.length} lines replaced` });
  } else {
    // A plain longest-common-subsequence over the middle: these are the only lines whose order can
    // be in question, and the cap keeps it small.
    for (const step of middleDiff(oldMiddle, newMiddle)) {
      stream.push(step);
    }
  }
  for (const line of oldLines.slice(oldLines.length - tail)) {
    stream.push(same(line));
  }
  return stream;
}
```

  with `lines(text)` (a trailing newline does not make an extra empty line), `middleDiff` (the LCS
  walk answering `same`/`removed`/`added`), and `must not exceed` the cap's meaning written in a
  comment.

- [x] **Step 4: Run it, expect success** — `npm run check` green at **39/39**.

- [x] **Step 5: Commit** — `git commit -m "feat(versioning): two texts, as one line stream"`.

### Task 3: the sheet

**Files:** create `src/ui/versioning/version_diff_view.ts`; modify `versions_panel.ts` (a row press),
`src/main.ts` (mount it in the content shell), `locales/*.json`

**Interfaces:** consumes `textDiff` (Task 2) and `versioningVersionText` (Task 1); produces
`versionDiffView.show({ revision, path, stamp })`.

- [x] **Step 1: The sheet** — `version_diff_view.ts`, in this shape (the header comment is written
  out because it carries the one decision that keeps this out of the floating family):

```ts
/**
 * One version of the note on screen, whole, with what changed marked — a mode, not a floating
 * surface.
 *
 * It covers the editor's area and **keeps the keyboard while it is open**: the editor's caret stays
 * alive behind it (`FloatingSurface`'s rule is that a surface never takes the focus, which is right
 * for a question asked mid-gesture and wrong for this — a keystroke reaching a document nobody can
 * see is worse than a modal). Escape closes it; the caret, the selection and the scroll are the
 * session's and are never touched here.
 *
 * What it shows is `services/text_diff.ts`: the whole note, one row per line, removals and
 * additions marked. It opens at the first change, not at the top.
 *
 * May import: the session, the versioning seam, the diff rule and the catalogue. Upholds: the text
 * it shows is a snapshot of the version and the screen taken when it opened; nothing it does writes
 * to the repository.
 */

class VersionDiffView {
  private readonly element: HTMLDivElement; // absolute inset-0 z-40, base-100, flex column
  private readonly title: HTMLSpanElement;  // "Version of <stamp>"
  private readonly body: HTMLDivElement;    // flex-1 overflow-auto, one row per line

  async show(version: { revision: string; path: string; stamp: string }): Promise<void> {
    const document = documentSession.current();
    const workspace = configManager.get()?.workspace ?? null;
    if (document?.path == null || workspace === null) return;
    this.title.textContent = t('version.diff.version', { stamp: version.stamp });
    this.render([{ kind: 'same', text: '' }]);
    this.open();
    const [before, after] = await Promise.all([
      versioningVersionText(workspace, version.revision, version.path),
      Promise.resolve(document.content)
    ]);
    this.render(textDiff(before, after, DIFF_CAP));
    this.revealFirstChange();
  }
  …
}

export const versionDiffView = new VersionDiffView();
```

  Rows are `div`s with `data-version-diff-line` and `data-version-diff-kind`, the text in the source
  styling (`whitespace-pre-wrap font-mono text-xs`), removals and additions tinted with the
  `--md-source-*` palette; the header holds the title, a ✕ (`data-version-diff-close`) and the
  restore button (`data-version-diff-restore`, added in Task 4); an all-`same` stream shows
  `t('version.diff.none')` and no restore; Escape and ✕ close it and put the keyboard back to the
  editor's scroller. `document.querySelector`-reachable on every part.

- [x] **Step 2: Rows open it** — in `versions_panel.ts`, a row's press calls
  `versionDiffView.show({ revision: version.hash, path: version.path, stamp: version.stamp })` and
  closes the panel; give the row `data-version-open` so a probe presses it the way a reader does.

- [x] **Step 3: Mounted and worded** — `main.ts` passes the content shell to the sheet (or the sheet
  appends itself to the shell on first show, as the messages do); the seven `version.diff.*` keys go
  into all eight catalogues.

- [x] **Step 4: The probe** — create `test/probes/versioning-diff.js`: a folder of its own with a
  repository, two versions of a note (the second changing a line in the middle), consent, the note
  opened and the panel opened; then: press the first row, assert the sheet is up, that
  `[data-version-diff-line]` holds **every line of the note** (both texts' line count, unchanged
  lines once), that the changed lines carry `removed`/`added`, that a keystroke while the sheet is
  open does not change the document's text, and that Escape closes it and leaves the document as it
  was.

- [x] **Step 5: Verify and commit** — as usual, then
  `git commit -m "feat(versioning): a version, whole, with what changed marked"`.

### Task 4: going back to it

**Files:** modify `src/services/session.ts` (`openVersion`), `version_diff_view.ts` (the button),
create `test/probes/versioning-restore.js`

**Interfaces:** `documentSession.openVersion(path: string, content: string): Promise<void>`.

- [x] **Step 1: The session's own way in** — in `session.ts`, beside `openFile` (the names below are
  the ones already in that file: `ask`, `capture`, `openInto`, `keyFor`, `show`, `announce`,
  `persist`, `eventManager`, `MESSAGE_EVENT`, `t`, `writeTextAtomically`):

```ts
  /**
   * A version's text, adopted: the reader asked for it, so the file is written with it and the
   * document on screen becomes it — after the same question every replacement asks, because what is
   * on screen is about to be lost (`openDecision`). The old text goes to the stack or is let go by
   * the reader's own answer; nothing else in the session moves.
   */
  async openVersion(path: string, content: string): Promise<void> {
    const onScreen = this.current();
    let keep = false;
    if (onScreen && onScreen.content !== onScreen.saved) {
      keep = await this.ask({
        title: t('session.askOpen.title'),
        message: t('session.askOpen.message', { title: onScreen.title }),
        yes: t('session.askOpen.yes'),
        no: t('session.askOpen.no')
      });
      // The document being left keeps its latest text, whether or not it is kept in the stack.
      this.capture();
    }
    try {
      await writeTextAtomically(path, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void eventManager.emit(MESSAGE_EVENT, {
        text: t('session.saveFailed', { title: this.current()?.title ?? path, message })
      });
      return;
    }
    const id = keyFor(path, content, () => `${this.run}-${++this.madeKeys}`);
    this.state = openInto(this.state, { path, content }, id, keep);
    const opened = this.current();
    if (opened) {
      this.show(opened);
    }
    this.announce();
    await this.persist();
  }
```

  The write happens **before** `openInto`, so a failed write leaves the document exactly as it was;
  and the session's own `openDecision` is deliberately not consulted a second time — the reader was
  asked once, here, and `openInto` is given that answer as `keep`.

- [x] **Step 2: The button** — the sheet's *Restore This Version* calls
  `documentSession.openVersion(document.path, versionText)`, then closes the sheet.

- [x] **Step 3: The probe** — create `test/probes/versioning-restore.js`: the same setup as
  `versioning-diff.js`, then: with the text on screen *edited*, restore an older version and answer
  the session's question ("push and open") → the file holds the version's text, the document on
  screen is that text, its id is the stack's head, and the app says *Saved*; and with the recorder
  pointed at the same run, the log holds `show <rev>:<path>` for the restore and **no `add`, no
  `commit`, no `checkout`** — a restore is a file write and nothing else. Put the seam back in the
  `finally`, as `versioning-no-git.js` does.

- [x] **Step 4: Verify and commit** — `cargo test`, `npm run check`, `npx tsc --noEmit`, both
  probes, then `git commit -m "feat(versioning): restore a version, and nothing but the file"`.

### Task 5: the guides

**Files:** `docs/ai-context.md`, `docs/architecture.md`, `docs/roadmap.md`, `test/README.md`

- [x] **Step 1:** ai-context: the sheet (a mode that takes the keyboard, why it is not a floating
  surface), the whole-text rule, and the restore's shape (the file, never the repository).
- [x] **Step 2:** architecture: a row for "seeing a version and going back to it" (the read, the
  rule, the sheet, the session's `openVersion`).
- [x] **Step 3:** roadmap: the Closed entry with the measured facts — `--follow --name-only` giving
  the name per commit, `git show` failing with the wrong name, the whole-text decision — and the
  check/probe counts.
- [x] **Step 4:** test/README: the new check row (39 checks now), the two probes, and the count
  (137 → 139).
- [x] **Step 5: Verify and commit** — `npm run check`, then
  `git commit -m "docs: seeing a version, and going back to it"`.

## Self-review

- Spec §1 → Task 1. §2 → Task 2. §3 → Task 3. §4 → Task 3 (the sheet) and Task 4 (the restore, the
  session's way in). §5 → Tasks 3 and 4 (the words). §6 → nothing to build, deliberately: the
  never-list is held by the recorder in Task 4. Testing → the new check (Task 2), the Rust tests
  (Task 1) and the two probes (Tasks 3 and 4).
- One type carried through every task: `Version` (with `path`), `DiffLine`, and
  `textDiff(before, after, cap)`.

## Handoff

**State.** All five tasks are done, on `codex/versioning`, and the branch is **not merged** — the
reader reviews. `npm run check` 39/39, `cargo test` 35/35, `npx tsc --noEmit` silent, and the
thirteen versioning probes green (0.1–3.9 s each, window in front).

**What the writing found.** A document with a file is keyed by its **path**
(`document_identity.ts: documentId` → `readFrontmatterId ?? firstIdDigits ?? path`), so a restore is
*not* "open another document": `openInto` sees the same id and brings the existing document forward,
leaving the old text on screen (measured: the file held the version's text while the document still
held `the now`). `openVersion` therefore replaces that document's text — content, `saved`, title,
view. And the first cut asked the *session's* question on restore ("push it to the stack, or open
without it"), which the reader corrected: that question is about opening another document, and
neither answer means *"I did not mean to press that"*. It asks one thing now — *restore this
version?*, through the app's own prompt, so Escape and Cancel change **nothing at all** — and
nothing is kept for the reader.

**The full suite at hand-off:** 116/124 (15 skipped). Seven red are this machine's long-standing
tail, none version-related: `completion-wikilink` and the three `document-stack` probes (green with
the app pointed at the fixtures), `edit-cost` and `edit-stability` (the window and bridge-budget
pair) and `insert-rule`'s `atEnd` (the caret bug the roadmap records as older than the phases). The
one versioning red in that run, `versioning-no-git.js`, passes alone and beside its neighbours; its
`open` helper now waits for the session's card instead of sleeping at it.

**Out of scope, deliberately:** comparing two arbitrary versions, editing inside the diff, a
whole-workspace restore, binary versions, and pushing.
