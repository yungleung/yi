# Document Revision and Agent-Safe Edit Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give future agents a typed way to inspect the current document position and apply a range edit only when their plan is against the current document revision.

**Architecture:** `MarkdownEditorState` owns a document key and monotonic revision. Public `document:getRevision` and `document:replaceRange` commands go through the existing dispatcher; a stale key or revision fails before the edit funnel runs, while successful edits use the same raw-text path as human commands.

**Tech Stack:** TypeScript 7, existing command contracts/dispatcher, Node checks with rolldown, Tauri MCP probes.

**Spec:** `docs/superpowers/specs/2026-10-31-human-maintainable-command-event-architecture-design.md`

## Global Constraints

- No new dependency.
- Existing human typing and command behavior remains unchanged.
- Revision advances once per committed text change, undo and redo.
- Loading a different document creates a new key and starts at revision zero.
- An agent command must match both document key and expected revision.
- Stale commands change no text and return `code: 'stale'`.
- Successful range edits use `applyEdit`, preserving history, rendering, caret and scroll behavior.
- Run `npx tsc --noEmit`, `npm run check`, and affected Tauri MCP probes.
- Commit each independently testable task.

---

### Task 1: Document Key and Revision

**Files:**
- Modify: `src/ui/markdown/document/state.ts`
- Test: `test/checks/check-document-revision.mjs`

**Interfaces:**
- Produces:
  - `MarkdownEditorState.getDocumentKey(): string`
  - `MarkdownEditorState.getRevision(): number`

- [ ] **Step 1: Write the failing check**

Create `test/checks/check-document-revision.mjs` by bundling `state.ts` and asserting:

```js
const state = new MarkdownEditorState('Alpha beta.\n');
check('a new state starts at revision zero', state.getRevision(), 0);
const firstKey = state.getDocumentKey();
state.replaceRange(0, 5, 'Gamma');
check('one edit advances one revision', state.getRevision(), 1);
state.undo();
check('undo advances the revision', state.getRevision(), 2);
state.redo();
check('redo advances the revision', state.getRevision(), 3);
state.setText('A replacement document.\n');
check('a whole-document command advances one revision', state.getRevision(), 4);
state.loadText('Another document.\n');
check('loading a document starts a new revision series', state.getRevision(), 0);
check('and creates a different document key', state.getDocumentKey() !== firstKey, true);
```

- [ ] **Step 2: Verify RED**

```bash
node test/checks/check-document-revision.mjs
```

Expected: FAIL because the revision/key methods do not exist.

- [ ] **Step 3: Implement the counter**

In `MarkdownEditorState`:

- initialize `documentKeyValue` from a module-level monotonic counter;
- initialize `revisionValue = 0`;
- increment `revisionValue` inside `updateText`;
- in `loadText`, assign a new key and reset revision to zero after `updateText`;
- expose getters with comments showing a concrete revision sequence.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node test/checks/check-document-revision.mjs
npx tsc --noEmit
git add src/ui/markdown/document/state.ts test/checks/check-document-revision.mjs
git commit -m "refactor(document): track revision and document identity"
```

---

### Task 2: Typed Document Commands

**Files:**
- Modify: `src/commands/contracts.ts`
- Modify: `src/commands/dispatch.ts`
- Modify: `src/ui/markdown/commands/editor_commands.ts`
- Modify: `src/ui/markdown/editing/context.ts`
- Modify: `test/checks/check-command-contracts.mjs`
- Modify: `test/checks/check-command-dispatch.mjs`

**Interfaces:**
- Consumes: revision and document key from Task 1.
- Produces:
  - `DocumentPosition = { documentKey: string; revision: number }`
  - `ReplaceRangeInput = DocumentPosition & { from: number; to: number; replacement: string }`
  - commands `document:getRevision` and `document:replaceRange`
  - `CommandExecutionError` with `code: 'stale' | 'invalid-input' | 'forbidden' | 'cancelled' | 'failed'`
  - `applyEdit(...): boolean`

- [ ] **Step 1: Extend contract checks first**

Add cases proving:

```js
check(
  'the document position command takes no input',
  parseCommandInput('document:getRevision', null),
  null
);
check(
  'a range edit preserves its document key and revision',
  parseCommandInput('document:replaceRange', {
    documentKey: 'document-7',
    revision: 42,
    from: 6,
    to: 11,
    replacement: 'Bob'
  }),
  {
    documentKey: 'document-7',
    revision: 42,
    from: 6,
    to: 11,
    replacement: 'Bob'
  }
);
rejects('a range edit refuses a fractional revision', 'document:replaceRange', {
  documentKey: 'document-7',
  revision: 1.5,
  from: 0,
  to: 1,
  replacement: 'x'
});
rejects('a range edit refuses reversed offsets', 'document:replaceRange', {
  documentKey: 'document-7',
  revision: 1,
  from: 4,
  to: 2,
  replacement: 'x'
});
```

Add a dispatch case showing `CommandExecutionError('stale', ...)` maps to `code: 'stale'`.

Run:

```bash
node test/checks/check-command-contracts.mjs
node test/checks/check-command-dispatch.mjs
```

Expected: FAIL for the missing command ids/error type.

- [ ] **Step 2: Add shared inputs and parsers**

Add the two command ids to `CommandContracts`:

```ts
'document:getRevision': CommandContract<null, DocumentPosition>;
'document:replaceRange': CommandContract<ReplaceRangeInput, DocumentPosition>;
```

`document:getRevision` has effect `none`, sync timing.

`document:replaceRange` has effect `document.write`, sync timing.

Its parser requires:

- non-empty document key;
- non-negative integer revision;
- non-negative integer offsets;
- `from <= to`;
- string replacement.

- [ ] **Step 3: Add typed execution failure**

In `dispatch.ts`, add:

```ts
export class CommandExecutionError extends Error {
  constructor(
    readonly code: 'stale' | 'invalid-input' | 'forbidden' | 'cancelled' | 'failed',
    message: string
  ) {
    super(message);
    this.name = 'CommandExecutionError';
  }
}
```

Add `stale` to `CommandFailureCode`. In the dispatcher's catch, map a
`CommandExecutionError.code` into the failure result; other errors remain `failed`.

- [ ] **Step 4: Make the edit funnel report refusal**

Change `applyEdit` to return `boolean`: false when the frontmatter id pin refuses the edit, true
after either the fast or rebuilt path succeeds. Existing callers may ignore the return.

- [ ] **Step 5: Register document commands**

In `editor_commands.ts`:

```ts
registerCommand({
  id: 'document:getRevision',
  run: () => ({
    documentKey: context.state.getDocumentKey(),
    revision: context.state.getRevision()
  })
});

