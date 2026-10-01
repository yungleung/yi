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

- [ ] **Step 1: The failing check** — `test/checks/check-versioning.mjs` bundles
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

- [ ] **Step 2: Run it, expect failure** (`Cannot find module`).

- [ ] **Step 3: The rule** — `src/services/versioning.ts`: the types above and

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

- [ ] **Step 4: The config** — `versioning: bool` and `versioning_workspace: Option<String>` on
  `AppConfig` (`#[serde(default)]`, so every config written before them reads as *not asked*), the
  same two fields on the TypeScript `AppConfig`, and a Rust test that an older config reads as
  `versioning: false` and `versioning_workspace: None`.
- [ ] **Step 5: Verify and commit** — the check passes, `tsc` silent, `npm run check`, `cargo test`;
  commit `feat(versioning): consent, and the rule that turns it into a plan`.

## Task 2: the facts, gathered in Rust

**Files:** `src-tauri/src/versioning.rs`, `src-tauri/src/lib.rs`, `src/api/versioning.ts`,
`test/probes/versioning-facts.js`

**Interfaces:** produces the `versioning_facts(workspace)` command and its TypeScript wrapper.

- [ ] **Step 1: The gatherer** — `versioning.rs`, with one function per fact and a test for each
  that can run without a network or a real cloud folder: `find_git()` (the known places, `/usr/bin/git`
  only when `xcode-select -p` succeeds, then `PATH`, and `YI_GIT` first for tests), `repository_shape(path)`
  (`.git` a directory, a file, or nothing — and `toplevel` from git when it is available), `cloud_kind(path)`
  (the path shapes, the Windows variables and attributes, Linux's mountinfo, `UF_DATALESS`, the
  `~/Library/CloudStorage` listing, and `unknown` when a stat below `~/Library` is refused),
  `identity(git, workspace)` (`user.name`/`user.email`, read with `git -C <workspace> config --get`).
- [ ] **Step 2: The command** — `#[tauri::command] pub fn versioning_facts(workspace: String) -> Result<VersioningFacts, String>`
  registered beside `list_folder_files`, and `src/api/versioning.ts` wrapping it in `invoke`.
- [ ] **Step 3: The probe** — `test/probes/versioning-facts.js` asks the app what it sees for three
  folders: a plain one it makes itself (no repository, cloud `none`), one with a `.git` *directory*,
  and one whose `.git` is a *file* (`gitdir: …`, the worktree shape) — and reports what the machine
  says about `~/Library/CloudStorage` without asserting a vendor-specific answer, so it holds on
  machines with and without a Drive mount.
- [ ] **Step 4: Verify and commit** — `cargo test`, `npm run check`, the probe; commit
  `feat(versioning): what is true of the machine and the folder`.

## Task 3: the git seam, and an atomic write for documents

**Files:** `src-tauri/src/versioning.rs`, `src-tauri/src/files.rs`, `src/api/versioning.ts`

**Interfaces:** produces `init_workspace_repository(workspace, separate)`, `commit_paths(workspace, paths, message, identity)`,
and `write_text_atomically(path, contents)`.

- [ ] **Step 1: The seam** — every git call goes through one helper that takes the git path and the
  arguments and returns stdout/stderr/status; `init` uses `--separate-git-dir=<app data dir>/repos/<name>`
  when asked; `commit_paths` runs `git add -- <paths>` and `git commit -- <paths> -m <message>`, with
  `-c user.name`/`-c user.email` only when the caller supplies an identity (the repository we made).
- [ ] **Step 2: The atomic write** — move `files.rs`'s write to temp-file + `rename` (the shape
  `session.rs` already uses, with its own test), and route the session's document save and the new
  note's write through it.
- [ ] **Step 3: The fake-git proof** — a probe writes a shell script that appends its arguments to a
  log and exits 0, points `YI_GIT` at it, and asserts the app ran `init`/`add`/`commit` and **nothing**
  from the never-list (no `fetch`, `pull`, `gc`, `clean`, `reset`, `checkout`, `--amend`, `--force`).
