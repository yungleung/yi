# A Note's Own Versions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** the reader can see, without leaving the app, the newest version of the note on screen and
the list behind it — and may name a version with their own words when they save one.

**Architecture:** one Rust read of git history (`versioning.rs`, through the existing `run_git`),
one living list in the frontend (`services/versions.ts`) that reads it only when the reader has
agreed to versions in this workspace, a status-bar button and its panel drawing that list
(`ui/versioning/`), and a card in the save flow that turns an optional comment into the commit's
body.

**Tech Stack:** Rust (`std::process::Command`), TypeScript (strict), daisyUI, the `QuestionCard` /
`AnchoredPanel` family, the Tauri MCP bridge for probes.

**Spec:** `docs/superpowers/specs/2026-10-02-document-versions-design.md` — the rules table is the
authority; read it with this plan.

## Global Constraints

- **A version is a commit that touched the file**, whoever wrote it; the repository is the truth and
  the list shows the message exactly as `git log` does (the subject's own stamp repeated on a row is
  accepted, not trimmed).
- **No git read while consent for this workspace is off** — the button is hidden then, decided from
  the config alone (`services/versioning.ts: versionsVisible`), and a probe holds that no `log` call
  is made.
- **The git vocabulary is four calls**: `init`, `add`, `commit` (writes) and `log` (a read), every
  one of them through `run_git`. The never-list is unchanged: no `fetch`, `pull`, `gc`, `clean`,
  `reset`, `checkout`, `switch`, `amend`, force, hooks or credentials.
- **The subject never changes**: `versionMessage(name, at, comment)` still answers
  `<title> · YYYY-MM-DD HH:MM` as the subject, and the trimmed comment (or nothing) as the body.
- **The stamp is local** `YYYY-MM-DD HH:MM` in the reader's own time — `versionStamp`, one home.
- **Rows are read-only**: nothing in the panel acts; restoring is out of scope.
- **The comment card has no native hand** (no system surface answers with a line of text); Escape
  cancels the version.
- Every new string goes into **all eight catalogues** (`locales/*.json`); `npm run check` (which
  includes `check-locales.mjs`) must stay green.
- `npx tsc --noEmit` silent, `npm run check` green and `cargo test` green after **every** task; a
  behaviour change names the check or probe that proves it.
- Probes need `npm run tauri dev` (bridge on 9223) and the app's window **in front** (an occluded
  window is throttled — `test/README.md`); each probe must fit the bridge's 5 s on its own. A probe
  that writes works in a folder of its own under `$HOME` and restores the config **and** the session.
- Commit style `type(scope): subject`, lower case, imperative; work on `codex/versioning`; **do not
  merge** — the reader reviews.

## File Structure

| File | What it owns |
| --- | --- |
| `src-tauri/src/versioning.rs` | the four git calls, the `Version` rows, the body on a commit (modified) |
| `src/api/versioning.ts` | the webview's seam to them: `versioningHistory`, `commitPaths`'s body (modified) |
| `src/services/versioning.ts` | the pure rules: `versionStamp`, `versionMessage`, `versionsVisible`, `versionsState`, and the `Version` / `VersionsState` types (modified) |
| `src/services/versions.ts` | the living list: `versionsOfDocument`, `VERSIONS_CHANGED` (new) |
| `src/ui/versioning/versions_panel.ts` | the panel and its rows (new) |
| `src/ui/versioning/version_status.ts` | the status-bar button, hosting the panel (new) |
| `src/ui/versioning/version_comment_dialog.ts` | the card that asks for a version's comment (new) |
| `src/ui/versioning/save_version.ts` | the flow: ask for the comment, commit subject and body (modified) |
| `src/ui/toolbar/toolbar.ts`, `src/ui/toolbar/layout_toolbar.ts` | the one 20 px status-button constant (modified) |
| `src/main.ts` | the button mounted at the left of the status bar (modified) |
| `locales/*.json` | nine keys, eight languages (modified) |
| `test/checks/check-versioning.mjs` | the stamp, the message rule, visibility, the list's states (modified) |
| `test/probes/versioning-fake-git.js`, `versioning-save.js`, `versioning-staged.js` | the recorder learns the fourth call and the two `-m`s; the save probes answer the card (modified) |
| `test/probes/versioning-status.js`, `versioning-list.js` | the button and the panel in the app (new) |

---

### Task 1: a version can carry a comment

**Files:**
- Modify: `src/services/versioning.ts` (the message rule)
- Modify: `src-tauri/src/versioning.rs` (`commit_paths` / `commit_at`, the vocabulary test)
- Modify: `src/api/versioning.ts`, `src/ui/versioning/save_version.ts`
- Test: `test/checks/check-versioning.mjs`

**Interfaces:**
- Produces: `versionStamp(at: number): string`, `versionMessage(name: string, at: Date, comment: string): { subject: string; body: string | null }`, and `commitPaths(workspace, paths, message, identity, body: string | null)`.

- [ ] **Step 1: The failing check** — in `test/checks/check-versioning.mjs`, replace the message case
  with the stamp's and the three that follow it:

```js
check('a version is stamped in the reader’s own time', versionStamp(Date.UTC(2026, 9, 1, 12, 5) / 1000), '2026-10-01 20:05');
check(
  'a version without a comment is the message it always was',
  versionMessage('A note', new Date(2026, 9, 1, 9, 5), ''),
  { subject: 'A note · 2026-10-01 09:05', body: null }
);
check(
  'and a comment is the body, trimmed, the subject untouched',
  versionMessage('A note', new Date(2026, 9, 1, 9, 5), '  why I rewrote it  '),
  { subject: 'A note · 2026-10-01 09:05', body: 'why I rewrote it' }
);
check(
  'a comment of nothing but spaces is no comment',
  versionMessage('A note', new Date(2026, 9, 1, 9, 5), '   '),
  { subject: 'A note · 2026-10-01 09:05', body: null }
);
```

  The stamp answers local time, so the check pins the zone it runs in: after the imports at the top
  of the file, add

```js
// The stamp is the reader's local time, so the check pins the zone it runs in.
process.env.TZ = 'UTC';
```

  and import `versionMessage` and `versionStamp` from the bundle beside `consentFrom`.

- [ ] **Step 2: Run it, expect failure** — `npm run check` must fail: `versionStamp is not defined`
  (the bundler leaves the missing export undefined).

- [ ] **Step 3: The rule** — in `src/services/versioning.ts` replace `versionMessage` with:

```ts
/** When a version was made, as `YYYY-MM-DD HH:MM` in the reader's own time. */
export function versionStamp(at: number): string {
  const when = new Date(at * 1000);
  const two = (value: number) => String(value).padStart(2, '0');
  const date = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`;
  return `${date} ${two(when.getHours())}:${two(when.getMinutes())}`;
}

/**
 * The message a version carries: the note's own name and the minute it was asked for as the
 * subject — so `git log --oneline` and the app's own list read alike — and the reader's comment as
 * the body when they gave one.
 */
