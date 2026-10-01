# Workspace versions, kept by Git — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a reader can ask for a version of the note they are writing; the app keeps it in Git — in
the repository they already have, or in one it makes with the git directory kept outside a
cloud-synced folder — and never runs git for any other reason.

**Architecture:** a Rust fact-gatherer (`versioning.rs`) reports what is true of the machine and the
folder; one pure rule (`services/versioning.ts`) turns those facts plus the reader's consent into a
plan; the action (`ui/versioning/save_version.ts`) captures, saves the document atomically, and
commits only that path.

**Tech Stack:** Rust (`std::fs`, `std::process::Command`), TypeScript (strict), the `QuestionCard`
family, the command registry, the Tauri MCP bridge for probes.

**Spec:** `docs/superpowers/specs/2026-10-01-workspace-versioning-design.md` — the table of rules is
the authority; read it with this plan.

## Global Constraints

- A version exists only when the reader asks. No quit hook, timer or on-save commit; consent is per
  workspace and asked when the reader first asks for a version.
- Never run git while consent is off; never `init` inside an existing repository; commit only the
  paths we wrote (`git add -- <path>` + `git commit -- <path>`).
- The never-dos (spec §5) are held by a probe that points the app at a **fake git** which records
  its arguments (`YI_GIT`).
- Every module keeps the house header rules; `npx tsc --noEmit` silent and `npm run check` green
  after every task; probes are named per task and must pass with the app running.
- A test works in a folder of its own under `$HOME` and restores the app's config (the fixture rule
  in AGENTS.md).
- Commit style `type(scope): subject`, lower case, imperative; work on `codex/versioning`; do not
  merge — the user reviews.

## Task 1: the config's two facts, and the rule over them

**Files:** `src-tauri/src/settings.rs`, `src/api/settings.ts`, `src/services/versioning.ts`,
`test/checks/check-versioning.mjs`

**Interfaces:** produces `VersioningFacts`, `Consent`, `VersioningPlan`, `versioningPlan(facts, consent)`.

- [x] **Step 1: The failing check** — `test/checks/check-versioning.mjs` bundles
  `src/services/versioning.ts` (the rolldown pattern every check uses) and walks the spec's table:

```js
const facts = (over = {}) => ({
  git: '/usr/bin/git',
  repository: { here: false, above: false, toplevel: null },
  cloud: 'none',
  ...over
});
check('unasked consent plans nothing', versioningPlan(facts(), 'unasked'), { use: 'none', separateGitDir: false, ask: 'consent', blocked: null });
check('declining plans nothing and asks nothing', versioningPlan(facts(), 'no'), { use: 'none', separateGitDir: false, ask: null, blocked: null });
check('their repository is used as it is', versioningPlan(facts({ repository: { here: true, above: true, toplevel: '/notes' } }), 'yes'), { use: 'theirs', separateGitDir: false, ask: null, blocked: null });
check('a folder inside a repository is never nested into', versioningPlan(facts({ repository: { here: false, above: true, toplevel: '/code' } }), 'yes'), { use: 'theirs', separateGitDir: false, ask: null, blocked: null });
check('a cloud-synced folder gets a separate git directory, after the warning', versioningPlan(facts({ cloud: 'cloud-storage' }), 'yes'), { use: 'init', separateGitDir: true, ask: 'cloud-risk', blocked: null });
check('unknown cloud means the safe thing', versioningPlan(facts({ cloud: 'unknown' }), 'yes'), { use: 'init', separateGitDir: true, ask: 'cloud-risk', blocked: null });
check('a local folder is initialised as normal', versioningPlan(facts(), 'yes'), { use: 'init', separateGitDir: false, ask: null, blocked: null });
check('without git there is nothing to do', versioningPlan(facts({ git: null }), 'yes'), { use: 'none', separateGitDir: false, ask: null, blocked: 'no-git' });
```

- [x] **Step 2: Run it, expect failure** (`Cannot find module`).

- [x] **Step 3: The rule** — `src/services/versioning.ts`: the types above and

```ts
export function versioningPlan(facts: VersioningFacts, consent: Consent): VersioningPlan {
  if (consent === 'unasked') return { use: 'none', separateGitDir: false, ask: 'consent', blocked: null };
  if (consent === 'no') return { use: 'none', separateGitDir: false, ask: null, blocked: null };
  if (facts.git === null) return { use: 'none', separateGitDir: false, ask: null, blocked: 'no-git' };
  if (facts.repository.here || facts.repository.above) return { use: 'theirs', separateGitDir: false, ask: null, blocked: null };
  // A cloud-synced folder — or one we cannot read enough to be sure about — keeps its git directory
  // outside the folder: harmless in the local case too, because the reader's own git still works
  // through the one-line `.git` pointer file.
  const guarded = facts.cloud !== 'none';
  return { use: 'init', separateGitDir: guarded, ask: guarded ? 'cloud-risk' : null, blocked: null };
}
```

- [x] **Step 4: The config** — `versioning: bool` and `versioning_workspace: Option<String>` on
  `AppConfig` (`#[serde(default)]`, so every config written before them reads as *not asked*), the
  same two fields on the TypeScript `AppConfig`, and a Rust test that an older config reads as
  `versioning: false` and `versioning_workspace: None`.
