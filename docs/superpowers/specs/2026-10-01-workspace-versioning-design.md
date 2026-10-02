# Versions in a workspace, kept by Git

## Problem

A workspace is a folder of plain markdown, and nothing in the app keeps a version of it: an
overwrite, a bad paste, or a file deleted outside the app is final. The reader asked for local
version control — Git, if the machine has it — with no account, no required remote, and without
disturbing whatever they already use: a cloud drive, a clone of their own, their own GitHub.

The app already lives beside such a repository without touching it, measured: `list_folder_files`
skips dot-named entries, so `.git` is invisible to the tree, the folder walks and the document
catalogue; the app refuses to *create* a dot-named entry, and the webview's file plugin refuses a
hidden path too; and after the app opened a real clone, `git status --porcelain` was empty.

## The rules, as the reader gave them

| Consent for this workspace | A repository here | A repository above | Cloud-synced | What the app does |
| --- | --- | --- | --- | --- |
| no (default) | any | any | any | **Nothing at all.** Never init, never commit, never read the repository |
| yes | yes | — | any | Use **their** repository: their identity, their remote, their branch; commit only the files we wrote |
| yes | no | yes | any | It is **inside** a repository: respect it, never nest — no `init` |
| yes | no | no | yes or unknown | **`git init --separate-git-dir=<app data dir>`**, after telling them the risk |
| yes | no | no | no | `git init` as normal |

A **version exists only when the reader asks for one.** No quit hook, no timer, no on-save commit —
nothing else ever decides. Consent is asked once per workspace, when the reader first asks for a
version, and remembered with the path it was given for.

## Design

### 1. Consent, in the config

`versioning: bool` and `versioning_workspace: string | null` — the answer, and the workspace it was
given for. A workspace whose path is not that one is asked again (one card, the `QuestionCard` family
the prompt and the new-note card use): *"Version this workspace with Git?"*, with the cloud warning
and the chosen git directory when the facts call for them. Declining is remembered and nothing is
ever touched. The settings window's General tab carries the same switch, so it can be turned on or
off later.

### 2. The facts (Rust: `src-tauri/src/versioning.rs`)

Nothing here is inferred in TypeScript: `std` gives the metadata, and one struct goes to the pure
rule.

```rust
pub struct VersioningFacts {
  git: Option<PathBuf>,           // a git we may run, or None
  git_source: String,             // "clt" | "homebrew" | "usr-local" | "path" | "env"
  repository: RepoShape,          // none | dir | file (worktrees write a `.git` file) + toplevel
  cloud: CloudKind,               // none | cloud_storage | icloud | onedrive | mount | unknown
  cloud_evidence: String,         // the path shape or the refusal that decided it
  identity: (Option<String>, Option<String>),  // user.name / user.email, when a repo has them
}
```

- **Finding git** never means trusting `PATH`: an app launched from Finder does not inherit a shell's
  `PATH` at all. The search is the known places — `/usr/bin/git` **only when `xcode-select -p`
  succeeds** (measured: it answers without raising the Command Line Tools installer), `/opt/homebrew/bin`,
  `/usr/local/bin`, then `PATH` — and `YI_GIT` for tests, which is how a probe points the app at a
  script that records the arguments it was given.
- **The repository shape** comes from the workspace and its parents (`.git` a directory, or the
  one-line *file* a worktree or submodule writes), and from `git rev-parse --show-toplevel` when git
  is available.
