# The first start: choosing a workspace

## Problem

A freshly installed app has no workspace, and nothing asks for one. The config's `workspace` is
`None`, `main.ts: initializeConfig` therefore never emits `WORKSPACE_CHANGED`, and the window comes
up with an empty tree and an editor showing an untitled document — while the only way to a workspace
is the *Open Folder…* item buried in the File menu. The reader's first minute is spent looking for
the thing the app should have asked them about.

What the app already has, and this feature reuses rather than repeats:

- the menu's own path: Rust picks a folder (`menu.rs: pick_folder`), emits `open_folder`, and
  `main.ts:117` hands the path to `workspaceManager.openWorkspace(path)`, which announces
  `WORKSPACE_CHANGED` and persists the config (`services/workspace.ts`);
- a question over the page that the reader and a probe both answer: `ui/prompt.ts` and
  `ui/new_document/new_document_dialog.ts` show the pattern — a system surface for the reader,
  a card for a probe, chosen by one rule (`ui/under_test.ts: drivenByTools`);
- the family that card belongs to: `ui/floating/question_card.ts`, a veil with one answer at a time
  and Escape giving the cautious one.

## Design

### 1. When the app asks

`src/services/workspace_setup.ts`, pure and checked in Node:

```ts
/** Whether the app should ask the reader where their workspace is. */
export function needsWorkspaceQuestion(config: { workspace: string | null; workspace_asked: boolean }): boolean;

/** The name a workspace made for the reader has, under their documents folder. */
export const DEFAULT_WORKSPACE_NAME = 'Yi';
```

The rule: ask when there is **no workspace** and the app has **not asked before**. The config grows
one field — `workspace_asked: bool`, `#[serde(default)]` — written when the reader answers. A
cancelled question leaves it unset, so the next start asks again: a reader who says "not now" is not
remembered as "never". A reader who already has a workspace (every config written before this
feature, since only *Open Folder…* set one) is never asked.

### 2. The card

`src/ui/workspace_setup/workspace_setup_dialog.ts`, a `QuestionCard`:

- the heading, a line of explanation, **and a line that says where a new workspace will be made** —
  the default folder spelled out (`/Users/…/Documents/Yi`, the path `documentDir()` answers with),
  because a reader being offered "create one" is owed the answer to "where".
- two answers: **Create a new workspace** and **Use an existing folder…**. Escape is "not now", the
  cautious answer the kind already gives.
- "use an existing" asks by hand: the reader gets the system folder picker
  (`open({ directory: true })`, the surface the settings' image-folder field already uses), and a
  probe gets a path field and a confirm button on the card — the two-hands rule, one rule deciding
  which hand is in the room.
- markers a probe finds: `data-workspace-setup`, `data-workspace-setup-where`,
  `data-workspace-setup-create`, `data-workspace-setup-choose`, `data-workspace-setup-path`,
  `data-workspace-setup-use`, `data-workspace-setup-later`.

### 3. What choosing does

`src/ui/workspace_setup/workspace_setup_flow.ts`:

```ts
export interface WorkspaceChoice {
  choose(request: { defaultFolder: string }): Promise<{ create: true } | { path: string } | null>;
}

/**
 * Asks, makes the folder if the reader asked for one, opens it the way the menu does, and
 * remembers that the question was answered. `documents` is injectable so a probe never writes to
 * the reader's own Documents folder.
 */
export async function runWorkspaceSetup(
  chooser?: WorkspaceChooser,
  documents?: string
): Promise<void>;
```

1. `defaultFolder = join(await documentDir(), DEFAULT_WORKSPACE_NAME)`.
2. Ask. `null` (Escape, or the picker cancelled) ends the flow and writes nothing.
3. `create` → `createEntry(documents, DEFAULT_WORKSPACE_NAME, false)`; a folder that is already
   there is adopted as it stands rather than making a second one.
4. Either way, `workspaceManager.openWorkspace(path)` — the menu's own call, so the tree, the
   config and the session follow exactly as they do after *Open Folder…*.
5. `configManager.update({ workspace_asked: true })`.

### 4. Where it is wired

`main.ts: initializeConfig`, after the config is loaded and **before** `documentSession.load()` —
before, so a restored document opens into a window that already knows its workspace, which is why
the session load already sits where it does.

## Testing

- **A Node check** (`test/checks/check-workspace-setup.mjs`): no workspace and no answer → ask; a
  workspace → never; answered → never; and the default name is `Yi`.
- **A probe** (`test/probes/first-run.js`): put the config in the first-run state, reload the window,
  and the card is there at startup — with the line that says where a new workspace would be made;
  take *use an existing folder*, type a folder the probe made under `$HOME`, confirm, and the tree
  lists it and the config holds it as its workspace; then Escape on a fresh first-run state writes
  nothing and the config is restored in a `finally`.
- **The create arm** through the same flow with `documents` pointed at the probe's own temp folder:
  the folder appears, it is adopted when it already exists, and the workspace opens — the reader's
  own Documents folder is never touched by a test.

## Out of scope

- A menu item or a settings control to run the setup again (the *Open Folder…* item is the way back).
- Anything *inside* a new workspace: it is created empty, as a folder the reader then fills.
- Migrating configs written before `workspace_asked` existed: a config with a workspace is never
  asked, and one without is asked once, which is the whole of the migration.
- Native sheet hands beyond the folder picker: creating a folder needs no question of its own.
