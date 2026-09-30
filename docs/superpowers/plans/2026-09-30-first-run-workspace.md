# The first start — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a freshly installed app asks the reader whether to make a workspace or open an existing
folder, says where the new one would go, and hands the answer to the same path the File menu's *Open
Folder…* takes.

**Architecture:** a pure rule (`services/workspace_setup.ts`) decides whether the app asks, from two
facts in the config (`workspace`, `workspace_asked`); a `QuestionCard` asks, with the two-hands rule
the prompt and the new-note card already follow; a flow makes or adopts the folder, calls
`workspaceManager.openWorkspace(path)` — the menu's own call — and remembers that it asked.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`), Tauri 2 (`@tauri-apps/api/path`,
`@tauri-apps/plugin-dialog`), daisyUI 5, the MCP bridge for probes, Node checks via rolldown.

**Spec:** `docs/superpowers/specs/2026-09-30-first-run-workspace-design.md` — read it with this plan.

## Global Constraints

- Every new module under `src/ui` opens with the three-line header (`docs/writing-comments.md`).
- `npx tsc --noEmit` is silent and `npm run check` passes after every task; the probes a task names
  must pass with the app running and the fixture workspace open.
- The card is a `QuestionCard` (`ui/floating/question_card.ts`): one answer at a time, Escape gives
  the cautious answer, and no surface takes the focus.
- The reader's own `~/Documents` is never written by a test: the create arm takes the documents
  folder as a parameter, and the probe chooses a folder it made itself.
- Commit style `type(scope): subject`, lower case, imperative; work on `codex/first-run`; **do not
  merge** — the user reviews. Behaviour changes name the test that proves them.

## Task 1: the config's second fact, and the rule over both

**Files:** `src-tauri/src/settings.rs`, `src/api/settings.ts`, `src/services/workspace_setup.ts`,
`test/checks/check-workspace-setup.mjs`

**Interfaces:** produces `DEFAULT_WORKSPACE_NAME` and
`needsWorkspaceQuestion({ workspace, workspace_asked })`.

- [ ] **Step 1: Write the failing check** — `test/checks/check-workspace-setup.mjs`, bundling
  `src/services/workspace_setup.ts` the way every check does, with:

```js
check('a fresh install is asked', needsWorkspaceQuestion({ workspace: null, workspace_asked: false }), true);
check('an empty workspace is no workspace', needsWorkspaceQuestion({ workspace: '', workspace_asked: false }), true);
check('a reader with a workspace is never asked', needsWorkspaceQuestion({ workspace: '/notes', workspace_asked: false }), false);
check('and one who has answered is never asked', needsWorkspaceQuestion({ workspace: null, workspace_asked: true }), false);
check('the workspace made for a reader is called Yi', DEFAULT_WORKSPACE_NAME, 'Yi');
```

- [ ] **Step 2: Run it — expect failure** (`Cannot find module`), the way Task 1 of the last plan did.

- [ ] **Step 3: The rule** — `src/services/workspace_setup.ts`:

```ts
/**
 * Whether the app asks the reader where their workspace is, and what the one it makes for them is
 * called. Pure — two facts of the config are passed in — so the rule is held in Node rather than
 * inferred from the app's start-up path.
 *
 * May import: nothing. Upholds: one answer to "does this install need asking", so the start-up path
 * and the check beside this file cannot disagree.
 */

/** The name a workspace made for the reader has, under their documents folder. */
export const DEFAULT_WORKSPACE_NAME = 'Yi';

/** What the rule needs of the config, and nothing else. */
export interface SetupFacts {
  workspace: string | null;
  workspace_asked: boolean;
}

/**
 * Whether the app should ask: a reader with no workspace, who has not been asked before. A
 * cancelled question leaves `workspace_asked` false, so saying "not now" is not remembered as
 * "never" — the next start asks again.
 */
export function needsWorkspaceQuestion(facts: SetupFacts): boolean {
  return !facts.workspace && !facts.workspace_asked;
}
```