- **The cloud shape** is the tiered detection argued out with the reader, each tier measured on this
  machine:
  - *the path, no access needed*: `~/Library/CloudStorage/<mount>` (every File Provider client, so no
    vendor list is needed) and `~/Library/Mobile Documents/…`; `%OneDrive%`/`%OneDriveCommercial%` on
    Windows; `fuse.*`/`gvfs`/`rclone`/`davfs` in `/proc/self/mountinfo` on Linux;
  - *metadata*: `UF_DATALESS` on macOS, the Cloud Files placeholder attributes on Windows;
  - *the refusal itself*: macOS answers `stat` on a protected cloud path but refuses `readdir`
    (measured: `stat` on the Google Drive mount and on `My Drive` returned device and inode; `ls`
    inside is *Operation not permitted*) — so a read refusal under `~/Library/` is evidence;
  - and the listing of `~/Library/CloudStorage` itself, which the app *can* read (measured), so the
    provider mounts can be held as a list to compare a workspace against.
  - What does **not** work, and is not built on: comparing `~/Documents` with
    `~/Library/Mobile Documents/com~apple~CloudDocs/Documents` for a shared inode. Both exist on this
    machine and they differ (742216 vs 755434), so the twins are different directories — the
    "Desktop & Documents" arrangement is *not* detectable this way, which is exactly the case the
    question exists for.

### 3. The decision, pure (`src/services/versioning.ts`) and checked

```ts
export type VersioningUse = 'none' | 'theirs' | 'init';
export interface VersioningPlan {
  use: VersioningUse;
  separateGitDir: boolean;
  ask: 'consent' | 'cloud-risk' | null;
  blocked: 'no-git' | null;
}
export function versioningPlan(facts: VersioningFacts, consent: 'yes' | 'no' | 'unasked'): VersioningPlan;
```

One rule, one home, checked in Node against the whole table above — including *unknown* cloud (which
means the same as *synced*: a git directory outside the folder is harmless in the local case too,
because the reader's own `git` keeps working through the one-line `.git` pointer file, so the
classifier never has to be perfect) and the inside-a-repository case.

### 4. The action

`src/ui/versioning/save_version.ts`, reached from a **File → Save a version** item (and the command
registry, like every other name the reader can ask for):

1. **capture** the editor's text into the session (the session's copy can be up to 800 ms behind a
   keystroke, so a commit before it would version the previous content);
2. **the current document must have a file** — a note that has never been saved is refused with one
   sentence rather than a save sheet in the middle of a version action;
3. **write it** through the app's atomic write (temp file + rename, the same shape the session
   already uses);
4. `git add -- <path>` then `git commit -- <path> -m "<name> · <date> <time>"` — the pathspec is the
   point: a commit of ours contains the file we wrote and **never** sweeps up the reader's staged
   work or their unrelated edits;
5. in a repository **we** made (the separate-git-dir case) the commit carries Yi's own identity
   (`-c user.name=Yi -c user.email=yi@localhost`); in **their** repository we never invent one — if
   their `user.name`/`user.email` is unset, the commit fails and the message says so.

### 5. What the app never does

No `fetch`, `pull`, `gc`, `clean`, `reset`, `checkout`, `amend` or force; no hooks
(`core.hooksPath` untouched); no credentials written into the repository; never delete a stale
`.git/index.lock` (report it and try again); never `init` inside an existing repository; never
touch `.git` while consent is off; never commit anything the reader did not ask for.

### 6. Out of scope for this slice

Browsing versions and restoring one, pushing from the app, a diff view, LFS and submodules. The
versions live in the reader's own repository from the first commit, so `git log`, `git checkout` and
their own client see them immediately; a history *browser* is its own design (which version, whole
workspace or one file, and what a restore does to the open session).

## Testing

- **Node**: `test/checks/check-versioning.mjs` — every row of the table, plus unknown-cloud →
  separate, inside-a-repo → theirs (no nest), and no git → blocked.
- **Probes**, each in a folder of its own under `$HOME` and restoring the config (the fixture rule):
  a real repository for init-normal vs init-separate (the `.git` file and the git dir path);
  a second run that respects an existing repository; an outer repository that is not nested into; a
  commit that contains only the note we saved while the reader's staged file stays staged; the
  document-with-no-file refusal; and a **fake git** (a script that records its argv) proving the
  never-dos.
- **The facts on real paths**: a probe reporting what the gatherer says about
  `~/Library/CloudStorage/GoogleDrive-…` (cloud, by the mount list) and about a plain folder
  (none) — and, honestly, about `~/Documents` on this machine, where the answer is *unknown*.
