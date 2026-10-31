# Unified Document Change Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace separate `editor_edited` and `markdown_content_changed` notifications with one typed `document_changed` fact for edits, undo, redo and document loads.

**Architecture:** The markdown editor is the only producer because it owns the live document revision and text. Local event listeners derive word count and session movement from the same committed fact; command/edit code never emits a second change event.

**Tech Stack:** TypeScript 7, typed LocalEventBus/EventManager, Node checks, Tauri MCP probes.

**Spec:** `docs/superpowers/specs/2026-10-31-human-maintainable-command-event-architecture-design.md`

## Global Constraints

- No new dependency.
- One committed text change produces one `document_changed` event.
- Payload includes document key, previous revision, new revision, reason and current text.
- Reasons are `load`, `edit`, `undo`, `redo`.
- Local event delivery stays synchronous.
- Word count keeps its previous load-time update behavior during this phase.
- Session persistence reacts to edit/undo/redo, not to an initial load.
- Existing undo, caret, typing and rendering behavior remains unchanged.
- Run `npx tsc --noEmit`, `npm run check`, and affected Tauri MCP probes.
- Commit each independently testable task.

---

### Task 1: Declare the Change Fact

**Files:**
- Modify: `src/services/app_events.ts`
- Modify: `test/checks/check-events.mjs`

**Interfaces:**
- Produces:
  - `DocumentChangeReason`
  - `DocumentChanged`
  - `document_changed: DocumentChanged`
  - `DOCUMENT_CHANGED`
  - removes `editor_edited` and `markdown_content_changed`

**Payload:**

```ts
export interface DocumentChanged {
  documentKey: string;
  previousRevision: number | null;
  revision: number;
  reason: 'load' | 'edit' | 'undo' | 'redo';
  text: string;
}
```

- [ ] **Step 1: Extend the event source check**

Update `check-events.mjs` to require:

```js
check('the unified document event exists', declared.has('document_changed'));
check('the old split events are gone', !declared.has('editor_edited') && !declared.has('markdown_content_changed'));
check('document_changed is local', boundaries.get('document_changed') === 'local');
```

Run:

```bash
node test/checks/check-events.mjs
```

Expected: FAIL because the new event is absent.

- [ ] **Step 2: Replace the event entries**

Remove the two old payload entries and add `document_changed`. Export:

```ts
export const DOCUMENT_CHANGED = 'document_changed' as const;
```

Mark it local in `EVENT_BOUNDARIES`.

- [ ] **Step 3: Verify and commit**

```bash
node test/checks/check-events.mjs
npx tsc --noEmit
git add src/services/app_events.ts test/checks/check-events.mjs
git commit -m "refactor(events): declare one document change fact"
```

---

### Task 2: Emit One Fact from the Editor

**Files:**
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/ui/editor_panel.ts`
- Modify: `src/ui/words_count.ts`
- Modify: `src/main.ts`
- Modify: `src/services/event_manager.ts` only for typing compatibility
- Test: `test/checks/check-document-event-source.mjs`

- [ ] **Step 1: Write the source contract**

Create a source check requiring:

- `markdown_editor.ts` imports and emits `DOCUMENT_CHANGED`;
- no source emits `editor_edited` or `markdown_content_changed`;
- `editor_panel.ts` listens to `DOCUMENT_CHANGED`;
- `words_count.ts` listens to `DOCUMENT_CHANGED` and reads `event.payload.text`.

Run:

```bash
node test/checks/check-document-event-source.mjs
```

Expected: FAIL on both old event constants.

- [ ] **Step 2: Emit on edit**

Add a private helper in `WysiwygMarkdownEditor`:

```ts
private announceDocumentChange(
  reason: DocumentChangeReason,
  previousRevision: number | null
): void {
  void eventManager.emit(DOCUMENT_CHANGED, {
    documentKey: this.state.getDocumentKey(),
    previousRevision,
    revision: this.state.getRevision(),
    reason,
    text: this.state.getText()
  });
}
```

In the existing `onChanged` callback:

- capture the revision before `applyEdit`? The callback runs after the edit, so derive
  `previousRevision = this.state.getRevision() - 1`;
- emit once with reason `edit`.

In `setContent`, after loading and rendering, emit reason `load` with
`previousRevision: null`.

In `applyHistory`, after the state undo/redo and caret restoration, emit reason `undo` or `redo`
with the revision before the history action. Remove the old `EDITOR_EDITED` emit.

- [ ] **Step 3: Update consumers**

`MarkdownEditor` (editor panel) listens to `DOCUMENT_CHANGED` and calls
`documentSession.noteMoved()` only when `reason !== 'load'`.

`WordsCountStatus` listens to `DOCUMENT_CHANGED` and updates only when `reason === 'load'`, matching
the prior behavior.

Remove the redundant initial `MARKDOWN_CONTENT_CHANGED` emit from `main.ts`; keep its direct
initial `wordsCount.update(editor.getContent())`.

Remove the old exported constants.

- [ ] **Step 4: Run TypeScript and all pure checks**

```bash
npx tsc --noEmit
npm run check
```

Expected: both pass with the new source/event checks.

- [ ] **Step 5: Commit**

```bash
git add src/ui/markdown/markdown_editor.ts src/ui/editor_panel.ts \
  src/ui/words_count.ts src/main.ts src/services/event_manager.ts \
  test/checks/check-document-event-source.mjs
git commit -m "refactor(editor): emit one document change fact"
```

---

### Task 3: App Proof and Documentation

**Files:**
- Create: `test/probes/document-change-event.js`
- Modify: `docs/architecture.md`
- Modify: `docs/ai-context.md`
- Modify: `docs/structure.md`
- Modify: `test/README.md`

- [ ] **Step 1: Write the probe**

The probe loads `Alpha.\n`, subscribes to `document_changed`, then:

1. applies `document:replaceRange` and checks one `edit` event with revision `1` and text
   `Gamma.\n`;
2. runs `history:undo` and checks one `undo` event with revision `2` and text `Alpha.\n`;
3. checks both payloads carry the same current document key and the local source.

The listener records every event, so a duplicate legacy notification fails the exact-count checks.

- [ ] **Step 2: Run the probe and affected checks**

```bash
npm run probe -- test/probes/document-change-event.js
npm run probe -- test/probes/agent-range-edit.js
npm run probe -- test/probes/event-transport.js
npm run probe -- test/probes/in-place-prose-typing.js
```

Expected: every probe reports `failed: []`.

- [ ] **Step 3: Document the event**

Document that a document change is one local fact with key, previous/new revision, reason and text;
commands request work, and the committed editor change announces it.

- [ ] **Step 4: Final verify and commit**

```bash
npx tsc --noEmit
npm run check
git add test/probes/document-change-event.js docs test/README.md
git commit -m "docs(editor): document the unified change event"
```

## Self-Review

- **Spec coverage:** One typed document fact, one producer, revision and document identity, local
  delivery, consumer migration, duplicate prevention and app verification.
- **Placeholder scan:** All payload fields, files, failure conditions, commands and assertions are
  concrete.
- **Type consistency:** `DocumentChangeReason`, `DocumentChanged`, `DOCUMENT_CHANGED`, revision
  getters and the four allowed reasons are declared before consumers use them.