export function versionMessage(
  name: string,
  at: Date,
  comment: string
): { subject: string; body: string | null } {
  const said = comment.trim();
  return {
    subject: `${name} · ${versionStamp(Math.floor(at.getTime() / 1000))}`,
    body: said === '' ? null : said
  };
}
```

- [ ] **Step 4: The commit's body** — in `src-tauri/src/versioning.rs`, give `commit_at` a body and
  send it as a second `-m` (the identity arguments above it are unchanged):

```rust
fn commit_at(
    git: &Path,
    workspace: &Path,
    paths: &[String],
    message: &str,
    body: Option<&str>,
    identity: Option<Identity>,
) -> Result<(), String> {
    // … the identity arguments as they are …
    let mut commit = identity_arguments;
    commit.push("commit".to_string());
    commit.push("-m".to_string());
    commit.push(message.to_string());
    if let Some(body) = body.filter(|body| !body.trim().is_empty()) {
        commit.push("-m".to_string());
        commit.push(body.to_string());
    }
    commit.push("--".to_string());
    commit.extend(paths.iter().cloned());
    run_git(git, workspace, &commit).map(|_| ())
}

#[tauri::command]
pub fn commit_paths(
    workspace: String,
    paths: Vec<String>,
    message: String,
    body: Option<String>,
    identity: Option<Identity>,
) -> Result<(), String> {
    let git = git_to_run()?;
    commit_at(&git, Path::new(&workspace), &paths, &message, body.as_deref(), identity)
}
```

- [ ] **Step 5: The vocabulary test learns the body** — in the `vocabulary` test module, after the
  two commits it already makes, add

```rust
            commit_at(&git, &workspace, &[note.clone()], "with a body", Some("why"), None).unwrap();
```

  and move the assertions on: eight lines — a commit is two calls, `add` and `commit` — the last one

```rust
            assert_eq!(recorded.len(), 8, "{recorded:?}");
            assert!(recorded[7].contains(" commit -m a named version -m why I rewrote it -- "), "{}", recorded[7]);
```

- [ ] **Step 6: The seam and the flow** — `src/api/versioning.ts`:

```ts
export async function commitPaths(
  workspace: string,
  paths: string[],
  message: string,
  identity: GitIdentity | null,
  body: string | null = null
): Promise<void> {
  await invoke('commit_paths', { workspace, paths, message, identity, body });
}
```

  and in `src/ui/versioning/save_version.ts`:

```ts
    const message = versionMessage(saved.title, new Date(), '');
    await commitPaths(
      workspace,
      [saved.path],
      message.subject,
      plan.use === 'theirs' ? null : APP_IDENTITY,
      message.body
    );
```

  The probes that call `commitPaths` directly (`versioning-save.js`, `versioning-staged.js`,
  `versioning-repository.js`, `versioning-outer.js`) keep working: `body` has a default.

- [ ] **Step 7: Verify and commit** — `npx tsc --noEmit` silent, `npm run check` green,
  `cd src-tauri && cargo test` green, then
  `git commit -m "feat(versioning): a version can carry a comment"`.

### Task 2: the card that asks for it

**Files:**
- Create: `src/ui/versioning/version_comment_dialog.ts`
- Modify: `src/ui/versioning/save_version.ts`, `locales/*.json`
- Test: `test/probes/versioning-save.js`, `test/probes/versioning-staged.js`, `test/probes/versioning-fake-git.js`

**Interfaces:**
- Consumes: `versionMessage` (Task 1).
- Produces: `versionCommentDialog.ask(): Promise<string | null>` — the comment as typed, or `null`
  when the reader cancelled (Escape and the cancel button both answer `null`); and the second
  parameter of `saveVersion(chooser?, commentDialog?)`.

- [ ] **Step 1: The card** — create `src/ui/versioning/version_comment_dialog.ts`:

```ts
/**
 * Asking what to call the version about to be saved.
 *
 * The question has **one hand**, unlike the app's other questions: no system surface answers with a
 * line of text (`ui/image/image_dialog.ts` has no native twin for the same reason). So this is a
 * card for a reader and for a probe both, with a field that carries the caret when it opens, Enter
 * or the button saving with what is typed, and Escape answering the cautious way — *no version at
 * all*, since a reader who cancels here has asked for nothing else.
 *
 * The card is cleared before every question (`question_card.ts: askWith`), so `ask` re-appends what
 * this kind is made of — the same shape `new_document_dialog.ts` and `ui/prompt.ts` use — and only
 * then takes the caret, once the card is unhidden.
 *
 * May import: the question card and the catalogue. Upholds: one question, one answer — the comment
 * as typed, or null — so the flow cannot write a version nobody answered for.
 */

import { t } from '../../services/i18n';
import { QuestionCard } from '../floating/question_card';

export class VersionCommentDialog extends QuestionCard<string | null> {
  private readonly heading: HTMLParagraphElement;
  private readonly label: HTMLLabelElement;
  private readonly field: HTMLInputElement;
  private readonly form: HTMLFormElement;
  private readonly save: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;

  constructor() {
    super('w-[26rem]');
    this.element.dataset.versionComment = 'true';

    this.heading = document.createElement('p');
    this.heading.className = 'mb-1 text-sm font-semibold';
    this.heading.setAttribute('data-version-comment-title', 'true');
    this.label = document.createElement('label');
    this.label.className = 'label-text text-xs';
    this.label.setAttribute('data-version-comment-label', 'true');
    this.field = document.createElement('input');
    this.field.type = 'text';
    this.field.className = 'input input-bordered input-sm w-full';
    this.field.setAttribute('data-version-comment-field', 'true');
    this.field.setAttribute('spellcheck', 'false');

    this.form = document.createElement('form');
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.settle(this.field.value);
    });
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    this.cancel = this.button('version-comment-cancel', 'btn btn-ghost btn-sm', 'button', () =>
      this.settle(null)
    );
    this.save = this.button('version-comment-save', 'btn btn-primary btn-sm', 'submit', () => {});
    actions.append(this.cancel, this.save);
    this.form.append(this.label, this.field, actions);
  }

  /** Escape is the answer that does not act: no version. */
  protected cautious(): string | null {
    return null;
  }

  /** Asks, with the caret in the field so the comment is typed straight away. */
  async ask(): Promise<string | null> {
    const answered = this.askWith(() => {
      this.heading.textContent = t('version.comment.title');
      this.label.textContent = t('version.comment.label');
      this.save.textContent = t('version.comment.save');
      this.cancel.textContent = t('version.comment.cancel');
      this.field.value = '';
      this.card.append(this.heading, this.form);
    });
    this.field.focus();
    this.field.select();
    return await answered;
  }

  private button(
    name: string,
    className: string,
    type: 'button' | 'submit',
    onPress: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = type;
    button.className = className;
    // By attribute, not by `dataset`: a key with a hyphen in it is a SyntaxError in WebKit.
    button.setAttribute(`data-${name}`, 'true');
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', onPress);
    return button;
  }
}