- [ ] **Step 4: Verify and commit** — `cargo test`, the probe; commit
  `feat(versioning): the git calls, and one atomic write for documents`.

## Task 4: the consent card, and Save a version

**Files:** `src/ui/versioning/versioning_dialog.ts`, `src/ui/versioning/save_version.ts`,
`src/ui/markdown/commands/*`, `src-tauri/src/menu.rs`, `locales/*.json`

**Interfaces:** produces `versioningDialog` (`QuestionChooser`-shaped), `saveVersion()`, the command
`version:save`, and the File menu item that names it.

- [ ] **Step 1: The card** — a `QuestionCard` asking *"Version this workspace with Git?"*, with the
  cloud-risk line and the git directory path when the plan asks for them, `data-versioning-*` markers,
  and Escape meaning no. What is asked is the plan's own words (`ask`), never a second decision.
- [ ] **Step 2: The flow** — `saveVersion()`: gather facts → `versioningPlan(facts, consent)` →
  answer `'ask'` by showing the card and remembering the answer with the workspace path → refuse a
  document with no file, in one sentence → capture → atomic write → `commit_paths([path], message, identity)`
  → a message on failure (no identity in *their* repo, a lock file, anything else).
- [ ] **Step 3: The words** — the command id, the menu label, the card's keys, the failure lines, and
  the refusal for a note with no file, in all eight catalogues.
- [ ] **Step 4: Verify and commit** — `cargo test`, `npm run check`, and the probes of Task 6's first
  half (`versioning-save.js`) once written; commit `feat(versioning): Save a version, and the question it asks first`.

## Task 5: the switch in the settings window

**Files:** `src/ui/settings/general_settings.ts`, `locales/*.json`

- [ ] **Step 1: The section** — a General-tab switch showing this workspace's answer, the git
  directory when it is a separate one, and a sentence saying versions only happen when asked.
  Turning it on asks the same card; turning it off stops future versions and touches nothing that
  exists.
- [ ] **Step 2: Verify and commit** — `npm run check` (the catalogues), the settings probe pattern of
  `settings-push-on-open.js`; commit `feat(versioning): the switch, and where the versions live`.

## Task 6: the probes that prove the behaviour

**Files:** `test/probes/versioning-save.js`, `test/probes/versioning-no-git.js`

- [ ] **Step 1: `versioning-save.js`** — a workspace of its own under `$HOME` with a real git: consent
  asked and remembered; a version commits *only* the note that was saved, while a file the reader
  staged stays staged (`git status --porcelain` names it); a note with no file is refused; a second
  workspace that is already a repository is used, not re-initialised; a folder inside an outer
  repository is not nested into.
- [ ] **Step 2: `versioning-no-git.js`** — with `YI_GIT` pointing at a script that fails, the action
  says git is unavailable and writes nothing (the plan's `blocked: 'no-git'`).
- [ ] **Step 3: Verify and commit** — both probes inside the bridge's budget; commit
  `test(versioning): a version asked for, and the cases around it`.

## Task 7: the guides

**Files:** `docs/ai-context.md`, `docs/architecture.md`, `docs/roadmap.md`, `test/README.md`

- [ ] **Step 1: Write them** — ai-context: the rule that a version is only ever asked for, the plan,
  and the separate-git-directory strategy with the cloud reasoning; architecture: the row for
  "a version in a workspace"; roadmap: the Closed entry with the measured facts (the `.git` a clone
  is, the CloudStorage refusal, the session's atomic write); test/README: the new check and probes.
- [ ] **Step 2: Verify and commit** — `npm run check`; commit `docs: versions kept by git, and when we do not`.

## Self-review

- Spec §1 → Task 1 (the facts in the config) and Task 4 (the card). §2 → Task 2. §3 → Task 1 (the
  rule and the whole table as a check). §4 → Task 3 (the seam) and Task 4 (the order: capture, save,
  commit). §5 → Task 3's fake-git probe. §6 → nothing to build, deliberately.
- Every task names the check or probe that proves it; the fixture rule is in the global constraints;
  the one interface the plan does not write in full (`RepositoryShape`, `CloudKind`) is fixed by
  Task 2's struct, which Task 1's rule reads.