- [ ] **Step 4: The config field** — `settings.rs`: `#[serde(default)] pub workspace_asked: bool` on
  `AppConfig` (with a doc comment saying it is written when the reader answers, so a config with no
  workspace is asked exactly once), `workspace_asked: false` in `Default`, and a Rust test that a
  config written before the field reads as `false`. `src/api/settings.ts`: the field on `AppConfig`
  with the same sentence.

- [ ] **Step 5: Verify and commit** — the check passes, `npx tsc --noEmit` silent, `npm run check`
  green, `cargo test` green; commit `feat(workspace): the config's own answer to "have we asked"`.

## Task 2: the words, in eight catalogues

**Files:** `locales/*.json`

**Interfaces:** the keys Task 3 reads: `workspace.setup.title`, `workspace.setup.message`,
`workspace.setup.where`, `workspace.setup.create`, `workspace.setup.useExisting`,
`workspace.setup.path`, `workspace.setup.use`, `workspace.setup.later`.

- [ ] **Step 1: Write the English** — `workspace.setup.where` is the line the reader is owed:
  `"A new workspace will be made in {folder}."`, and `workspace.setup.message` says what the app is
  asking: `"Yi keeps your notes in a folder. Make one, or open a folder you already have."`
- [ ] **Step 2: The other seven** — each language's own words beside the app's other workspace keys,
  the same register as the rest of the catalogue.
- [ ] **Step 3: Verify and commit** — `npm run check` (the catalogue check holds one key set per
  language, nothing blank, every key used); commit `feat(workspace): the words the first start asks
  in`.

## Task 3: the card

**Files:** `src/ui/workspace_setup/workspace_setup_dialog.ts`

**Interfaces:** produces `WorkspaceSetupRequest`, `WorkspaceSetupAnswer = { create: true } | { path: string } | null`,
`WorkspaceChooser { choose(request): Promise<WorkspaceSetupAnswer> }`, `workspaceSetupDialog`.

- [ ] **Step 1: Write the card** — `class WorkspaceSetupDialog extends QuestionCard<WorkspaceSetupAnswer>
  implements WorkspaceChooser`, `super('w-[26rem]')`, with the heading, the message, the where-line
  (from `request.defaultFolder`), and the three buttons: **create**, **use an existing folder…**,
  **not now** (`settle(null)`). Escape is `cautious()` → `null`. Markers:
  `data-workspace-setup`, `data-workspace-setup-where`, `data-workspace-setup-create`,
  `data-workspace-setup-choose`, `data-workspace-setup-path`, `data-workspace-setup-use`,
  `data-workspace-setup-later`.
- [ ] **Step 2: The two hands** — `useExisting()`: a reader gets the system picker
  (`open({ directory: true, multiple: false })`, `settle({ path })` when it answers a string);
  a probe gets the path field revealed and `use` settling `{ path: <the field> }`. Both by one rule
  (`drivenByTools()`).
- [ ] **Step 3: Verify and commit** — `npx tsc --noEmit` silent, `npm run check` green (the header
  check walks `src/ui/markdown` only, so the header is read by eye); commit
  `feat(workspace): the card the first start asks on`.

## Task 4: the flow

**Files:** `src/ui/workspace_setup/workspace_setup_flow.ts`

**Interfaces:** consumes the card and the rule; produces
`runWorkspaceSetup(chooser?: WorkspaceChooser, documents?: string): Promise<void>`.

- [ ] **Step 1: Write the flow** — the five steps of the spec's §3, with `documents` injectable:

```ts
export async function runWorkspaceSetup(
  chooser: WorkspaceChooser = workspaceSetupDialog,
  documents: string | null = null
): Promise<void> {
  const folder = documents ?? (await documentDir().catch(() => null));
  if (folder === null) {
    notify('Setting up a workspace', new Error(t('workspace.setup.noDocuments')));
    return;
  }
  const defaultFolder = await join(folder, DEFAULT_WORKSPACE_NAME);
  const answer = await chooser.choose({ defaultFolder });
  if (answer === null) {
    return;
  }
  let path = defaultFolder;
  if ('create' in answer) {
    try {
      path = await createEntry(folder, DEFAULT_WORKSPACE_NAME, false);
    } catch (error) {
      // A folder that is already there is adopted as it stands; anything else is the backend
      // saying no, and the reader hears it.
      if (!String(error).includes('already exists')) {
        notify('Setting up a workspace', error);
        return;
      }
    }
  } else {
    path = answer.path;
  }
  await workspaceManager.openWorkspace(path);
  await configManager.update({ workspace_asked: true });
}
```

- [ ] **Step 2: Verify and commit** — `npx tsc --noEmit` silent, `npm run check` green; commit
  `feat(workspace): making one, or opening one, is the menu's own path`.

## Task 5: the start-up wiring, and the probes

**Files:** `src/main.ts`, `test/probes/first-run.js`, `test/probes/first-run-create.js`

**Interfaces:** consumes `needsWorkspaceQuestion`, `runWorkspaceSetup`.

- [ ] **Step 1: Wire it** — in `initializeConfig`, after the config-change listener and **before**
  `await documentSession.load()`:

```ts
    // A fresh install has no workspace: ask once, and ask before the session restores a document —
    // a restored document opens into a window that has to know its folder.
    if (needsWorkspaceQuestion({ workspace: cfg.workspace ?? null, workspace_asked: cfg.workspace_asked })) {
      await runWorkspaceSetup();
    }
```

- [ ] **Step 2: `first-run.js`** — the reader's half: put the config in the first-run state
  (`{ workspace: null, workspace_asked: false }`), reload the window as `localization.js` does, and
  the card is there with the where-line naming `Documents/Yi`; press **use an existing folder…**,
  type the folder the probe made under `$HOME`, press **use**, and the tree lists it, the config
  holds it as its workspace and `workspace_asked` is true. A second pass — first-run state again,
  reload, press **not now** — writes nothing. `finally`: restore the config and delete the folder.
- [ ] **Step 3: `first-run-create.js`** — the create arm without the reader's Documents: call
  `runWorkspaceSetup(chooser, tempDocuments)` with a chooser that answers `{ create: true }`, assert
  `<tempDocuments>/Yi` exists and is the workspace in the config, then run it again (the folder is
  already there) and assert it is adopted rather than doubled.
- [ ] **Step 4: Verify and commit** — both probes green inside the bridge's 5 s budget, `npm run
  check` green; commit `test(workspace): the first start, end to end`.

## Task 6: the guides

**Files:** `docs/ai-context.md`, `docs/architecture.md`, `docs/roadmap.md`, `test/README.md`

- [ ] **Step 1: Write them** — ai-context: the first start, the two config facts and the card;
  architecture: a row for the first start in "where does this change go?"; roadmap: the Closed entry
  with the ask and the `workspace_asked` decision; test/README: the new check and the two probes.
- [ ] **Step 2: Verify and commit** — `npm run check`; commit `docs: the first start`.

## Self-review

- Spec §1 → Task 1 (the rule, the field, its Rust test). §2 → Tasks 2 and 3 (the words, the card,
  the where-line). §3 → Task 4 (the flow, the menu's own call, the flag). §4 → Task 5 (the wiring,
  and the probes that prove the reader's half and the create arm). Testing → the check in Task 1 and
  the two probes in Task 5; "the reader's Documents is never written" → Task 4's `documents`
  parameter and Task 5's temp folder.
- Placeholder scan: every step writes out the code or the exact keys; the one interface the plan
  names without writing in full (`WorkspaceChooser`) is written in Task 3's Interfaces block, which
  is where its signature lives.