/** The app's version comment question. One per app. */
export const versionCommentDialog = new VersionCommentDialog();
```

- [ ] **Step 2: The flow asks it** — in `save_version.ts`, add the import, the port and the step. The
  signature becomes

```ts
export async function saveVersion(
  chooser: VersioningChooser = versioningDialog,
  comments: VersionCommentDialog = versionCommentDialog
): Promise<void> {
```

  and the step goes after the “no file” refusal, before the write:

```ts
  const comment = await comments.ask();
  if (comment === null) {
    return;
  }
```

  with the commit at the end passing both halves:
  `const message = versionMessage(saved.title, new Date(), comment);` … `message.body`.

- [ ] **Step 3: The words, in eight catalogues** — add to every `locales/*.json` (English written
  here; the other seven translate the same sentences in the voice of the `version.*` keys beside
  them, and `check-locales.mjs` fails until all eight carry them):

```json
  "version.comment.title": "Save a Version",
  "version.comment.label": "A note about this version (optional)",
  "version.comment.save": "Save the Version",
  "version.comment.cancel": "Cancel",
```

- [ ] **Step 4: Every probe that saves answers the card** — in `test/probes/versioning-save.js`,
  `versioning-staged.js`, `versioning-repository.js` and `versioning-outer.js` (the four that drive
  a save; the fake-git probe's own phase is step 5), add beside the version helper — the card's
  *field* is in the page from the moment the module loads, so only the veil's own class says a
  question is being asked:

```js
  /** Answers the comment card a save raises, with the comment given. */
  const answerComment = async (comment) => {
    // The card's field is in the page from the moment the module loads, so only the veil's own
    // class says a question is being asked — waiting on the field clicks a card that is not up.
    const up = () => {
      const shown = document.querySelector('[data-version-comment]');
      return shown !== null && !shown.classList.contains('hidden') ? shown : null;
    };
    for (let attempt = 0; attempt < 60 && up() === null; attempt += 1) {
      await t.sleep(40);
    }
    const field = document.querySelector('[data-version-comment-field]');
    if (up() === null || field === null) {
      return false;
    }
    field.value = comment;
    document.querySelector('[data-version-comment-save]')?.click();
    await t.sleep(150);
    return true;
  };
```

  In `versioning-save.js`, every `version(true)` is followed by `const commentAsked = await answerComment('')`
  once (the first one) and `await answerComment('')` for the second, and the first save's check
  becomes

```js
    check('asking for a version asks what to call it, and an empty answer is allowed', commentAsked, {
      asked: commentAsked
    });
```

  In `versioning-staged.js`, the one `saveVersion()` gets `await answerComment('')` after it.

- [ ] **Step 5: The recorder sees the body** — extend `test/probes/versioning-fake-git.js`: after it
  has read the three lines its own commands produced, drive a *save* with the recorder still pointed
  at it — open the note through the session, give the workspace consent, answer the comment card with
  `why this version`, and read the log again — then assert the new lines are exactly what that save
  makes. There are **five**: the two reads of the repository's identity that the *facts* make (the
  save gathers them first), the init (nothing has made a repository, under the recorder), the add,
  and the commit — whose subject is the document's title and the stamp, and whose body is the
  comment:

```js
    await t.openWorkspace(folder);
    await configManager.update({ versioning: true, versioning_workspace: folder });
    await open(note, 'A note to version.\n');
    const pending = saveVersion();
    const commentUp = () => {
      const shown = document.querySelector('[data-version-comment]');
      return shown !== null && !shown.classList.contains('hidden') ? shown : null;
    };
    for (let attempt = 0; attempt < 60 && commentUp() === null; attempt += 1) {
      await t.sleep(40);
    }
    const field = document.querySelector('[data-version-comment-field]');
    if (commentUp() !== null && field !== null) {
      field.value = 'why this version';
      document.querySelector('[data-version-comment-save]')?.click();
    }
    await pending;
    await t.sleep(150);
    const saved = (await read(`${folder}/argv.log`)).trim().split('\n').slice(lines.length);
    check(
      'and a version saved with a comment is committed with the comment as its body',
      saved.length === 5 &&
        saved[0].includes(' config --get user.name') &&
        saved[1].includes(' config --get user.email') &&
        saved[2].endsWith(' init') &&
        saved[3].includes(` add -- ${note}`) &&
        // The subject is the document's own title — the file's name, for a note with no
        // frontmatter — and the stamp; the comment is the second message.
        saved[4].includes(` commit -m note · `) &&
        saved[4].includes(' -m why this version -- '),
      saved
    );
```

  (`open` is the small session helper the other probes already use; the probe needs `t.openWorkspace`,
  `configManager`, `saveVersion` and the session imported, and — because it now changes the app's
  config and session — the `before`/`sessionText` capture and the `finally` that puts both back.)

- [ ] **Step 6: Verify and commit** — `npm run check` green, `npx tsc --noEmit` silent, and with the
  app running and in front: `npm run probe -- test/probes/versioning-save.js`,
  `… test/probes/versioning-staged.js`, `… test/probes/versioning-fake-git.js` — all green — then
  `git commit -m "feat(versioning): a card that asks what to call a version"`.

### Task 3: the read

**Files:**
- Modify: `src-tauri/src/versioning.rs` (the `Version` rows, the `log` call, its tests)
- Modify: `src-tauri/src/lib.rs` (register the command), `src/api/versioning.ts`
- Test: `test/probes/versioning-fake-git.js`

**Interfaces:**
- Produces: the Rust `Version { hash: String, at: i64, subject: String, body: String }`, the command
  `versioning_history(workspace, path, limit)`, and the frontend's
  `versioningHistory(workspace: string, path: string, limit: number): Promise<Version[]>`.

- [ ] **Step 1: The failing test** — in `versioning.rs`'s `mod tests`, add (the fields are parsed
  from git's own output, so the test is about the parsing):

```rust
    #[test]
    fn the_rows_are_read_from_gits_own_separators() {
        let output = "abc\u{0}1790855254\u{0}The note · 2026-10-01 20:15\u{0}why I rewrote it\u{1e}\n\
                      def\u{0}1790855300\u{0}Another\u{0}\u{1e}\n";
        let rows = versions_from(output);
        assert_eq!(rows.len(), 2, "{rows:?}");
        assert_eq!(rows[0].hash, "abc");
        assert_eq!(rows[0].at, 1790855254);
        assert_eq!(rows[0].subject, "The note · 2026-10-01 20:15");
        assert_eq!(rows[0].body, "why I rewrote it");
        assert_eq!(rows[1].body, "", "a commit with no body has an empty one, not a missing field");
        assert!(versions_from("").is_empty(), "a path git has never seen answers nothing at all");
    }
```

- [ ] **Step 2: Run it, expect failure** — `cd src-tauri && cargo test versioning` fails to compile:
  `cannot find function versions_from`.

- [ ] **Step 3: The rows** — in `versioning.rs`, beside the other structs:

```rust
/// One version of a file: a commit that touched it, whoever wrote the commit.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct Version {
    pub hash: String,
    /// Unix seconds, the author's date — the one `git log` prints first, so the app's list and the
    /// reader's own `git log` agree about when a version was made.
    pub at: i64,
    pub subject: String,
    pub body: String,
}

/// What git is asked for: hash, author time, subject and body, NUL between fields and a record
/// separator between commits — a message may hold every *other* character, newlines included, and
/// a body is exactly that.
const VERSION_FORMAT: &str = "%H%x00%at%x00%s%x00%b%x1e";
/// The most rows one read may be asked for; the frontend asks for fifty.
const VERSION_LIMIT: usize = 200;