registerCommand({
  id: 'document:replaceRange',
  run: (input) => {
    const position = {
      documentKey: context.state.getDocumentKey(),
      revision: context.state.getRevision()
    };
    if (
      input.documentKey !== position.documentKey ||
      input.revision !== position.revision
    ) {
      throw new CommandExecutionError(
        'stale',
        `document moved to ${position.documentKey}@${position.revision}`
      );
    }
    const length = context.state.getText().length;
    if (input.to > length) {
      throw new CommandExecutionError('invalid-input', 'range is past the document end');
    }
    if (!applyEdit(context, input.from, input.to, input.replacement)) {
      throw new CommandExecutionError('forbidden', 'the document id is locked');
    }
    return {
      documentKey: context.state.getDocumentKey(),
      revision: context.state.getRevision()
    };
  }
});
```

The comment above `document:replaceRange` includes this example:

```text
An agent plans against document-7@42. A person types first, moving it to
document-7@43; the agent's command returns stale and the new text remains.
```

- [ ] **Step 6: Verify and commit**

```bash
node test/checks/check-command-contracts.mjs
node test/checks/check-command-dispatch.mjs
npx tsc --noEmit
npm run check
git add src/commands src/ui/markdown/commands/editor_commands.ts \
  src/ui/markdown/editing/context.ts test/checks
git commit -m "feat(commands): add revision-checked range edits"
```

---

### Task 3: Running-App Stale Edit Proof

**Files:**
- Create: `test/probes/agent-range-edit.js`
- Modify: `docs/architecture.md`
- Modify: `docs/ai-context.md`
- Modify: `docs/adding-a-command.md`
- Modify: `test/README.md`

**Interfaces:**
- Consumes: `/src/commands/runtime.ts`.
- Produces: a real app proof that stale edits change nothing and a matching edit changes one range.

- [ ] **Step 1: Write the probe**

The probe:

1. loads `Alpha beta.\n`;
2. reads `document:getRevision` from the real dispatcher;
3. replaces `Alpha` with `Gamma` using that position;
4. retries from the old position and expects `stale`;
5. verifies the stale retry left `Gamma beta.\n`;
6. reads the new position and replaces `Gamma` with `Delta`;
7. verifies `Delta beta.\n` and that the revision advanced exactly once per successful edit.

Use origin `{ kind: 'toolbar' }` for this probe; unconfigured agent/MCP origins remain denied by the
authority policy until an adapter grants explicit capability.

- [ ] **Step 2: Run the app proof**

```bash
npm run probe -- test/probes/agent-range-edit.js
```

Expected: `failed: []`; the stale retry reports `stale`, and the document contains exactly the
successful replacements.

- [ ] **Step 3: Document the contract**

Explain in the architecture and command recipe:

- reading position returns document key and revision;
- mutations from agent/MCP must send both;
- a mismatch is `stale` with no side effect;
- successful results include the new position;
- normal human editing still supplies no revision because it acts on the live caret.

- [ ] **Step 4: Final verification and commit**

```bash
npx tsc --noEmit
npm run check
npm run probe -- test/probes/agent-range-edit.js
npm run probe -- test/probes/command-contract.js
npm run probe -- test/probes/event-transport.js
git add test/probes/agent-range-edit.js docs test/README.md
git commit -m "docs(commands): document revision-checked edits"
```

## Self-Review

- **Spec coverage:** Covers document revision, document identity, stale-agent rejection, public
  position/range commands, the shared edit funnel, failure mapping, and app verification.
- **Placeholder scan:** Every step names exact commands, expected failure, code interfaces, and
  positive/negative cases.
- **Type consistency:** `DocumentPosition`, `ReplaceRangeInput`, `CommandExecutionError`, revision
  getters, and both command ids are introduced before tests or consumers reference them.