- [x] **Step 5: Verify and commit** — the check passes, `tsc` silent, `npm run check`, `cargo test`;
  commit `feat(versioning): consent, and the rule that turns it into a plan`.

## Task 2: the facts, gathered in Rust

**Files:** `src-tauri/src/versioning.rs`, `src-tauri/src/lib.rs`, `src/api/versioning.ts`,
`test/probes/versioning-facts.js`

**Interfaces:** produces the `versioning_facts(workspace)` command and its TypeScript wrapper.

- [x] **Step 1: The gatherer** — `versioning.rs`, with one function per fact and a test for each
  that can run without a network or a real cloud folder: `find_git()` (the known places, `/usr/bin/git`
  only when `xcode-select -p` succeeds, then `PATH`, and `YI_GIT` first for tests), `repository_shape(path)`
  (`.git` a directory, a file, or nothing — and `toplevel` from git when it is available), `cloud_kind(path)`
  (the path shapes, the Windows variables and attributes, Linux's mountinfo, `UF_DATALESS`, the
  `~/Library/CloudStorage` listing, and `unknown` when a stat below `~/Library` is refused),
  `identity(git, workspace)` (`user.name`/`user.email`, read with `git -C <workspace> config --get`).
- [x] **Step 2: The command** — `#[tauri::command] pub fn versioning_facts(workspace: String) -> Result<VersioningFacts, String>`
  registered beside `list_folder_files`, and `src/api/versioning.ts` wrapping it in `invoke`.
- [x] **Step 3: The probe** — `test/probes/versioning-facts.js` asks the app what it sees for three
  folders: a plain one it makes itself (no repository, cloud `none`), one with a `.git` *directory*,
  and one whose `.git` is a *file* (`gitdir: …`, the worktree shape) — and reports what the machine
  says about `~/Library/CloudStorage` without asserting a vendor-specific answer, so it holds on
  machines with and without a Drive mount.
- [x] **Step 4: Verify and commit** — `cargo test`, `npm run check`, the probe; commit
  `feat(versioning): what is true of the machine and the folder`.

## Task 3: the git seam, and an atomic write for documents

**Files:** `src-tauri/src/versioning.rs`, `src-tauri/src/files.rs`, `src/api/versioning.ts`

**Interfaces:** produces `init_workspace_repository(workspace, separate)`, `commit_paths(workspace, paths, message, identity)`,
and `write_text_atomically(path, contents)`.

- [x] **Step 1: The seam** — every git call goes through one helper that takes the git path and the
  arguments and returns stdout/stderr/status; `init` uses `--separate-git-dir=<app data dir>/repos/<name>`
  when asked; `commit_paths` runs `git add -- <paths>` and `git commit -- <paths> -m <message>`, with
  `-c user.name`/`-c user.email` only when the caller supplies an identity (the repository we made).
- [x] **Step 2: The atomic write** — move `files.rs`'s write to temp-file + `rename` (the shape
  `session.rs` already uses, with its own test), and route the session's document save and the new
  note's write through it.
- [x] **Step 3: The fake-git proof** — a probe writes a shell script that appends its arguments to a
  log and exits 0, points `YI_GIT` at it, and asserts the app ran `init`/`add`/`commit` and **nothing**
  from the never-list (no `fetch`, `pull`, `gc`, `clean`, `reset`, `checkout`, `--amend`, `--force`).
- [x] **Step 4: Verify and commit** — `cargo test`, the probe; commit
  `feat(versioning): the git calls, and one atomic write for documents`.

## Task 4: the consent card, and Save a version

**Files:** `src/ui/versioning/versioning_dialog.ts`, `src/ui/versioning/save_version.ts`,
`src/ui/markdown/commands/*`, `src-tauri/src/menu.rs`, `locales/*.json`

**Interfaces:** produces `versioningDialog` (`QuestionChooser`-shaped), `saveVersion()`, the command
`version:save`, and the File menu item that names it.

- [x] **Step 1: The card** — a `QuestionCard` asking *"Version this workspace with Git?"*, with the
  cloud-risk line and the git directory path when the plan asks for them, `data-versioning-*` markers,
  and Escape meaning no. What is asked is the plan's own words (`ask`), never a second decision.
- [x] **Step 2: The flow** — `saveVersion()`: gather facts → `versioningPlan(facts, consent)` →
  answer `'ask'` by showing the card and remembering the answer with the workspace path → refuse a
  document with no file, in one sentence → capture → atomic write → `commit_paths([path], message, identity)`
  → a message on failure (no identity in *their* repo, a lock file, anything else).
- [x] **Step 3: The words** — the command id, the menu label, the card's keys, the failure lines, and
  the refusal for a note with no file, in all eight catalogues.
- [x] **Step 4: Verify and commit** — `cargo test`, `npm run check`, and the probes of Task 6's first
  half (`versioning-save.js`) once written; commit `feat(versioning): Save a version, and the question it asks first`.

## Task 5: the switch in the settings window

**Files:** `src/ui/settings/general_settings.ts`, `locales/*.json`