fn versions_from(output: &str) -> Vec<Version> {
    output
        .split('\u{1e}')
        .filter(|record| !record.trim().is_empty())
        .filter_map(|record| {
            let mut fields = record.trim_start_matches('\n').split('\u{0}');
            let hash = fields.next()?;
            let at = fields.next()?.trim().parse().ok()?;
            Some(Version {
                hash: hash.to_string(),
                at,
                subject: fields.next()?.to_string(),
                body: fields.next().unwrap_or("").trim().to_string(),
            })
        })
        .collect()
}
```

- [ ] **Step 4: The call, and the command** — also in `versioning.rs` (it goes through `run_git`, the
  one helper, like every other call; the absolute path the session hands over works with `--follow`,
  measured):

```rust
/// The versions of one file, newest first: the commits that touched it.
fn read_versions(git: &Path, workspace: &Path, path: &str, limit: usize) -> Result<Vec<Version>, String> {
    // A caller's number is clamped rather than trusted: a bigger one would only walk more history
    // for rows nobody reads.
    let limit = limit.clamp(1, VERSION_LIMIT);
    let output = run_git(
        git,
        workspace,
        &[
            "log".to_string(),
            "--follow".to_string(),
            format!("--max-count={limit}"),
            format!("--format={VERSION_FORMAT}"),
            "--".to_string(),
            path.to_string(),
        ],
    )?;
    Ok(versions_from(&output))
}

#[tauri::command]
pub fn versioning_history(workspace: String, path: String, limit: usize) -> Result<Vec<Version>, String> {
    let git = git_to_run()?;
    read_versions(&git, Path::new(&workspace), &path, limit)
}
```

  and register it in `src-tauri/src/lib.rs` beside the other versioning commands:
  `versioning::versioning_history,`.

- [ ] **Step 5: The vocabulary test learns the read** — in the `vocabulary` module, after the commit
  with a body, add

```rust
            read_versions(&git, &workspace, &note, 50).unwrap();
```

  and the assertions become eight lines, the last

```rust
            assert_eq!(recorded.len(), 8, "{recorded:?}");
            assert!(recorded[7].contains(" log --follow --max-count=50 --format="), "{}", recorded[7]);
            assert!(recorded[7].ends_with(&format!(" -- {note}")), "{}", recorded[7]);
```

  (the recorder answers nothing, so this also holds that an empty answer is an empty list, not an
  error).

- [ ] **Step 6: The seam** — `src/api/versioning.ts`:

```ts
/**
 * The versions of one file, newest first — one read of the repository (`git log --follow`), or an
 * empty list when git has never seen the path.
 */
export async function versioningHistory(
  workspace: string,
  path: string,
  limit: number
): Promise<Version[]> {
  return await invoke<Version[]>('versioning_history', { workspace, path, limit });
}
```

  with `Version` imported from `../services/versioning` (Task 4 defines it; if Task 4 is done second,
  the type comes from there either way — the two tasks must agree on the name).

- [ ] **Step 7: The recorder sees the read** — in `test/probes/versioning-fake-git.js`, after its
  first three lines are read, ask for the history directly and hold the fourth call:

```js
    const rows = await versioningHistory(folder, note, 50);
    const withRead = (await read(`${folder}/argv.log`)).trim().split('\n');
    check(
      'and the app reads the history of one file through the same helper',
      rows.length === 0 &&
        withRead[3] === `git -C ${folder} log --follow --max-count=50 --format=%H%x00%at%x00%s%x00%b%x1e -- ${note}`,
      { rows, line: withRead[3] ?? null }
    );
```

  (adjust the `lines` the later assertions slice from, since the log has grown by one).

- [ ] **Step 8: Verify and commit** — `cd src-tauri && cargo test` green, `npx tsc --noEmit` silent,
  `npm run check` green, `npm run probe -- test/probes/versioning-fake-git.js` green with the app in
  front, then `git commit -m "feat(versioning): the versions of one file, read once"`.

### Task 4: the two rules the UI reads

**Files:**
- Modify: `src/services/versioning.ts`
- Test: `test/checks/check-versioning.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `Version`, `VersionsState`, `versionsVisible(stored, workspace): boolean` and
  `versionsState({ path, repository, versions }): VersionsState` — the rules Task 5's service and
  Task 6's panel both read.

- [ ] **Step 1: The failing check** — in `test/checks/check-versioning.mjs`, add (with the two new
  names imported from the bundle, and one row to reuse):

```js
const row = { hash: 'abc', at: 1790855254, subject: 'A note · 2026-10-01 20:15', body: '' };
check(
  'the button belongs in the status bar where the reader agreed to versions',
  versionsVisible({ versioning: true, versioning_workspace: '/notes' }, '/notes'),
  true
);
check(
  'and nowhere else — not even a folder they once agreed about',
  versionsVisible({ versioning: true, versioning_workspace: '/notes' }, '/other'),
  false
);
check(
  'a note with no file has no versions to show',
  versionsState({ path: null, repository: true, versions: [] }),
  { kind: 'no-file' }
);
check(
  'a workspace nothing has made a repository in says so',
  versionsState({ path: '/notes/a.md', repository: false, versions: [] }),
  { kind: 'no-repository' }
);
check(
  'and otherwise the list is the versions that were read, for that path',
  versionsState({ path: '/notes/a.md', repository: true, versions: [row] }),
  { kind: 'ready', path: '/notes/a.md', versions: [row] }
);
```

- [ ] **Step 2: Run it, expect failure** — `npm run check` fails: `versionsVisible is not defined`.

- [ ] **Step 3: The rules** — in `src/services/versioning.ts`, beside the plan:

```ts
/** One version of a file: a commit that touched it, as the backend reports it. */
export interface Version {
  hash: string;
  /** Unix seconds, the author's date. */
  at: number;
  subject: string;
  body: string;
}

/** What the button and the panel have to say: nothing to show, and why. */
export type VersionsState =
  | { kind: 'no-file' }
  | { kind: 'no-repository' }
  | { kind: 'ready'; path: string; versions: Version[] };

/**
 * Whether the status bar's versions button belongs there at all: the reader's answer for *this*
 * folder, and nothing else — read from the config, so a workspace they said no to never runs git.
 */
export function versionsVisible(stored: StoredConsent, workspace: string): boolean {
  return consentFrom(stored, workspace) === 'yes';
}

/**
 * What the list is, from the three things that decide it. The fourth state, a read that failed
 * (`unreadable`), is not derived from anything — only a failed read can say it, and
 * `services/versions.ts` is where that happens.
 */
export function versionsState(input: {
  path: string | null;
  repository: boolean;
  versions: Version[];
}): VersionsState {
  if (input.path === null) {
    return { kind: 'no-file' };
  }
  if (!input.repository) {
    return { kind: 'no-repository' };
  }
  return { kind: 'ready', path: input.path, versions: input.versions };
}
```

- [ ] **Step 4: Run it, expect success** — `npm run check` green at 38/38 (the cases are added inside
  `check-versioning.mjs`, so the *count of checks* does not move).

- [ ] **Step 5: Commit** — `git commit -m "feat(versioning): whether to show the versions, and what they are"`.

