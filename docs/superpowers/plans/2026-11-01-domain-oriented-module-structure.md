# Domain-Oriented Module Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize Yi's frontend and backend modules into explicit domains, remove repeated filename prefixes, and make each domain expose one intentional public surface without changing behavior.

**Architecture:** Preserve the existing `ui/`, `services/`, `api/`, `commands/`, `events/` and Rust module layers. Move related modules into domain folders, add explicit `index.ts`/`mod.rs` facades, keep the approved cross-app facades stable, and update every import and dynamic probe path.

**Tech Stack:** TypeScript 7, Vite/Tauri, Rust, Node checks with Rolldown, Tauri MCP probes.

**Spec:** `docs/superpowers/specs/2026-11-01-domain-oriented-module-structure-design.md`

## Global Constraints

- Preserve behavior, command names, event names, persistence formats, DOM behavior and Tauri command paths.
- Keep `src/api/*`, `src/commands/*`, `src/ui/markdown/markdown_editor.ts`, `src/main.ts` and `src/settings.ts` stable.
- Domain public entrypoints use explicit named exports; do not add wildcard re-exports.
- Remove a repeated parent-domain prefix inside domain folders.
- Do not create `shared/`, `utils/`, `misc/`, `common/` or other generic buckets.
- Deep imports are limited to the owning domain and tests that intentionally inspect an internal rule.
- Update every TypeScript import, Rust module import, Node check, probe dynamic import, and documentation path in the same commit as the move.
- Use `apply_patch` for source edits and file moves. Bulk import rewriting may use a deterministic text replacement after the file map is fixed.
- Restart `npm run tauri dev` before Tauri probes after a broad source move.
- Keep commits in the form `type(scope): lower-case imperative subject`.

---

### Task 1: Record the Permanent Organization Guide

**Files:**
 - Modify: `AGENTS.md`
 - Modify: `docs/structure.md`
 - Modify: `docs/ai-context.md`
 - Read: `docs/superpowers/specs/2026-11-01-domain-oriented-module-structure-design.md`

**Interfaces:**
- Consumes: the approved organization rules in the spec.
- Produces: repository instructions that every later migration task must follow.

- [ ] **Step 1: Add the short non-negotiable guide to `AGENTS.md`**

Add these bullets under **Design rules**:

```markdown
- Organize modules by owned domain and capability. A folder must represent shared state,
  lifecycle, an operation family, or a provider/consumer boundary; do not create generic
  `shared/`, `utils/`, `misc/` or `common/` folders.
- A domain exposes one explicit public entrypoint (`index.ts` or Rust `mod.rs`) with named exports.
  Do not add wildcard facade exports or compatibility barrels.
- Do not repeat the parent domain in a child filename: `session/model.ts`, not
  `session/session_model.ts`. Role names such as `model`, `rules`, `state`, `contracts`, `dialog`
  and `flow` are encouraged when they explain ownership.
- Cross-domain consumers import the public domain entrypoint. Deep imports belong to the owning
  domain or a test that deliberately targets an internal rule.
- Keep the approved stable facades (`src/api/*`, `src/commands/*`,
  `src/ui/markdown/markdown_editor.ts`, the two entrypoints and Rust command paths) intentional;
  move their internals without creating a second old-path API.
```

- [ ] **Step 2: Add the detailed guide to `docs/structure.md`**

Insert a `## Module organization guide` section before `## Which way the imports point`. Copy all twelve permanent rules from the spec's **Permanent Module-Organization Guide** verbatim, including the rule that file moves preserve behavior and update tests/docs.

- [ ] **Step 3: Point `docs/ai-context.md` at the guide**

In the paragraph that introduces `docs/structure.md`, add:

```markdown
Its module-organization guide is binding: organize by domain and capability, expose one explicit
domain entrypoint, remove repeated parent/domain prefixes from child filenames, and update imports
in the same change that moves a module.
```

- [ ] **Step 4: Verify the documentation-only commit**

Run:

```bash
git diff --check
npm run check
```

Expected: `git diff --check` is silent and all project checks pass.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/structure.md docs/ai-context.md
git commit -m "docs: record module organization guide"
```

---

### Task 2: Create the Session Service Domain

**Files:**
- Move: `src/services/session.ts` -> `src/services/session/index.ts`
- Move: `src/services/session_rules.ts` -> `src/services/session/rules.ts`
- Move: `src/services/session_model.ts` -> `src/services/session/model.ts`
- Move: `src/services/session_open.ts` -> `src/services/session/open.ts`
- Move: `src/services/session_edit.ts` -> `src/services/session/edit.ts`
- Move: `src/services/session_editor.ts` -> `src/services/session/editor.ts`
- Move: `src/services/session_files.ts` -> `src/services/session/files.ts`
- Move: `src/services/session_persistence.ts` -> `src/services/session/persistence.ts`
- Move: `src/services/session_serialization.ts` -> `src/services/session/serialization.ts`
- Modify: every importer found by `rg -l "services/session_rules|from './session_rules'|from '../services/session_rules|/src/services/session\\.ts"`
- Test: `test/checks/check-session-rules.mjs`
- Test: `test/probes/document-session-restart.js`
- Test: `test/probes/document-opens-without-a-caret.js`
- Test: `test/probes/document-stack-ask.js`

**Interfaces:**
- `src/services/session/index.ts` exports `documentSession`, `DOCUMENT_SESSION_CHANGED`, `SessionEditor`, `SessionState`, `SessionDocument`, `DocumentView`, `SeenView` and `IncomingDocument`.
- `src/services/session/rules.ts` explicitly exports the existing pure names from `model.ts`, `open.ts`, `edit.ts` and `serialization.ts`; it does not use `export *`.
- `src/services/session/model.ts` continues to export `SESSION_VERSION`, the session types, `keyFor`, `openDocument`, `currentDocument`, `stackedDocuments`, `isSaved`, `emptySession` and `reachable`.
- `src/services/session/open.ts` continues to export `OpenAction`, `openDecision`, `openInto`, `replaceReference`, `setStacked`, `StackNavigation`, `stackNavigation`, `restore` and `dropFromStack`.
- `src/services/session/edit.ts` continues to export `recordContent`, `capture`, `mergeView`, `markSaved`, `setPath` and `adoptVersion`.
- `src/services/session/serialization.ts` continues to export `serializeSession` and `parseSession`.

- [ ] **Step 1: Move all nine files into `src/services/session/`**

Use `apply_patch` `*** Move to:` operations so Git records the files as renames. Do not change bodies in this step.

- [ ] **Step 2: Internalize session dependencies**

Change imports inside the new folder:

```ts
// session/index.ts
import { ... } from './model';
import { ... } from './open';
import { ... } from './edit';
import { loadPersistedSession, persistSession } from './persistence';
import { chooseDocumentPath, readDocumentFile, writeDocumentFile } from './files';
import { captureEditorDocument, showDocumentInEditor, type SessionEditor } from './editor';

// session/editor.ts
import type { DocumentView, SeenView, SessionDocument, SessionState } from './model';
import { capture as captureState } from './edit';

// session/persistence.ts
import { loadSessionText, saveSessionText } from '../../api/session';
import { grantFolder } from '../../api/files';
import { parseSession } from './serialization';

// session/files.ts
import { grantFolder, writeTextAtomically } from '../../api/files';
```

Import each symbol from its actual module rather than routing all runtime calls through `rules.ts`.

- [ ] **Step 3: Make the two public session facades explicit**

In `session/index.ts`, export only the living session, event constant and public editor/session view types. Remove the old `export type { SessionEditor }` compatibility line after moving the source.

In `session/rules.ts`, replace:

```ts
export * from './model';
export * from './open';
export * from './edit';
export * from './serialization';
```

with an explicit list of every public name listed in the **Interfaces** block above.

- [ ] **Step 4: Update all consumers and dynamic probe paths**

Run:

```bash
rg -n "services/session_rules|from './session_rules'|from '../services/session_rules|/src/services/session\\.ts" src test
```

Update:

- app/session consumers to `services/session` for `documentSession`, `DOCUMENT_SESSION_CHANGED` and public session view types;
- Node checks to `src/services/session/rules.ts`;
- probes to `/src/services/session/index.ts`;
- internal session files to relative `./model`, `./open`, `./edit`, `./serialization`, `./editor`, `./files` and `./persistence`.

The command must return no old session paths afterward.

- [ ] **Step 5: Run the focused static verification**

Run:

```bash
npx tsc --noEmit
npm run check
```

Expected: both pass; `headers` and `layering` checks include the new domain files.

- [ ] **Step 6: Restart the app and run session probes**

Run `npm run tauri dev`, then:

```bash
npm run probe -- test/probes/document-session-restart.js
npm run probe -- test/probes/document-opens-without-a-caret.js
npm run probe -- --with-workspace test/probes/document-stack-ask.js
```

Expected: every probe reports `"failed": []`.

- [ ] **Step 7: Commit**

```bash
git add src/services/session src/services/session.ts src/services/session_rules.ts \
  src/services/session_model.ts src/services/session_open.ts src/services/session_edit.ts \
  src/services/session_editor.ts src/services/session_files.ts src/services/session_persistence.ts \
  src/services/session_serialization.ts src test
git commit -m "refactor(session): group the session domain"
```

---

### Task 3: Create Workspace and New-Document Service Domains

**Files:**
- Move: `src/services/workspace.ts` -> `src/services/workspace/index.ts`
- Move: `src/services/workspace_folders.ts` -> `src/services/workspace/folders.ts`
- Move: `src/services/workspace_setup.ts` -> `src/services/workspace/setup.ts`
- Move: `src/services/new_document.ts` -> `src/services/new_document/index.ts`
- Move: `src/services/new_document_builtins.ts` -> `src/services/new_document/builtins.ts`
- Move: `src/services/new_document_templates.ts` -> `src/services/new_document/templates.ts`
- Modify: every importer found by the path scan in Step 3
- Test: `test/checks/check-workspace-folders.mjs`
- Test: `test/checks/check-new-document.mjs`
- Test: `test/probes/new-markdown.js`
- Test: `test/probes/workspace-setup.js`

**Interfaces:**
- `services/workspace/index.ts` explicitly exports `WORKSPACE_CHANGED`, `WorkspaceManager`, `workspaceManager`, `FOLDER_LIMIT`, `FolderOption`, `FolderLister`, `fileName`, `parentFolder`, `placementOfPath`, `relativePathFrom`, `joinPath`, `destinationForFile`, `destinationPaths`, `expandHome`, `DEFAULT_WORKSPACE_NAME`, `SetupFacts` and `needsWorkspaceQuestion`.
- `services/new_document/index.ts` explicitly exports `REQUIRED_KEYS`, `RequiredKey`, `DEFAULT_TITLE`, `DEFAULT_KEYWORDS`, `DEFAULT_TEMPLATE`, `NewDocumentFields`, `newDocumentText`, `mergeFrontmatterTemplates`, `newDocumentId`, `newDocumentDate`, `titleRange`, `BuiltInNewNoteTemplate`, `BUILTIN_NOTE_TEMPLATES`, `BUILT_IN_NOTE_METADATA`, `NewNoteTemplate`, `newNoteTemplates` and `newNoteMetadata`.

- [ ] **Step 1: Move the six service files**

Move `workspace.ts`, `workspace_folders.ts` and `workspace_setup.ts` into `services/workspace/`, and `new_document.ts`, `new_document_builtins.ts` and `new_document_templates.ts` into `services/new_document/`.

- [ ] **Step 2: Add explicit domain facades**

Create `services/workspace/index.ts` as a facade that keeps the existing `WorkspaceManager` implementation in `index.ts` and explicitly re-exports the symbols from `folders.ts` and `setup.ts`.

Create `services/new_document/index.ts` by moving the pure note-building implementation there; explicitly re-export symbols from `builtins.ts` and `templates.ts`.

- [ ] **Step 3: Update imports and probes**

Run:

```bash
rg -n "services/workspace_folders|services/workspace_setup|services/new_document_builtins|services/new_document_templates|/src/services/new_document\\.ts" src test
```

Replace internal and cross-domain imports with `services/workspace` or `services/new_document`. Update dynamic probe paths to:

```text
/src/services/new_document/index.ts
/src/services/workspace/index.ts
```

The old prefixed paths must not remain.

- [ ] **Step 4: Run checks**

```bash
npx tsc --noEmit
npm run check
```

Expected: both pass.

- [ ] **Step 5: Run affected probes**

Restart the app, then:

```bash
npm run probe -- test/probes/new-markdown.js
npm run probe -- test/probes/workspace-setup.js
```

Expected: `"failed": []`.

- [ ] **Step 6: Commit**

```bash
git add -A src/services test
git commit -m "refactor(services): group workspace and new-document domains"
```

---

### Task 4: Group the Remaining Service Domains

**Files:**
- Move: `src/services/app_events.ts` -> `src/services/events/contracts.ts`
- Move: `src/services/event_manager.ts` -> `src/services/events/manager.ts`
- Create: `src/services/events/index.ts`
- Move: `src/services/bibliography.ts` -> `src/services/bibliography/index.ts`
- Move: `src/services/citation_reference.ts` -> `src/services/bibliography/reference.ts`
- Move: `src/services/document_identity.ts` -> `src/services/documents/identity.ts`
- Move: `src/services/document_manager.ts` -> `src/services/documents/manager.ts`
- Create: `src/services/documents/index.ts`
- Move: `src/services/versioning.ts` -> `src/services/versioning/rules.ts`
- Move: `src/services/versions.ts` -> `src/services/versioning/versions.ts`
- Create: `src/services/versioning/index.ts`
- Modify: all importers of the old paths

**Interfaces:**
- `events/index.ts` explicitly exports the current `AppEvents` contract names, `AppEvent`, `EventManager` and `eventManager`.
- `bibliography/index.ts` exports `CITATION_UPDATED`, `BibliographyManager`, `bibliographyManager` and the public reference helper.
- `documents/index.ts` explicitly exports the current identity functions/types and `DocumentManager`/`documentManager`.
- `versioning/index.ts` explicitly exports the pure rules and the living `VERSIONS_CHANGED`, `VersionsReading`, `VersionsOfDocument` contract and `versionsOfDocument`.
- `versioning/versions.ts` imports pure rules from `./rules`; it does not import `./index`.

- [ ] **Step 1: Move event files and create the event facade**

Move `app_events.ts` to `events/contracts.ts` and `event_manager.ts` to `events/manager.ts`. Update their mutual imports. Add `events/index.ts` with explicit exports.

- [ ] **Step 2: Move bibliography and document modules**

Move `bibliography.ts` to `bibliography/index.ts` and `citation_reference.ts` to `bibliography/reference.ts`; update the living manager to import `./reference`.

Move `document_identity.ts` and `document_manager.ts` to `documents/`. Add `documents/index.ts` with an explicit export list.

- [ ] **Step 3: Move versioning modules and break the facade cycle**

Move pure `versioning.ts` to `versioning/rules.ts` and living `versions.ts` to `versioning/versions.ts`. Change `versions.ts` to import pure rules from `./rules`. Add `versioning/index.ts` that explicitly re-exports both modules.

- [ ] **Step 4: Update imports and dynamic paths**

Run:

```bash
rg -n "services/app_events|services/event_manager|services/citation_reference|services/document_identity|services/document_manager|services/versions|/src/services/(app_events|event_manager|document_manager|versions|versioning)\\.ts" src test
```

Replace with the public domain index when the consumer is outside the domain. Inside a domain,
import sibling files directly. Update these dynamic imports exactly:

```text
/src/services/app_events.ts       -> /src/services/events/index.ts
/src/services/event_manager.ts    -> /src/services/events/index.ts
/src/services/bibliography.ts     -> /src/services/bibliography/index.ts
/src/services/document_manager.ts -> /src/services/documents/index.ts
/src/services/versioning.ts       -> /src/services/versioning/index.ts
/src/services/versions.ts         -> /src/services/versioning/index.ts
```

- [ ] **Step 5: Run static checks and import-cycle verification**

```bash
npx tsc --noEmit
npm run check
```

Expected: both pass; the existing import-cycle check remains green.

- [ ] **Step 6: Run representative service probes**

Restart the app, then:

```bash
npm run probe -- test/probes/versioning-list.js
npm run probe -- test/probes/citation-renders.js
npm run probe -- test/probes/workspace-outside-home.js
```

Expected: `"failed": []`.

- [ ] **Step 7: Commit**

```bash
git add -A src/services test
git commit -m "refactor(services): group related service domains"
```

---

### Task 5: Remove Repeated Prefixes in Simple UI Domains

**Files:**
- Move: `src/ui/documentation/documentation_flow.ts` -> `documentation/flow.ts`
- Move: `src/ui/documentation/documentation_text.ts` -> `documentation/text.ts`
- Move: `src/ui/documentation/documentation.en.md` -> `documentation/en.md`
- Create: `src/ui/documentation/index.ts`
- Move: `src/ui/image/image_dialog.ts` -> `image/dialog.ts`
- Move: `src/ui/image/image_flow.ts` -> `image/flow.ts`
- Move: `src/ui/image/image_urls.ts` -> `image/urls.ts`
- Create: `src/ui/image/index.ts`
- Move: `src/ui/settings/citation_settings.ts` -> `settings/citation.ts`
- Move: `src/ui/settings/general_settings.ts` -> `settings/general.ts`
- Move: `src/ui/settings/new_document_settings.ts` -> `settings/new_document.ts`
- Move: `src/ui/settings/settings_window.ts` -> `settings/index.ts`
- Move: `src/ui/table/table_menu.ts` -> `table/menu.ts`
- Move: `src/ui/table/table_menu_model.ts` -> `table/model.ts`
- Create: `src/ui/table/index.ts`
- Move every `src/ui/toolbar/*_toolbar.ts` to its unprefixed name
- Move: `src/ui/toolbar/toolbar.ts` -> `toolbar/base.ts`
- Create: `src/ui/toolbar/index.ts`
- Move every `src/ui/tutorial/tutorial_*.ts` to `tutorial/{flow,rules,text}.ts`
- Create: `src/ui/tutorial/index.ts`

**Interfaces:**
- `documentation/index.ts` exports `documentationText`, `openDocumentation` and `registerDocumentationCommand`.
- `image/index.ts` exports `ImageRequest`, `ImageChooser`, `ImageDialog`, `imageDialog`, `insertImage`, `setDocumentFolder`, `setImageFolder`, `imageBases` and `imageSourceCandidates`.
- `settings/index.ts` exports `openSettingsWindow`, `SettingsWindow`, `GeneralSettings`, `NewDocumentSettings` and `CitationSettings`.
- `table/index.ts` exports `showTableMenu`, `TableMenuNode` and `tableMenuModel`.
- `toolbar/index.ts` exports `Toolbar`, `ToolbarButtonSpec`, `TOOL_ICON_SIZE`, `STATUS_BUTTON`, `TableSize`, `TablePicker`, `FootnoteToolbar`, `TableToolbar`, `LinkToolbar`, `ImageToolbar`, `LayoutToolbar`, `SessionToolbar`, `FormattingToolbar` and `ListToolbar`.
- `tutorial/index.ts` exports `tutorialText`, `openTutorial`, `openTutorialForFirstStart`, `registerTutorialCommand`, `TUTORIAL_LANGUAGES`, `TutorialLanguage`, `tutorialLanguage` and `shouldOpenTutorial`.
- No new domain index uses `export *`.

- [ ] **Step 1: Move the simple domain files**

Use `apply_patch` move operations for each mapping. Keep file bodies unchanged.

- [ ] **Step 2: Add explicit domain facades**

Create `index.ts` in `documentation/`, `image/`, `table/`, `toolbar/` and `tutorial/`. For `settings/`, the moved `settings_window.ts` becomes `index.ts`. Update all internal sibling imports to the new unprefixed filenames.

- [ ] **Step 3: Update cross-domain imports and documentation**

Run:

```bash
rg -n "documentation_(flow|text)|image_(dialog|flow|urls)|(_settings|table_menu|_toolbar|tutorial_)" src test docs
```

Replace imports with the domain indexes or new filenames. Update documentation asset references from `documentation.en.md` to `en.md`.

- [ ] **Step 4: Run static checks**

```bash
npx tsc --noEmit
npm run check
```

Expected: both pass, including class-name and header checks.

- [ ] **Step 5: Run affected UI probes**

Restart the app, then:

```bash
npm run probe -- test/probes/documentation.js
npm run probe -- test/probes/image-path-with-spaces.js
npm run probe -- test/probes/table-menu.js
npm run probe -- test/probes/format-buttons.js
npm run probe -- test/probes/tutorial.js
```

Expected: `"failed": []`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/documentation src/ui/image src/ui/settings src/ui/table \
  src/ui/toolbar src/ui/tutorial src test docs
git commit -m "refactor(ui): remove repeated domain prefixes"
```

---

### Task 6: Create Nested Workspace, Versioning, Manager and Template Domains

**Files:**
- Move every `src/ui/workspace/tree_*.ts` into `src/ui/workspace/tree/`
- Move: `tree.ts` -> `tree/index.ts`
- Move: `tree_drag.ts` -> `tree/drag.ts`
- Move: `tree_menu.ts` -> `tree/menu.ts`
- Move: `tree_menu_model.ts` -> `tree/menu_model.ts`
- Move: `tree_ops.ts` -> `tree/ops.ts`
- Move: `tree_rename.ts` -> `tree/rename.ts`
- Move: `tree_rules.ts` -> `tree/rules.ts`
- Create: `src/ui/workspace/index.ts`
- Move every `src/ui/versioning/version_*.ts` to `versioning/` without the `version_` prefix
- Rename `versioning/versioning_dialog.ts` -> `versioning/dialog.ts`
- Create: `src/ui/versioning/index.ts`
- Move: `src/ui/workspace_setup/workspace_setup_dialog.ts` -> `workspace_setup/dialog.ts`
- Move: `src/ui/workspace_setup/workspace_setup_flow.ts` -> `workspace_setup/flow.ts`
- Create: `src/ui/workspace_setup/index.ts`
- Move: `src/ui/export/manager/export_manager.ts` -> `manager/index.ts`
- Move: `src/ui/export/manager/export_manager_flow.ts` -> `manager/flow.ts`
- Move: `src/ui/export/manager/manager_rules.ts` -> `manager/rules.ts`
- Move: `src/ui/export/templates/package_browser.ts` -> `templates/browser.ts`
- Move: `src/ui/export/templates/package_rows.ts` -> `templates/rows.ts`
- Move: `src/ui/export/templates/template_code_editor.ts` -> `templates/code_editor.ts`
- Move: `src/ui/export/templates/template_file_list.ts` -> `templates/file_list.ts`
- Create: `src/ui/export/manager/index.ts`
- Create: `src/ui/export/templates/index.ts`

**Interfaces:**
- `workspace/tree/index.ts` explicitly exports `DOCUMENT_OPENED`, `WorkspaceTree`, `TreeMenuAction`, `TreeMenuNode`, `TreeMenuEntry`, `treeMenuNodes`, `treeMenuActions`, `TreeEntry`, `nameSelection`, `nameWithoutExtension`, `DropDecision`, `dropDecision`, `makeDragSource`, `makeDropTarget`, `RenameTarget`, `beginRename`, `TreeHost` and `setTreeHost`.
- `workspace/index.ts` explicitly re-exports the tree component and public tree types from `./tree`.
- `versioning/index.ts` exports `VersionToSee`, `VersionDiffView`, `VersionHistoryModal`, `VersionCommentDialog`, `versionCommentDialog`, `VersionStatus`, `VersioningQuestion`, `VersioningChooser`, `VersioningDialog`, `versioningDialog`, `registerVersionCommand` and `saveVersion`.
- `workspace_setup/index.ts` exports `runWorkspaceSetup`, `WorkspaceSetupRequest`, `WorkspaceSetupAnswer`, `WorkspaceChooser`, `WorkspaceSetupDialog` and `workspaceSetupDialog`.
- `export/manager/index.ts` exports `ExportManagerSnapshot`, `ExportManagerSource`, `liveExportManagerSource`, `ExportManager`, `exportManager`, `ExportManagerHost`, `registerExportManagerCommand`, `KindPageHandlers`, `KindPageState`, `KindPage`, `ManagerKindRow`, `ManagerGroup`, `PackageActionAvailability`, `DefaultsActionAvailability`, `managerGroups`, `unassignedPackages`, `packageActionAvailability`, `defaultsActionAvailability`, `DefaultsState` and `defaultsState`.
- `export/templates/index.ts` explicitly exports the public declarations from `browser.ts`, `rows.ts`, `code_editor.ts`, `file_list.ts`, `create_default_dialog.ts`, `details.ts`, `editor.ts`, `import_dialog.ts`, `kind_label.ts`, `library.ts`, `manifest_rules.ts` and `offering.ts`.

- [ ] **Step 1: Move the tree domain**

Create `ui/workspace/tree/` and move all seven `tree_*` modules. Update relative imports so `index.ts` imports `./drag`, `./menu`, `./menu_model`, `./ops`, `./rename` and `./rules`.
Add `ui/workspace/index.ts` with explicit re-exports from `./tree`; update shell imports to use `ui/workspace`.

- [ ] **Step 2: Move versioning and workspace setup**

Move all versioning-prefixed files to unprefixed names. Update imports to `.`, `./diff_view`, `./history_modal`, `./comment_dialog`, `./dialog`, `./save`, `./status` as appropriate. Add `versioning/index.ts`.

Move workspace-setup files to `dialog.ts` and `flow.ts`; add `workspace_setup/index.ts`.

- [ ] **Step 3: Normalize export manager and template names**

Move manager files to `index.ts`, `flow.ts` and `rules.ts`. Move template package UI files to `browser.ts`, `rows.ts`, `code_editor.ts` and `file_list.ts`. Keep functional names such as `create_default_dialog.ts`, `details.ts`, `editor.ts`, `import_dialog.ts`, `kind_label.ts`, `library.ts`, `manifest_rules.ts` and `offering.ts`.

Add explicit manager/template indexes at the paths above.

- [ ] **Step 4: Update imports and probe paths**

Run:

```bash
rg -n "workspace/tree_|versioning/version_|versioning/versioning_dialog|workspace_setup/workspace_setup_|manager/export_manager|templates/(package_browser|package_rows|template_code_editor|template_file_list)" src test
```

Replace with the new public domain entrypoints or sibling paths. Update all probe dynamic imports to new index paths.

- [ ] **Step 5: Run static checks**

```bash
npx tsc --noEmit
npm run check
```

Expected: both pass.

- [ ] **Step 6: Run affected probes**

Restart the app, then:

```bash
npm run probe -- --with-workspace test/probes/tree-no-reload.js
npm run probe -- test/probes/versioning-list.js
npm run probe -- test/probes/versioning-restore.js
npm run probe -- test/probes/workspace-setup.js
npm run probe -- test/probes/export-manager.js
npm run probe -- test/probes/export-template-ui.js
```

Expected: `"failed": []`; long probes may report bridge recovery but must report no failed checks.

- [ ] **Step 7: Commit**

```bash
git add src/ui/workspace src/ui/versioning src/ui/workspace_setup \
  src/ui/export/manager src/ui/export/templates src test
git commit -m "refactor(ui): group nested workspace and export domains"
```

---

### Task 7: Create Markdown Editor and Renderer Domains

**Files:**
- Move: `editor_command_wiring.ts` -> `src/ui/markdown/editor/command_wiring.ts`
- Move: `editor_history.ts` -> `editor/history.ts`
- Move: `editor_keyboard.ts` -> `editor/keyboard.ts`
- Move: `editor_page_layout.ts` -> `editor/page_layout.ts`
- Move: `editor_render_context.ts` -> `editor/render_context.ts`
- Move: `editor_view_state.ts` -> `editor/view_state.ts`
- Create: `src/ui/markdown/editor/index.ts`
- Move: `renderer_block_cache.ts` -> `src/ui/markdown/renderer/block_cache.ts`
- Move: `renderer_dom.ts` -> `renderer/dom.ts`
- Move: `renderer_geometry.ts` -> `renderer/geometry.ts`
- Move: `renderer_measurements.ts` -> `renderer/measurements.ts`
- Create: `src/ui/markdown/renderer/index.ts`
- Keep: `markdown_editor.ts`
- Keep: `virtual_block_renderer.ts`

**Interfaces:**
- `editor/index.ts` explicitly exports `installEditorCommandWiring`, `applyEditorHistory`, `handleEditorShortcut`, `handleArrowKey`, `EditorPageLayout`, `EditorLayout`, `createEditorRenderContext`, `EditorViewState` and their public types.
- `renderer/index.ts` explicitly exports `RendererBlockCache`, `RendererDom`, `RendererGeometry`, `ScrollAnchor` and `RendererMeasurements`.
- `markdown_editor.ts` continues importing through `./editor` and `./renderer`, not internal files.

- [ ] **Step 1: Move editor-family files**

Create `ui/markdown/editor/` and move the six `editor_*` modules to unprefixed filenames.

- [ ] **Step 2: Move renderer-family internals**

Create `ui/markdown/renderer/` and move the four `renderer_*` modules. Keep `virtual_block_renderer.ts` at the markdown root.

- [ ] **Step 3: Add explicit domain indexes and update imports**

Create `editor/index.ts` and `renderer/index.ts`. Update `markdown_editor.ts` and `virtual_block_renderer.ts` to import from these indexes. Update external imports found by:

```bash
rg -n "markdown/editor_|from './editor_|from '../editor_|renderer_(block_cache|dom|geometry|measurements)" src test
```

No old editor/renderer prefixed path remains.

- [ ] **Step 4: Run static checks**

```bash
npx tsc --noEmit
npm run check
```

Expected: both pass.

- [ ] **Step 5: Run editor architecture probes**

Restart the app, then:

```bash
npm run probe -- test/probes/undo-typing.js
npm run probe -- test/probes/input-method-undo.js
npm run probe -- test/probes/input-method-arrow.js
npm run probe -- --fixture default-document.md test/probes/page-layout-toggle.js
npm run probe -- test/probes/scroll-caret-anchor.js
```

Expected: `"failed": []`.

- [ ] **Step 6: Commit**

```bash
git add -A src/ui/markdown test
git commit -m "refactor(markdown): group editor and renderer domains"
```

---

### Task 8: Divide Export by Workflow and Pipeline Capability

**Files:**
- Move workflow files into `src/ui/export/workflow/`:
  - `export_flow.ts` -> `workflow/flow.ts`
  - `export_question.ts` -> `workflow/question.ts`
  - `export_request.ts` -> `workflow/request.ts`
  - `export_paths.ts` -> `workflow/paths.ts`
  - `export_bibliography.ts` -> `workflow/bibliography.ts`
  - `export_notice.ts` -> `workflow/notice.ts`
  - `export_progress.ts` -> `workflow/progress.ts`
- Move `export_dialog.ts` -> `dialog/index.ts`
- Move `export_form.ts` -> `dialog/form.ts`
- Move to `pipeline/`:
  - `preprocess.ts`, `book_body.ts`, `node_spans.ts`
  - `callout_rewrites.ts`, `equation_rewrites.ts`, `image_rewrites.ts`, `list_rewrites.ts`, `table_rewrites.ts`
  - `html.ts`, `inline_html.ts`, `list_html.ts`, `table_html.ts`, `equation_html.ts`
  - `listing_markdown.ts`, `markdown_escaping.ts`
- Move to `assets/`: `latex_images.ts`, `raster_picture.ts`, `picture_hint.ts`
- Move to `reference/`: `native_bibliography.ts`, `reference_header.ts`
- Move `font_hint.ts` -> `workflow/font_hint.ts`
- Create: `workflow/index.ts`, `pipeline/index.ts`, `assets/index.ts`, `reference/index.ts`, `dialog/index.ts`

**Interfaces:**
- `workflow/index.ts` exports `registerExportCommand`, `exportNote`, `ExportHost`, `ExportProgress`, `ExportProgressStatus`, dialog-question types and the font-hint entrypoint.
- `pipeline/index.ts` exports `exportSource` and the shared pipeline types used outside the pipeline.
- `assets/index.ts` exports `portableLatexImage`, raster helpers, `PictureLookup`, picture-diagnostic helpers and their public types.
- `reference/index.ts` exports `referenceHeader`, `nativeBibliographyTarget`, `citedKeys` and `packageCitedBibliography`.
- `dialog/index.ts` exports `ExportDialog`, `exportDialog`, `ExportQuestion`, `ExportAnswer` and `ExportForm`.

- [ ] **Step 1: Move workflow and dialog modules**

Create `export/workflow/` and `export/dialog/`, move the listed files, and update relative imports to `../../api`, `../../services`, `../pipeline`, `../assets`, `../reference`, `../manager` and `../templates`.

- [ ] **Step 2: Move pipeline stages**

Create `export/pipeline/`, move every pipeline module, and update internal rewrite imports to sibling paths. Move `preprocess.ts` to `pipeline/preprocess.ts`.

- [ ] **Step 3: Move asset and reference capabilities**

Create `export/assets/` and `export/reference/`, move the listed modules, and update imports to their new siblings/domain indexes.

- [ ] **Step 4: Add explicit domain facades and update callers**

Add the five explicit indexes. Update `main.ts`, `content_shell.ts`, manager/template modules, probes and checks. Run:

```bash
rg -n "ui/export/(export_|preprocess|book_body|node_spans|.*_rewrites|.*_html|listing_markdown|markdown_escaping|latex_images|raster_picture|picture_hint|native_bibliography|reference_header|font_hint)"
```

Every occurrence must point to a new domain path or index.

- [ ] **Step 5: Run static checks**

```bash
npx tsc --noEmit
npm run check
```

Expected: both pass.

- [ ] **Step 6: Run export probes**

Restart the app, then:

```bash
npm run probe -- test/probes/export-progress.js
npm run probe -- test/probes/export-html.js
npm run probe -- test/probes/export-html-local-assets.js
npm run probe -- test/probes/export-pdf.js
npm run probe -- test/probes/export-revealjs.js
npm run probe -- test/probes/export-markdown.js
npm run probe -- test/probes/export-template-native-bibliography.js
```

Expected: `"failed": []`. For native bibliography in a worktree outside `$HOME`, grant the checkout through `api/files.ts: grantFolder` with a temporary probe before running it; do not change product code to accommodate the test location.

- [ ] **Step 7: Commit**

```bash
git add src/ui/export src/main.ts src/ui/content_shell.ts test
git commit -m "refactor(export): group workflow and pipeline capabilities"
```

---

### Task 9: Group Backend Font and HTML Domains

**Files:**
- Move: `src-tauri/src/fonts/bundled.rs` -> `fonts/bundled/mod.rs`
- Move: `src-tauri/src/fonts/bundled_coverage.rs` -> `fonts/bundled/coverage.rs`
- Move: `src-tauri/src/fonts/bundled_faces.rs` -> `fonts/bundled/faces.rs`
- Move: `src-tauri/src/fonts/bundled_header.rs` -> `fonts/bundled/header.rs`
- Modify: `src-tauri/src/fonts/mod.rs`
- Move: `src-tauri/src/export/html_attributes.rs` -> `export/html/attributes.rs`
- Move: `src-tauri/src/export/html_media/mod.rs` -> `export/html/media/mod.rs`
- Move: `src-tauri/src/export/html_media/media_paths.rs` -> `export/html/media/paths.rs`
- Move: `src-tauri/src/export/html_media/package.rs` -> `export/html/media/package.rs`
- Create: `src-tauri/src/export/html/mod.rs`
- Modify: `src-tauri/src/export/mod.rs`
- Modify all Rust callers and tests

**Interfaces:**
- `fonts/bundled/mod.rs` keeps the current `crate::fonts::bundled::{...}` public facade.
- `export/html/mod.rs` explicitly re-exports `attribute_values`, `html_output`, `package_html_media` and `package_local_media`; callers use `super::html::{...}`, and `export/mod.rs` keeps `mod html`.
- No command path through `src-tauri/src/lib.rs` changes.

- [ ] **Step 1: Move bundled font modules**

Create `fonts/bundled/` and move the four files to `mod.rs`, `coverage.rs`, `faces.rs`, `header.rs`. Update relative paths and `include_bytes!` locations if any; preserve the `crate::fonts::bundled` API.

- [ ] **Step 2: Move HTML helpers and media**

Create `export/html/` and `export/html/media/`. Move attributes and package/media files. Add:

```rust
// export/html/mod.rs
mod attributes;
mod media;

pub(super) use attributes::attribute_values;
pub(super) use media::{html_output, package_html_media, package_local_media};
```

Make `export/html/media/mod.rs` expose the three media functions.

- [ ] **Step 3: Update Rust callers**

Replace `super::html_attributes`, `super::html_media` and `fonts/bundled_*` imports with the new facades. Update test module paths and all `include_str!`/`include_bytes!` paths under moved Rust files.

- [ ] **Step 4: Run Rust verification**

```bash
cargo fmt --all -- --check
cargo test
```

Expected: tests pass. If repository-wide `cargo fmt --check` reports pre-existing formatting drift, run `rustfmt --check` on changed Rust files and record that the unchanged tree already had the broader drift.

- [ ] **Step 5: Run export probes affected by Rust moves**

Restart the app, then:

```bash
npm run probe -- test/probes/export-html-local-assets.js
npm run probe -- test/probes/export-revealjs.js
npm run probe -- test/probes/export-pdf-font.js
```

Expected: `"failed": []`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/fonts src-tauri/src/export src-tauri/src/lib.rs test
git commit -m "refactor(backend): group bundled fonts and html helpers"
```

---

### Task 10: Enforce the Layout, Update Maps and Run the Full Suite

**Files:**
- Create: `test/checks/module-layout.mjs`
- Modify: `docs/structure.md`
- Modify: `docs/ai-context.md`
- Modify: `docs/superpowers/specs/2026-11-01-domain-oriented-module-structure-design.md` status to implemented
- Modify: any stale path references found by the scans below

**Interfaces:**
- `module-layout.mjs` exits non-zero when a legacy path returns, a required domain facade is missing, or a domain index wildcard re-export appears.

- [ ] **Step 1: Add the module-layout guard**

Create `test/checks/module-layout.mjs` with this behavior:

```js
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const exists = (path) => existsSync(join(root, path));
const expectFile = (path) => {
  if (!exists(path)) failures.push(`missing required module: ${path}`);
};
const forbidFile = (path) => {
  if (exists(path)) failures.push(`legacy module still exists: ${path}`);
};
const expectNoRepeat = (folder, prefixes = [], suffixes = []) => {
  for (const name of readdirSync(join(root, folder))) {
    if (
      prefixes.some((prefix) => name.startsWith(prefix)) ||
      suffixes.some((suffix) => name.endsWith(suffix))
    ) {
      failures.push(`${folder}/${name} repeats its parent-domain prefix`);
    }
  }
};
const expectExplicitFacade = (path) => {
  expectFile(path);
  if (!existsSync(join(root, path))) return;
  const source = readFileSync(join(root, path), 'utf8');
  if (/export\s+\*\s+from/.test(source)) {
    failures.push(`${path} uses a wildcard public export`);
  }
};

[
  'src/services/session/index.ts',
  'src/services/session/rules.ts',
  'src/services/workspace/index.ts',
  'src/services/new_document/index.ts',
  'src/services/events/index.ts',
  'src/services/bibliography/index.ts',
  'src/services/documents/index.ts',
  'src/services/versioning/index.ts',
  'src/ui/markdown/editor/index.ts',
  'src/ui/markdown/renderer/index.ts',
  'src/ui/workspace/index.ts',
  'src/ui/versioning/index.ts',
  'src/ui/workspace_setup/index.ts',
  'src/ui/export/manager/index.ts',
  'src/ui/export/templates/index.ts',
  'src/ui/export/workflow/index.ts',
  'src/ui/export/pipeline/index.ts',
  'src/ui/export/assets/index.ts',
  'src/ui/export/reference/index.ts',
  'src/ui/export/dialog/index.ts',
  'src-tauri/src/fonts/bundled/mod.rs',
  'src-tauri/src/export/html/mod.rs',
].forEach(expectFile);

[
  'src/services/session.ts',
  'src/services/session_rules.ts',
  'src/services/workspace_folders.ts',
  'src/services/new_document_builtins.ts',
  'src/services/event_manager.ts',
  'src/ui/markdown/editor_history.ts',
  'src/ui/export/export_flow.ts',
  'src-tauri/src/fonts/bundled.rs',
].forEach(forbidFile);

expectNoRepeat('src/ui/versioning', ['version_']);
expectNoRepeat('src/ui/toolbar', [], ['_toolbar.ts']);
expectNoRepeat('src/ui/settings', [], ['_settings.ts']);
expectNoRepeat('src/ui/image', ['image_']);
expectNoRepeat('src/ui/table', ['table_']);
expectNoRepeat('src/ui/tutorial', ['tutorial_']);
expectNoRepeat('src/ui/workspace/tree', ['tree_']);
expectNoRepeat('src/ui/workspace_setup', ['workspace_setup_']);
expectNoRepeat('src/ui/export/workflow', ['export_']);
expectNoRepeat('src/ui/export/manager', ['export_manager']);
expectNoRepeat('src/ui/export/templates', ['package_', 'template_']);

for (const facade of [
  'src/services/session/rules.ts',
  'src/services/workspace/index.ts',
  'src/services/new_document/index.ts',
  'src/services/events/index.ts',
  'src/services/bibliography/index.ts',
  'src/services/documents/index.ts',
  'src/services/versioning/index.ts',
  'src/ui/markdown/editor/index.ts',
  'src/ui/markdown/renderer/index.ts',
  'src/ui/workspace/index.ts',
  'src/ui/versioning/index.ts',
  'src/ui/workspace_setup/index.ts',
  'src/ui/export/manager/index.ts',
  'src/ui/export/templates/index.ts',
  'src/ui/export/workflow/index.ts',
  'src/ui/export/pipeline/index.ts',
  'src/ui/export/assets/index.ts',
  'src/ui/export/reference/index.ts',
  'src/ui/export/dialog/index.ts',
]) {
  expectExplicitFacade(facade);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('module layout: all checks passed');
```

- [ ] **Step 2: Run the layout guard and path scan**

```bash
node test/checks/module-layout.mjs
rg -n "session_(rules|model|open|edit|editor|files|persistence|serialization)|workspace_(folders|setup)|new_document_(builtins|templates)|document_(identity|manager)|citation_reference|editor_(history|keyboard|page_layout|render_context|view_state)|export_(flow|question|request|paths|bibliography|notice|progress)" src test docs
```

Expected: `module layout: all checks passed`; remaining scan hits are historical specs/plans or explicit migration text only.

- [ ] **Step 3: Update the current-tree documentation**

In `docs/structure.md`, replace stale module counts and paths with the final measured tree. Add the new domain rows for `services/session/`, `services/workspace/`, `services/new_document/`, `services/events/`, `services/bibliography/`, `services/documents/`, `services/versioning/`, `ui/markdown/editor/`, `ui/markdown/renderer/`, `ui/export/workflow/`, `ui/export/pipeline/`, `ui/export/assets/`, `ui/export/reference/`, `ui/export/dialog/`, `ui/export/manager/`, `ui/export/templates/`, `fonts/bundled/` and `export/html/`.

In `docs/ai-context.md`, update the layer table and every session/export/editor path to the new domain facades. Keep historical specs and plans unchanged.

Change the spec status line to:

```markdown
**Status:** Implemented
```

- [ ] **Step 4: Run final static verification**

```bash
npx tsc --noEmit
cargo test
npm run check
```

Expected: all pass, and `npm run check` includes `module layout: all checks passed`.

- [ ] **Step 5: Restart the app and run the complete probe suite**

Run `npm run tauri dev`, then:

```bash
npm run probe:all
```

Expected: every probe passes. Long probes may report bridge recovery, but no probe may report failed checks.

- [ ] **Step 6: Commit**

```bash
git add test/checks/module-layout.mjs docs/structure.md docs/ai-context.md \
  docs/superpowers/specs/2026-11-01-domain-oriented-module-structure-design.md src test
git commit -m "test(structure): enforce the domain module layout"
```