- [x] **Step 1: The section** — a General-tab switch showing this workspace's answer, the git
  directory when it is a separate one, and a sentence saying versions only happen when asked.
  Turning it on asks the same card; turning it off stops future versions and touches nothing that
  exists.
- [x] **Step 2: Verify and commit** — `npm run check` (the catalogues), the settings probe pattern of
  `settings-push-on-open.js`; commit `feat(versioning): the switch, and where the versions live`.

## Task 6: the probes that prove the behaviour

**Files:** `test/probes/versioning-save.js`, `test/probes/versioning-no-git.js`

- [x] **Step 1: `versioning-save.js`** — a workspace of its own under `$HOME` with a real git: consent
  asked and remembered; a version commits *only* the note that was saved, while a file the reader
  staged stays staged (`git status --porcelain` names it); a note with no file is refused; a second
  workspace that is already a repository is used, not re-initialised; a folder inside an outer
  repository is not nested into.
- [x] **Step 2: `versioning-no-git.js`** — with `YI_GIT` pointing at a script that fails, the action
  says git is unavailable and writes nothing (the plan's `blocked: 'no-git'`).
- [x] **Step 3: Verify and commit** — both probes inside the bridge's budget; commit
  `test(versioning): a version asked for, and the cases around it`.

## Task 7: the guides

**Files:** `docs/ai-context.md`, `docs/architecture.md`, `docs/roadmap.md`, `test/README.md`

- [x] **Step 1: Write them** — ai-context: the rule that a version is only ever asked for, the plan,
  and the separate-git-directory strategy with the cloud reasoning; architecture: the row for
  "a version in a workspace"; roadmap: the Closed entry with the measured facts (the `.git` a clone
  is, the CloudStorage refusal, the session's atomic write); test/README: the new check and probes.
- [x] **Step 2: Verify and commit** — `npm run check`; commit `docs: versions kept by git, and when we do not`.

## Self-review

- Spec §1 → Task 1 (the facts in the config) and Task 4 (the card). §2 → Task 2. §3 → Task 1 (the
  rule and the whole table as a check). §4 → Task 3 (the seam) and Task 4 (the order: capture, save,
  commit). §5 → Task 3's fake-git probe. §6 → nothing to build, deliberately.
- Every task names the check or probe that proves it; the fixture rule is in the global constraints;
  the one interface the plan does not write in full (`RepositoryShape`, `CloudKind`) is fixed by
  Task 2's struct, which Task 1's rule reads.

## Handoff

**State.** All seven tasks are done, on `codex/versioning` on top of `main` at `4ce5ae2`, and the
branch is **not merged** — the reader reviews first. `npm run check` is **38/38**, `cargo test` is
**33/33**, `npx tsc --noEmit` is silent, and the seven probes of Task 6 pass
(`versioning-facts`, `versioning-fake-git`, `versioning-save`, `versioning-staged`,
`versioning-consent`, `versioning-repository`, `versioning-no-git`), each inside the bridge's five
seconds on its own.

**Three deviations from the plan, all measured, all deliberate.**

1. **The recording git is committed, and the seam is a command.** Task 3 asked for a probe that
   *writes* a shell script and points `YI_GIT` at it; a probe can do neither. The app makes markdown
   files and folders and nothing else, the file plugin cannot set an executable bit, and the
   environment of a running app is not reachable from the webview. So the recorder is committed
   (`test/probes/fake-git.sh`) and the seam gained the one door a probe can knock on:
   `versioning_use_git`, debug builds only, which sets what an environment would. A name that is
   not there now means *no git* rather than a fallback — which is also how `versioning-no-git.js`
   asks for a machine without one. The harness clears that seam before every probe, the way it puts
   the language back, so a run the bridge cuts off costs the next probe nothing.
2. **`versioning-save.js` is two probes.** Held as one it measured **4.9 s** against the 5 s
   budget. `versioning-save.js` keeps the question, the remembered answer and the commit;
   `versioning-staged.js` keeps what the commit *holds* (the note, and not the reader's staged
   work). Three smaller probes joined them: `versioning-consent.js` (the answer that is *no*, and
   the settings switch — Task 5's verification), `versioning-repository.js` and
   `versioning-outer.js` (their repository, and a folder inside one — split too, at 5.0 s) and
   `versioning-no-git.js`. A probe's time depends on the window: an occluded one is throttled, and
   the same probe measured 2257 ms in front of it and 5008 ms behind the terminal
   (`test/README.md`, `docs/roadmap.md`).
3. **The probes put the reader's session back.** Task 6 does not say so, `docs/ai-context.md` does:
   a probe that opens documents reads the session file first, writes it back in its `finally`, and
   makes the live session read it again — so the documents the reader had open are the documents
   that are open, which the demo-document shuffle the older probes do only approximated.

**For the reader.** What is *not* here is what the spec put out of scope: browsing versions,
restoring one, pushing, a diff view, LFS and submodules. Two facts worth knowing while reviewing: a
commit's message is the note's title and the minute it was asked for, and a repository the app made
carries Yi's own identity (`Yi <yi@localhost>`) while the reader's own repository carries theirs.