### Task 5: the button, and the list behind it

**Files:**
- Create: `src/services/versions.ts`, `src/ui/versioning/version_status.ts`
- Modify: `src/ui/toolbar/toolbar.ts`, `src/ui/toolbar/layout_toolbar.ts`, `src/main.ts`,
  `locales/*.json`
- Test: `test/probes/versioning-status.js` (new)

**Interfaces:**
- Consumes: `versioningHistory` (Task 3), `versionsVisible` / `versionsState` / `versionStamp`
  (Tasks 4 and 1).
- Produces: `VERSIONS_CHANGED`, `versionsOfDocument.current(): VersionsReading`,
  `versionsOfDocument.latest(): Version | null`, `versionsOfDocument.reread(): Promise<void>`, and
  the `VersionStatus` component (Task 6's panel hangs off it).

- [ ] **Step 1: The living list** — create `src/services/versions.ts`:

```ts
/**
 * The versions of the document on screen: read from the repository, kept, and announced.
 *
 * The rules are pure (`services/versioning.ts`); this is the half that reads the disk and holds the
 * answer, the way `services/session.ts` is the living half of `document_session.ts`. Two things
 * decide whether it reads at all: the reader's answer for *this* workspace — a workspace they said
 * no to is never read, so the button can be hidden from the config alone — and whether the document
 * on screen has a file to have a history. It reads when the document changes (the *path* is the
 * question, not the text, so a keystroke costs nothing), when the workspace or the answer changes,
 * and when something asks it to (`reread`: a panel opening, a version being saved).
 *
 * May import: the versioning seam, the config, the workspace's news, the session, the events, and
 * the pure rules. Upholds: one read per fact — the path it read for is remembered, and a read that
 * was overtaken by a newer one is dropped.
 */

import { versioningFacts, versioningHistory } from '../api/versioning';
import { configManager } from './config_manager';
import { eventManager } from './event_manager';
import { DOCUMENT_SESSION_CHANGED, documentSession } from './session';
import { WORKSPACE_CHANGED } from './workspace';
import {
  versionsState,
  versionsVisible,
  type Version,
  type VersionsState
} from './versioning';

/** Emitted with the reading whenever it changes (`VersionsReading`). */
export const VERSIONS_CHANGED = 'versions_changed';

/** How many versions one read asks for — the completion list's own cap. */
const VERSIONS = 50;

/** The three states the rule answers, and the one only a failed read can give. */
export type VersionsReading = VersionsState | { kind: 'unreadable'; message: string };

class VersionsOfDocument {
  private reading: VersionsReading = { kind: 'no-file' };
  private readFor: string | null = null;
  private run = 0;

  constructor() {
    for (const event of [DOCUMENT_SESSION_CHANGED, WORKSPACE_CHANGED, 'config_changed']) {
      void eventManager.on(event, () => void this.refresh());
    }
  }

  /** What is known right now — the button and the panel draw from this and nothing else. */
  current(): VersionsReading {
    return this.reading;
  }

  /** The newest version, when there is one. */
  latest(): Version | null {
    return this.reading.kind === 'ready' ? (this.reading.versions[0] ?? null) : null;
  }

  /** Reads, unless this list was already read for the document on screen. */
  async refresh(): Promise<void> {
    const config = configManager.get();
    const workspace = config?.workspace ?? null;
    const path = documentSession.current()?.path ?? null;
    if (config === null || workspace === null || !versionsVisible(config, workspace)) {
      // No workspace, or none the reader agreed to: nothing here touches git.
      this.remember({ kind: 'no-file' }, null);
      return;
    }
    if (path === null) {
      this.remember({ kind: 'no-file' }, null);
      return;
    }
    if (path === this.readFor) {
      return;
    }
    await this.read(workspace, path);
  }

  /** Reads again, whatever the reason — the same document, a fresh answer. */
  async reread(): Promise<void> {
    this.readFor = null;
    await this.refresh();
  }

  private async read(workspace: string, path: string): Promise<void> {
    const mine = ++this.run;
    this.readFor = path;
    try {
      const facts = await versioningFacts(workspace);
      const repository = facts.repository.here || facts.repository.above;
      if (!repository) {
        this.remember({ kind: 'no-repository' }, path);
        return;
      }
      const versions = await versioningHistory(workspace, path, VERSIONS);
      if (mine === this.run) {
        this.remember(versionsState({ path, repository, versions }), path);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Reading the versions of this note:', error);
      if (mine === this.run) {
        this.remember({ kind: 'unreadable', message }, path);
      }
    }
  }

  private remember(reading: VersionsReading, path: string | null): void {
    this.readFor = path;
    const changed = JSON.stringify(reading) !== JSON.stringify(this.reading);
    this.reading = reading;
    if (changed) {
      void eventManager.emit(VERSIONS_CHANGED, reading);
    }
  }
}

/** The app's versions of the document on screen. One per app. */
export const versionsOfDocument = new VersionsOfDocument();
```

- [ ] **Step 2: One status-button size, in one place** — in `src/ui/toolbar/toolbar.ts` add, above
  `Toolbar`, the constant that `layout_toolbar.ts` keeps today (and delete it there, importing this
  one instead):

```ts
/**
 * The status bar is 17px tall on its own (a 12px word count and a hairline), so its buttons are
 * 20px rather than the 24px `btn-xs` would be — the bar grows by four pixels, and the glyphs get a
 * 16px box to be drawn in.
 */
export const STATUS_BUTTON = 'text-[1em] h-5 min-h-5 px-1';
```

- [ ] **Step 3: The button** — create `src/ui/versioning/version_status.ts`:

```ts
/**
 * The button at the left of the status bar: the newest version of the note on screen.
 *
 * It is there exactly when the reader has agreed to versions in this workspace — `versionsVisible`,
 * read from the config, so a workspace they said no to never runs git — and hidden otherwise; what
 * it *says* comes from `services/versions.ts` and nothing else. A press opens the panel (Task 6)
 * and never reaches into the list itself.
 *
 * May import: the versions service, the config, the events, the catalogue and the panel.
 * Upholds: one fact on screen — the newest version and when — drawn from the service.
 */

import { configManager } from '../../services/config_manager';
import { eventManager } from '../../services/event_manager';
import { t } from '../../services/i18n';
import { VERSIONS_CHANGED, versionsOfDocument } from '../../services/versions';
import { WORKSPACE_CHANGED } from '../../services/workspace';
import { versionStamp, versionsVisible } from '../../services/versioning';
import { STATUS_BUTTON, Toolbar } from '../toolbar/toolbar';
import { VersionsPanel } from './versions_panel';

/** The reader's own glyph: a note's version. */
const VERSION_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">' +
  '<path d="M0 0h16v16H0z" fill="none" />' +
  '<path fill="currentColor" fill-rule="evenodd" d="M8 10.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5M8 12c1.953 0 3.579-1.4 3.93-3.25h3.32a.75.75 0 0 0 0-1.5h-3.32a4.001 4.001 0 0 0-7.86 0H.75a.75.75 0 0 0 0 1.5h3.32A4 4 0 0 0 8 12" clip-rule="evenodd" />' +
  '</svg>';

export class VersionStatus extends Toolbar {
  private readonly button: HTMLButtonElement;
  private readonly label: HTMLSpanElement;
  private readonly panel: VersionsPanel;

  constructor() {
    // `relative`, so the panel hangs under the button rather than somewhere in the page.
    super(['relative', 'flex', 'items-center', 'gap-1']);
    this.panel = new VersionsPanel();

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = ['btn', 'btn-ghost', STATUS_BUTTON].join(' ');
    this.button.setAttribute('data-version-status', 'true');
    this.button.innerHTML = VERSION_ICON;
    this.label = document.createElement('span');
    this.label.className = 'ml-1 whitespace-nowrap';
    this.label.setAttribute('data-version-status-label', 'true');
    this.button.appendChild(this.label);
    // A status button never takes the focus or starts a window drag.
    this.button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.button.addEventListener('click', () => this.panel.toggle());
    this.element.append(this.button, this.panel.element);

    void eventManager.on(VERSIONS_CHANGED, () => this.render());
    void eventManager.on(WORKSPACE_CHANGED, () => this.render());
    void eventManager.on('config_changed', () => this.render());
    this.render();
  }

  /** Shows itself where the reader agreed, and says what is newest — or that there is nothing. */
  private render(): void {
    const config = configManager.get();
    const workspace = config?.workspace ?? null;
    const shown = config !== null && workspace !== null && versionsVisible(config, workspace);
    this.element.classList.toggle('hidden', !shown);
    if (!shown) {
      this.panel.close();
      return;
    }
    this.button.title = t('version.button');
    this.button.setAttribute('aria-label', this.button.title);
    const latest = versionsOfDocument.latest();
    this.label.textContent = latest === null ? t('version.none') : versionStamp(latest.at);
    this.button.setAttribute('data-version-state', versionsOfDocument.current().kind);
  }
}
```

  (`VersionsPanel` arrives in Task 6; until then, declare `private readonly panel = { element: document.createElement('div'), toggle() {}, close() {} };`
  in the button rather than importing it, and Task 6 replaces that line with the import and
  `new VersionsPanel()`.)

- [ ] **Step 4: The words** — add to all eight catalogues:

```json
  "version.button": "Versions of this note",
  "version.none": "No versions yet",
```

- [ ] **Step 5: Mount it** — in `src/main.ts`'s `createAppShell`, beside the other status
  components: `const versionStatus = new VersionStatus();` and, with the others,
  `statusBar.addComponent(versionStatus, 'left');` (the left group exists and is empty today).

- [ ] **Step 6: The probe** — create `test/probes/versioning-status.js`:

```js
/**
 * The versions button at the left of the status bar: there only where the reader agreed, and
 * reading nothing at all where they did not.
 *
 * The second half is what the recorder is for (`test/probes/fake-git.sh`): with the app pointed at
 * it, a workspace whose answer is *no* must leave its log empty — a rule the reader set, not a
 * detail — and a workspace whose answer is *yes* must fill it.
 *
 * @covers src/ui/versioning/version_status.ts, src/services/versions.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const versioning = await t.app('/src/api/versioning.ts');
  const { APP_IDENTITY, versionStamp } = await t.app('/src/services/versioning.ts');
  const { versionsOfDocument } = await t.app('/src/services/versions.ts');
  const { t: words } = await t.app('/src/services/i18n.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-version-status`;
  const note = `${folder}/note.md`;
  const log = `${home}/yi-probe-fake-git/argv.log`;
  const button = () => document.querySelector('[data-version-status]');
  const hidden = () => button()?.classList.contains('hidden') ?? true;
  const label = () => button()?.querySelector('[data-version-status-label]')?.textContent ?? null;
  const config = () => invoke('get_config');
  const before = await config();
  const sessionText = await invoke('load_session');
  /** Opens a note through the session, declining the question a replaced document may raise. */
  const open = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    await t.sleep(140);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
    await pending;
    await t.sleep(140);
  };
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A leftover from a probe that was cut off.
    }
    try {
      await files.deleteEntry(`${home}/yi-probe-fake-git`);
    } catch {
      // The recorder's log, from the probe before this one.
    }
    await files.createEntry(home, 'yi-probe-version-status', false);
    await files.createEntry(folder, 'note.md', true);
    await t.openWorkspace(folder);
    // The list is read for the document *on screen*, so the probe's own note has to be there
    // before anything is asked of the button.
    await open(note, 'A note with one version.\n');

    // 1. Saying no (or never having answered) hides the button, and nothing reads git.
    await versioning.pointAtGit(`${window.__probePaths.checkout}test/probes/fake-git.sh`);
    await configManager.update({ versioning: false, versioning_workspace: folder });
    await versionsOfDocument.reread();
    await t.sleep(200);
    const wroteNothing = await read(log).then(
      (text) => text.trim() === '',
      () => true
    );
    check(
      'a workspace the reader said no to shows no button, and runs no git',
      hidden() && wroteNothing,
      { hidden: hidden(), wroteNothing }
    );

    // 2. Agreeing shows it, and with nothing to show it says so.
    await configManager.update({ versioning: true, versioning_workspace: folder });
    await versionsOfDocument.reread();
    await t.sleep(200);
    check(
      'and one they agreed to shows it, saying there are no versions yet',
      !hidden() && label() === words('version.none'),
      { hidden: hidden(), label: label() }
    );

    // 3. A version made through the app's own commands is what the button says.
    await versioning.initWorkspaceRepository(folder, false);
    await files.writeTextAtomically(note, 'A note with one version.\n');
    await versioning.commitPaths(folder, [note], 'A note · 2026-10-01 20:15', APP_IDENTITY);
    const [row] = await versioning.versioningHistory(folder, note, 1);
    await versionsOfDocument.reread();
    await t.sleep(200);
    check(
      'and the newest version’s stamp is what it reads',
      row !== undefined && label() === versionStamp(row.at),
      { label: label(), stamp: row === undefined ? null : versionStamp(row.at) }
    );
  } finally {
    await versioning.pointAtGit(null);
    await t.restoreWorkspace(before);
    if (sessionText !== null) {
      await invoke('save_session', { session: sessionText });
    }
    await session.documentSession.load();
    await t.sleep(120);
    try {
      await files.deleteEntry(folder);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
```

  (`files.writeTextAtomically` is the atomic write Task 3's older sibling added; the note must differ
  from the empty file `createEntry` made for the commit to have something to carry.)

- [ ] **Step 7: Verify and commit** — `npx tsc --noEmit` silent, `npm run check` green, and with the
  app in front `npm run probe -- test/probes/versioning-status.js` green — then
  `git commit -m "feat(versioning): the versions button, at the left of the status bar"`.

### Task 6: the panel

**Files:**
- Create: `src/ui/versioning/versions_panel.ts`
- Modify: `src/ui/versioning/version_status.ts` (the stub becomes the real panel), `locales/*.json`
- Test: `test/probes/versioning-list.js`, `test/probes/versioning-list-empty.js` (new)

**Interfaces:**
- Consumes: `versionsOfDocument` / `VERSIONS_CHANGED` / `VersionsReading` (Task 5), `versionStamp`
  (Task 1).
- Produces: the `VersionsPanel` class (toggled by the button).

- [ ] **Step 1: The panel** — create `src/ui/versioning/versions_panel.ts`:

```ts
/**
 * The versions of the note on screen, as a list to read.
 *
 * It takes the shape of the stack popover: a panel that hangs under the button that opened it and
 * closes on Escape and on a press outside. No row acts — restoring a version is out of this slice's
 * scope — so the only thing the panel does is open, read once for the freshest answer, and draw.
 *
 * May import: the versions service, the events, the catalogue and the panel base. Upholds: the list
 * is a view of the service, built from `versionsOfDocument.current()` whenever it opens or changes
 * while it is open.
 */

import { eventManager } from '../../services/event_manager';
import { t } from '../../services/i18n';
import { VERSIONS_CHANGED, versionsOfDocument, type VersionsReading } from '../../services/versions';
import { versionStamp, type Version } from '../../services/versioning';
import { AnchoredPanel } from '../floating/panel';

export class VersionsPanel extends AnchoredPanel {
  private readonly list: HTMLDivElement;

  constructor() {
    // `left-0`, inside the `relative` toolbar that hosts it.
    super({ className: 'w-80 p-1 left-0' });
    this.list = document.createElement('div');
    this.list.className = 'flex flex-col max-h-80 overflow-auto';
    this.list.setAttribute('data-version-list', 'true');
    this.element.appendChild(this.list);
    void eventManager.on(VERSIONS_CHANGED, () => {
      if (this.isOpen()) {
        this.render();
      }
    });
  }

  /** Shows the versions as they stand, and reads once for the freshest answer. */
  open(): void {
    this.render();
    void versionsOfDocument.reread().then(() => this.render());
    super.open();
  }

  private render(): void {
    this.list.replaceChildren();
    const reading = versionsOfDocument.current();
    const empty = this.said(reading);
    if (empty !== null) {
      this.list.appendChild(empty);
      return;
    }
    const versions = reading.kind === 'ready' ? reading.versions : [];
    for (const [index, version] of versions.entries()) {
      this.list.appendChild(this.row(version, index === 0));
    }
  }

  /** What to say instead of a list, or null when there is a list to draw. */
  private said(reading: VersionsReading): HTMLElement | null {
    const words =
      reading.kind === 'no-file'
        ? t('version.noFile')
        : reading.kind === 'no-repository'
          ? t('version.noRepository')
          : reading.kind === 'unreadable'
            ? t('version.unreadable')
            : reading.versions.length === 0
              ? t('version.empty')
              : null;
    if (words === null) {
      return null;
    }
    const said = document.createElement('p');
    said.className = 'px-2 py-1 text-xs opacity-70';
    said.setAttribute('data-version-empty', 'true');
    said.setAttribute('data-version-state', reading.kind);
    said.textContent = words;
    return said;
  }

  /** One row: the stamp, the message, and the comment under it. Nothing here acts. */
  private row(version: Version, isLatest: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'rounded px-1 py-1';
    row.setAttribute('data-version-row', version.hash);
    if (isLatest) {
      row.setAttribute('data-version-latest', 'true');
    }
    const stamp = document.createElement('span');
    stamp.className = 'mr-2 text-xs opacity-70';
    stamp.setAttribute('data-version-stamp', 'true');
    stamp.textContent = versionStamp(version.at);
    const subject = document.createElement('span');
    subject.className = 'text-xs';
    subject.setAttribute('data-version-subject', 'true');
    subject.textContent = version.subject;
    const head = document.createElement('div');
    head.className = 'flex items-baseline gap-1';
    head.append(stamp, subject);
    row.appendChild(head);
    if (version.body.trim() !== '') {
      const comment = document.createElement('p');
      comment.className = 'mt-0.5 text-xs opacity-70';
      comment.setAttribute('data-version-comment-text', 'true');
      comment.textContent = version.body;
      row.appendChild(comment);
    }
    return row;
  }
}
```

  and in `version_status.ts` replace Task 5's stub with the import and `this.panel = new VersionsPanel();`.

- [ ] **Step 2: The empty words** — add to all eight catalogues:

```json
  "version.noRepository": "No versions yet in this workspace",
  "version.empty": "No versions of this note yet",
  "version.unreadable": "The versions of this note could not be read.",
```

- [ ] **Step 3: The rows' probe** — create `test/probes/versioning-list.js`: its own folder under
  `$HOME` (`~/yi-probe-version-list`), its own `open(path, content)` helper (the one
  `versioning-status.js` writes), and the same `finally` (the seam put back, the config and the
  session restored, the folder removed). Its setup, in this order:
  1. `files.createEntry(home, 'yi-probe-version-list', false)`, then
     `files.createEntry(folder, 'note.md', true)`;
  2. `t.openWorkspace(folder)`, then `configManager.update({ versioning: true, versioning_workspace: folder })`;
  3. `versioning.initWorkspaceRepository(folder, false)` — the repository, made by the app's own command;
  4. `files.writeTextAtomically(note, 'The first text.\n')`, then
     `versioning.commitPaths(folder, [note], 'The note · 2026-10-01 20:15', APP_IDENTITY)`;
  5. `files.writeTextAtomically(note, 'The second text.\n')`, then
     `versioning.commitPaths(folder, [note], 'The note · 2026-10-01 20:16', APP_IDENTITY, 'why I rewrote it')`;
  6. `open(note, 'The second text.\n')` — the document on screen, so the list is read for it;
  7. `await versionsOfDocument.reread();` and `await t.sleep(200);`
  and then the assertions:

```js
    const button = document.querySelector('[data-version-status]');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await t.sleep(300);
    const rows = () => [...document.querySelectorAll('[data-version-row]')];
    const subjectOf = (row) => row.querySelector('[data-version-subject]')?.textContent ?? null;
    const commentOf = (row) => row.querySelector('[data-version-comment-text]')?.textContent ?? null;
    check(
      'the panel lists the note’s versions, the newest first',
      rows().length === 2 &&
        subjectOf(rows()[0]) === 'The note · 2026-10-01 20:16' &&
        subjectOf(rows()[1]) === 'The note · 2026-10-01 20:15',
      rows().map(subjectOf)
    );
    check(
      'and marks the newest one, with its comment under it',
      rows()[0]?.getAttribute('data-version-latest') === 'true' &&
        commentOf(rows()[0]) === 'why I rewrote it' &&
        commentOf(rows()[1]) === null,
      { latest: rows()[0]?.getAttribute('data-version-latest') ?? null, comments: rows().map(commentOf) }
    );
    check(
      'each row carries the stamp of its own commit',
      rows().every((row) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(row.querySelector('[data-version-stamp]')?.textContent ?? '')),
      rows().map((row) => row.querySelector('[data-version-stamp]')?.textContent ?? null)
    );
```

  (the setup and the `finally` follow `versioning-status.js` — its own folder, the config and the
  session put back, the folder removed).

- [ ] **Step 4: The sentences' probe** — create `test/probes/versioning-list-empty.js`, which walks
  the four states and, after each, presses the button and reads `[data-version-empty]`'s words and
  its `data-version-state`. Its own folder is `~/yi-probe-version-list-empty`, and it needs the same
  `open` helper, the same `before`/`sessionText` capture and the same `finally` as
  `versioning-status.js`:

```js
  const sentence = async () => {
    document.querySelector('[data-version-status]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await t.sleep(300);
    const said = document.querySelector('[data-version-empty]');
    return { state: said?.getAttribute('data-version-state') ?? null, words: said?.textContent ?? null };
  };
```

  with, in order (each step: set the state, `await versionsOfDocument.reread()`, `await t.sleep(200)`,
  then `sentence()`):
  1. the folder and its note made, `t.openWorkspace(folder)`, consent given
     (`configManager.update({ versioning: true, versioning_workspace: folder })`), and a document
     with no file on screen — `await open(null, 'A note with no file.\n')` — then `sentence()` is
     `{ state: 'no-file', words: words('version.noFile') }`;
  2. the note opened with its own path (`await open(note, 'The note.\n')`) and no `.git` in the
     folder — `{ state: 'no-repository', words: words('version.noRepository') }`;
  3. `versioning.initWorkspaceRepository(folder, false)`, then
     `files.writeTextAtomically(other, 'Another note.\n')` and
     `versioning.commitPaths(folder, [other], 'Another note', APP_IDENTITY)` — a repository whose
     history does not hold *this* note — `{ state: 'ready', words: words('version.empty') }`;
  4. a machine with no git — `versioning.pointAtGit(`${folder}/git-that-is-not-there`)`, then
     `reread` — is
     `{ state: 'unreadable', words: words('version.unreadable') }`, with the seam put back in the
     `finally` (the harness puts it back too).

- [ ] **Step 5: Verify and commit** — `npx tsc --noEmit` silent, `npm run check` green, and with the
  app in front `npm run probe -- test/probes/versioning-list.js` and
  `… test/probes/versioning-list-empty.js` green — then
  `git commit -m "feat(versioning): the list of a note's versions, under the button"`.

### Task 7: the guides

**Files:**
- Modify: `docs/ai-context.md`, `docs/architecture.md`, `docs/roadmap.md`, `test/README.md`

- [ ] **Step 1: `docs/ai-context.md`** — in the versioning paragraph, after “Every git call goes
  through one helper…”:

```markdown
The versions of the note on screen are shown, not just kept: the status bar's left group holds a
button (`ui/versioning/version_status.ts`) that is there exactly when the reader agreed to versions
in this workspace — read from the config, so a workspace they said no to never runs git — showing
the newest version's stamp (`services/versioning.ts: versionStamp`), and a panel under it
(`versions_panel.ts`) listing them newest first, read from the repository by
`services/versions.ts`. That read is the vocabulary's fourth call (`git log --follow
--max-count=… --format=… -- <path>`): three writes (`init`, `add`, `commit`) and one read, all
through `run_git`, with the never-dos unchanged. Saving a version asks what to call it first — an
optional comment (`ui/versioning/version_comment_dialog.ts`, a card with no native twin, since no
system surface answers with a line of text) — and the subject stays exactly what it was
(`Title · 2026-10-01 20:15`) while the comment becomes the commit's body.
```

- [ ] **Step 2: `docs/architecture.md`** — extend the “A version of a workspace, kept by Git” row of
  the “Where does this change go?” table with a sentence, and add a row under it:

```markdown
| The versions of the note on screen | `services/versions.ts` is the living list (it reads through `src/api/versioning.ts`, only when `versionsVisible` — consent for *this* workspace, from the config — and only when the document's path changes, so a keystroke costs nothing), `src/ui/versioning/version_status.ts` is the button at the left of the status bar, and `versions_panel.ts` is the panel under it. The read itself is `versioning.rs: versioning_history` — one `git log --follow --max-count=… --format=… -- <path>` through the same `run_git` every other call goes through, so the app's vocabulary is three writes and this one read. Rows are read-only: restoring is out of scope |
```

- [ ] **Step 3: `docs/roadmap.md`** — a Closed entry after the versioning one, with the numbers:

```markdown
- **The versions of the note on screen**, as the reader asked: a button at the left of the status
  bar — `docs/superpowers/specs/2026-10-02-document-versions-design.md`, built by
  `docs/superpowers/plans/2026-10-02-document-versions.md` — showing the newest version of the
  document in hand and, one press away, the list of them newest first, each row the stamp, the
  message and the comment under it. A version is **a commit that touched the file**, whoever wrote
  it, so the panel and the reader's own `git log` agree; the read is `git log --follow
  --max-count=50 --format=…` through the one helper every git call goes through, measured at
  **14 ms** for fifty rows (45 ms with `--follow` over a long history), and a path git has never
  seen answers **nothing and exits 0** — no error to invent, and `--follow` is what keeps a renamed
  note's versions. It is the vocabulary's fourth call and its first *read*; the never-dos are
  unchanged. The button is there exactly when the reader agreed to versions in this workspace and
  hidden otherwise — from the config alone, so a workspace they said no to runs no git at all, which
  a probe holds with the recorder. Saving a version now asks what to call it: an optional comment on
  a card with no native twin, the subject unchanged (`Title · 2026-10-01 20:15`) and the comment as
  the commit's body. `npm run check` is **38/38** (the new cases live in `check-versioning.mjs`, the
  check the versioning work added) and `cargo test` **34/34** (the new parsing test); the probes are
  `versioning-status` (the button, and the empty log behind it), `versioning-list` (the rows, the
  comment) and `versioning-list-empty` (the four things it can say instead of a list).
```

  (The counts are what the tasks in this plan leave behind; if they move while you work, write the
  numbers the run reported rather than these.)

- [ ] **Step 4: `test/README.md`** — extend the `check-versioning.mjs` row's description with the
  stamp, the message-with-comment rule, `versionsVisible` and `versionsState`; add the three probes
  to the versioning group in the prose; and change “A hundred and thirty-four of them” to
  **“A hundred and thirty-seven”**.

- [ ] **Step 5: Verify and commit** — `npm run check` green (the catalogue check is the one that
  reads the docs' claim about keys), then
  `git commit -m "docs: a note's own versions, and how they are read"`.

## Self-review

- Spec §1 (the read) → Task 3. §2 (the living list) → Tasks 4 and 5. §3 (the button) → Task 5. §4
  (the panel, its rows and its four sentences) → Task 6. §5 (the stamp) → Task 1. §6 (the comment,
  the subject and the body) → Tasks 1 and 2. §7 (what it does not do) → nothing to build. The rules
  table's six answers → the visibility rule and its probe (Task 5), the rows' content (Task 6), the
  subject/body rule and its check (Task 1), and the no-git-while-hidden rule (Task 5's recorder).
- Type consistency: `Version` and `VersionsState` are defined once (Task 4) and imported by name
  everywhere else (`versioningHistory` in Task 3, `VersionsReading` in Tasks 5 and 6,
  `versionStamp` in Tasks 1, 5 and 6); `commitPaths`'s fifth argument is `body` in the Rust command,
  the TS wrapper and every call site (Task 1).
- Every step that changes behaviour names the check or probe that proves it, and every probe is
  inside the bridge's five seconds on its own (measured: the versioning suite's probes run 2.0–3.2 s
  with the app's window in front).
