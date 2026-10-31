# Human-Maintainable Command and Event Architecture

**Date:** 2026-10-31

**Status:** Approved design direction; implementation plan not yet written

## Purpose

This refactor makes Yi easier for people and future agents to understand and extend without
changing the editor's observable behaviour.

It has five goals:

1. Give commands one typed contract and one dispatch path.
2. Give domain events one typed vocabulary and one delivery path.
3. Keep the raw markdown document and the living session as the authoritative state.
4. Split files that hold several independent jobs.
5. Remove duplicated path, error, form, and filesystem logic where one rule is meant.

The future built-in agent and MCP server must be additional command clients. They must not need a
second editing API or a parallel source of event truth.

## The Problem in Human Terms

Today, a human pressing **Bold** and a future agent asking to bold a range can reach similar work
through different code:

```text
human key or toolbar -> command id -> command implementation
future MCP / agent   -> unknown adapter -> ??? command implementation
```

The existing command registry already gives human triggers a good common destination, but it does
not yet expose enough information for another client to discover and safely invoke a command:

- payloads are `unknown`;
- command effects and permissions are inferred from id prefixes;
- availability and mutation rules are separate string lists;
- trigger mappings are spread across the registry, menu bridge, keymap, toolbar, and shell;
- the registry lives under the editor even though session, file, export, and help commands are
  app-wide;
- event names live in the modules that emit them, while the payload map lives elsewhere;
- local notifications are sent through Tauri events even when both ends are in the same window;
- many listeners repeat unsafe payload casts such as `event: any`;
- high-level commands and low-level text changes do not share a named contract.

The result is understandable, but a new client has to learn several conventions before it can ask
the app to do one thing.

## Design Principles

### A command is a request

A command says **what the caller wants to happen**:

```text
format:bold
file:newMarkdown
session:open
document:replaceRange
```

A command has one typed input, one typed result, one declared effect, and one authority check.
Keyboard shortcuts, toolbar buttons, native menus, the built-in agent, MCP clients, and tests are
all command sources.

### An event is a fact

An event says **what has already happened**:

```text
document_changed
document_session_changed
workspace_changed
citation_updated
```

Events are emitted after authoritative state has changed. They are not requests and cannot mutate
the document. A listener may update a view, invalidate a cache, or notify another window.

### State is authoritative

The raw document remains the source of truth for note content. The session remains the source of
truth for open documents, stack membership, paths, and savedness. Events announce changes to those
owners; they do not become a second copy of state.

This design deliberately does not turn every keystroke into event-sourced state. Replaying an event
log to reconstruct the editor would add complexity and latency without making the code easier to
maintain.

### Hot input stays synchronous

Ordinary typing, IME composition, arrow movement, and block-local DOM updates remain synchronous.
They do not cross Tauri's asynchronous event boundary. The command contract is shared, but a local
command dispatch is a direct function call with a result.

### Capability is declared, not remembered

The command catalogue is the one machine-readable list of what the app can do. A client can answer
these questions from it:

- What commands exist?
- What input does each command take?
- What does each command return?
- Is it synchronous or asynchronous?
- Does it change a document, workspace, setting, export, or version?
- Which origins may invoke it?
- Does it require an expected document revision or user confirmation?

## Architecture

### Command contracts

Command ids retain the current `namespace:name` convention. The current `CommandId` union is
replaced with a contract map that connects each id to its input and result:

```ts
export interface CommandContracts {
  'format:bold': {
    input: null;
    output: DocumentCommandOutput;
    effect: 'document.write';
    timing: 'sync';
  };
  'document:replaceRange': {
    input: {
      from: number;
      to: number;
      replacement: string;
      expectedRevision: number;
    };
    output: DocumentCommandOutput;
    effect: 'document.write';
    timing: 'sync';
  };
  'file:newMarkdown': {
    input: { folder?: string } | null;
    output: { path: string } | null;
    effect: 'workspace.write';
    timing: 'async';
  };
}
```

The production declaration does not need to repeat effect and timing if those values are attached
unchanged to every member of a family. The important invariant is that every command id has exactly
one complete contract.

Each registered command definition contains:

```ts
export interface CommandDefinition<Id extends CommandId> {
  readonly id: Id;
  readonly description: string;
  readonly input: CommandInput<Id>;
  readonly parse: (value: unknown) => CommandInput<Id>;
  readonly run: (
    input: CommandInput<Id>,
    context: CommandContext
  ) => CommandOutput<Id> | Promise<CommandOutput<Id>>;
  readonly available?: (access: CommandAccess) => boolean;
  readonly exposure: 'public' | 'internal';
}
```

`parse` is the runtime boundary for menu payloads, MCP input, and agent input. Internal TypeScript
callers still receive compile-time payload checking, but no external payload is trusted merely
because it has the right TypeScript type.

A command definition's header states the practical problem it solves. For example:

```ts
/**
 * Replaces one document range for a caller that is not the local caret.
 *
 * Example: an agent asks to change `"Alice"` at revision 42. The command refuses if a person has
 * already moved the document to revision 43, rather than replacing whatever now occupies that
 * range.
 */
export const replaceRange = defineCommand({
  id: 'document:replaceRange'
  // The rest of the contract comes from the command table.
});
```

This is a short explanation of intent and a concrete failure the command prevents. Comments must
not merely restate the implementation.

The input descriptor is serializable so a future command-catalogue or MCP adapter can expose a JSON
schema. Commands with compound input, such as a table target, describe each field and validate it
once. A trigger does not parse the same payload again.

### Command source and authority

Every dispatch carries a context:

```ts
export type CommandOrigin =
  | { kind: 'keyboard'; windowId: string }
  | { kind: 'toolbar'; windowId: string }
  | { kind: 'native-menu'; windowId: string }
  | { kind: 'builtin-agent'; conversationId: string }
  | { kind: 'mcp'; clientId: string; connectionId: string }
  | { kind: 'test'; name: string };

export interface CommandContext {
  readonly origin: CommandOrigin;
  readonly correlationId: string;
  readonly signal?: AbortSignal;
}
```

The dispatcher resolves the origin to a `CommandAccess` capability set before checking
availability. The policy has three layers:

1. **Origin policy** says whether a source may use an effect at all. A read-only MCP connection, for
   example, cannot use `workspace.write`.
2. **Current-state policy** says whether this document or workspace permits the effect. A
   tutorial's read-only document rejects `document.write`.
3. **Command policy** can add a command-specific condition. A command that permanently deletes a
   file may require explicit confirmation even when its origin has `workspace.write`.

The existing global `editingAllowed` boolean is replaced by the current-state policy. The dispatcher
is the only place that combines all three.

The initial effects are:

```text
document.read
document.write
session.read
session.write
workspace.read
workspace.write
settings.read
settings.write
export.run
version.write
```

Effects are a closed union so adding one is a compile error until every policy handles it.

### Command result

Every command returns a discriminated result:

```ts
export type CommandResult<Output> =
  | {
      ok: true;
      commandId: CommandId;
      correlationId: string;
      value: Output;
      changed: boolean;
      documentRevision?: number;
      eventIds: string[];
    }
  | {
      ok: false;
      commandId: CommandId;
      correlationId: string;
      code:
        | 'not-found'
        | 'unavailable'
        | 'forbidden'
        | 'invalid-input'
        | 'stale'
        | 'cancelled'
        | 'failed';
      message: string;
      details?: JsonValue;
    };
```

Human UI triggers can still use a small synchronous helper that reports failures through the
existing message surface. Agent and MCP adapters receive the full result and can explain what
happened without scraping console logs.

An available command that returns `changed: false` is a successful no-op. For example, pressing
**Save** on an already saved document succeeds without producing a document-change fact.

### Revision and stale edits

`MarkdownEditorState` gains a monotonically increasing `revision`. It advances once for every
committed text change, undo, and redo. Loading a new document starts a new revision series together
with a new document key.

An agent or MCP mutation supplies `expectedRevision`. The dispatcher rejects the command with
`code: 'stale'` before any text changes when the expected and current revisions differ. Human
commands may omit the expectation and act on the current caret.

This solves a concrete failure:

```text
agent reads revision 42 and plans to replace "Alice"
human types at revision 43
agent's old replacement arrives
the app rejects it instead of overwriting the human's new text
```

The result includes the new revision after every successful document write.

### Command transactions

The future built-in agent may need several commands to form one undo step:

```text
replace heading
insert paragraph
apply citation
```

The initial refactor exposes a transaction contract but does not use it from production code:

```ts
interface CommandBatch {
  expectedRevision: number;
  commands: CommandInvocation[];
}
```

A batch validates every command and permission before execution, applies document edits in order,
and records one history transaction. If any step fails after execution begins, the history restores
the starting state and the result reports the failing command. Non-document commands, such as
opening a dialog, are not allowed inside a document transaction.

### Internal text path

The public agent-facing edit command is `document:replaceRange`. It includes a revision and uses
the existing edit funnel rather than writing to the text store directly.

Normal typing remains private to the editor:

```text
keyboard / IME input
  -> synchronous internal editor operation
  -> MarkdownEditorState applies the change
  -> one document_changed fact
```

The internal operation is still declared in the same command catalogue with
`exposure: 'internal'`, so it cannot silently become a second routing system. Its input is the
structured text input already understood by the editor, not a simulated keyboard event.

This distinction is intentional. Exposing a command such as `edit:pressKey` to an agent would make
the agent responsible for caret location, IME state, and platform key behavior. Semantic range
edits and formatting commands are stable; simulated keystrokes are not.

### Command catalogue and registration

The catalogue is split by feature, with one aggregation point:

```text
src/commands/
  contracts.ts             command ids, inputs, outputs, effects
  registry.ts              registration and duplicate detection
  dispatcher.ts            parse, authorize, run, translate results
  authority.ts             origin and current-state policy
  result.ts                success and failure types
  triggers/
    keymap.ts
    native_menu.ts
  features/
    editor.ts
    session.ts
    files.ts
    export.ts
    help.ts
```

Feature modules export definitions; only the catalogue aggregator includes them. A command's
behaviour still lives where it belongs:

- syntax and editing rules stay under `ui/markdown`;
- session commands stay with the session;
- export commands stay with the export flow;
- file commands stay with the new-note or workspace flow.

Moving the registry to `src/commands/` does not move feature behavior into a central god module.
It only moves the shared vocabulary and dispatcher out of the editor.

Registration no longer depends on editor construction for unrelated commands. The composition root
registers feature catalogs once:

```ts
registerCommandCatalog(editorCommands(editorHost));
registerCommandCatalog(sessionCommands(documentSession));
registerCommandCatalog(fileCommands(fileHost));
registerCommandCatalog(exportCommands(exportHost));
registerCommandCatalog(helpCommands(helpHost));
```

The registry may be reset between tests, but never reset in production. Registering the same id
twice remains a fatal programming error.

### Event contracts

Events use a discriminated object per event instead of a name constant in one module and a payload
type in another:

```ts
export const documentChanged = defineEvent<{
  documentKey: string;
  previousRevision: number;
  revision: number;
  origin: CommandOrigin;
  correlationId: string;
  changes: readonly {
    from: number;
    to: number;
    insertedLength: number;
    removedLength: number;
  }[];
}>('document_changed');

export const documentSessionChanged =
  defineEvent<SessionState>('document_session_changed');
```

Application events are JSON-serializable. Local JavaScript objects such as DOM elements, editor
instances, functions, and `Error` objects are forbidden.

The first event migration replaces:

- `editor_edited` and `markdown_content_changed` with `document_changed`;
- the unsafe `event: any` payload reads with typed handlers;
- the mix of command-trigger names and domain facts in `AppEvents` with separate trigger and event
  vocabularies.

`document_changed` initially continues to carry the current text for the word-count component so
the refactor remains behavior-preserving. Once every consumer can query the document owner, the
full text can be removed from the event in a separately measured change.

### Event delivery

The event layer has two transports behind one API:

```text
owner commits state
  -> typed local event dispatch (synchronous listeners)
  -> optional Tauri transport for events marked crossWindow
```

The local event bus is the default. Tauri is retained for events that genuinely cross the Rust
boundary or another app window, such as native configuration changes and workspace changes.

Each event envelope contains:

```ts
interface EventEnvelope<Name extends AppEventName> {
  id: string;
  name: Name;
  payload: AppEvents[Name];
  emittedAt: number;
  correlationId: string | null;
}
```

The event id is available to command results. A future agent can observe that a command caused a
particular set of facts without subscribing by guesswork.

Local listeners are synchronous. Remote listeners remain asynchronous. A producer that requires a
listener to finish before continuing must call that service directly or await an explicit request,
not emit a non-blocking event. This preserves the existing distinction between a call and news.

### Native menu and external command adapters

Native menu events are triggers, not domain facts. Until Rust can emit a generic command envelope,
`commands/triggers/native_menu.ts` is the only module that maps menu wire names to command ids.
The mapping becomes part of the command contract rather than a second command registry.

The future external adapters follow the same shape:

```text
native menu event -> native-menu adapter -> dispatcher
MCP request       -> MCP adapter         -> dispatcher
built-in agent    -> agent adapter       -> dispatcher
keyboard          -> keymap              -> dispatcher
toolbar           -> direct invocation   -> dispatcher
```

An adapter may translate transport data and enforce connection limits. It may not contain editing
rules, duplicate command ids, or mutate state directly.

Raw Tauri IPC commands remain transport primitives for files, settings, export, and other backend
services. An MCP server exposes app commands; it does not expose every IPC primitive by default.
Workspace deletion, arbitrary shell execution, and similarly sensitive primitives require a
separate capability grant.

### Editing flow after the refactor

A formatting command becomes:

```text
toolbar click
  -> command: format:bold, origin toolbar
  -> dispatcher validates input and document.write authority
  -> editing/formatting applies one edit through the shared edit funnel
  -> state revision advances
  -> document_changed event
  -> word count, session noteMoved, save status, and agent observer update
```

An agent edit becomes:

```text
MCP request
  -> command: document:replaceRange, origin mcp, expectedRevision 42
  -> dispatcher validates schema, authority, and revision
  -> the same edit funnel applies the range
  -> revision 43
  -> document_changed event
  -> command result says afterRevision 43 and lists the event id
```

Normal typing becomes:

```text
IME commit
  -> internal editor text operation
  -> the same state change and document_changed event
```

The command source changes. The document authority and change facts do not.

## Module Refactoring

The command/event foundation is the first phase. File splitting follows where a module currently
holds jobs that change for different reasons.

### Frontend editor

`src/ui/markdown/markdown_editor.ts` (891 lines) becomes a small facade plus:

- editor lifecycle and document loading;
- render-context construction;
- interaction wiring for keys, clicks, selection, composition, and previews;
- view capture and restoration;
- editor command host.

The refactor keeps one public `WysiwygMarkdownEditor` class so consumers do not need to know the
internal split.

`src/ui/markdown/virtual_block_renderer.ts` (716 lines) becomes a facade over:

- block element creation and spare-element cache;
- measurement and intrinsic-size rules;
- viewport synchronisation and DOM reconciliation;
- scroll anchors and block tagging.

`src/ui/markdown/document/blocks.ts` (811 lines) becomes a facade over:

- the block model and content key;
- the line scanner and block-kind decisions;
- incremental re-splitting and resume rules.

`src/ui/markdown/syntax/parser.ts` (797 lines) separates:

- the remark/unified pipeline;
- table and list caption repair;
- description-list compatibility and position repair;
- the serializer.

Each split keeps the existing tests and public imports working through a narrow facade.

### Frontend export

`src/ui/export/export_dialog.ts` (730 lines) separates presentation from operations:

- form construction and reading answers;
- target picker dialogs;
- template-package actions;
- configuration actions;
- export diagnostics;
- the `QuestionCard` lifecycle.

`src/ui/export/preprocess.ts` (593 lines) separates rewrite families:

- wikilinks and cross references;
- figures, listings, and captions;
- local and remote images;
- escaping and final rewrite application.

`src/styles.css` is split by surface only after component extraction stabilizes:

- base and typography;
- shell and workspace;
- editor and nodes;
- floating surfaces;
- export and settings.

Tailwind import order and daisyUI theme tokens remain centralized in the entry stylesheet.

### Frontend duplication

Confirmed repeated path operations become one pure `src/services/path_rules.ts`:

- basename;
- parent;
- extension stripping;
- path pieces that are not a filesystem operation.

No module uses this helper to bypass Tauri path APIs where platform-aware joining or resolution is
required.

Export rows, labels, and status text use small presentational helpers only when the same behavior
is genuinely shared. A helper is not introduced merely because two elements both contain a
`<div>`.

### Rust

`src-tauri/src/files.rs` (427 lines) becomes:

```text
src-tauri/src/files/
  mod.rs          the public Tauri command facade
  listing.rs      directory reads and visible-entry rules
  names.rs        name validation and separator rules
  mutations.rs    create, rename, move, delete
  atomic.rs       sibling-temporary writes and replacement
```

The command names and call shapes used by `src/api/files.ts` stay stable.

Localized filesystem and export errors gain a small helper module:

```rust
pub(crate) fn localized_io_error(
    key: &str,
    path: &Path,
    error: &std::io::Error,
) -> String
```

The helper removes repeated path display and reason formatting. It does not choose an error key
for the caller, because failure meaning remains feature-specific.

Sibling-temporary atomic replacement is exposed as a reusable primitive. `odt_toc.rs` and
`epub_pack.rs` keep their ZIP-specific transformations but use one tested replacement helper
instead of maintaining private duplicate temp-file lifecycles.

`src-tauri/src/export/templates/package/import.rs` (511 lines) becomes:

- package inspection;
- wrapper preview and conversion;
- package construction;
- default-package creation;
- package detail updates.

`src-tauri/src/menu.rs` and `settings.rs` are split only along responsibilities already present:

- menu composition by top-level menu;
- translated labels and item metadata;
- configuration model and defaults;
- settings storage and command facade.

Rust test temp-directory construction is centralized in a test-support module. Test cleanup must
remain explicit and no helper may reuse one directory across parallel tests.

## Migration Sequence

Each phase is its own reviewable commit or small commit series. No phase changes two architectural
axes at once.

### Phase 1: Command contract and dispatcher

- Add the typed command contract map and runtime input parsing.
- Move the registry to `src/commands/`.
- Add origin, authority, result, correlation, effect, and exposure metadata.
- Migrate every existing command registration and trigger adapter.
- Keep all behaviour and trigger names unchanged.
- Prove that one command can be dispatched from keyboard, menu, toolbar, and a test agent source.

### Phase 2: Event contract and local delivery

- Replace name constants and payload casts with typed event objects.
- Keep Tauri transport for cross-window events.
- Add a local synchronous event path for same-window facts.
- Replace unsafe listener payload reads.
- Add the event envelope and correlation id.

### Phase 3: Document revision and editing commands

- Add monotonic document revisions.
- Add agent-safe range edit commands and stale-revision rejection.
- Route human and agent document mutations through the same edit funnel.
- Emit one `document_changed` fact for every committed document change.
- Add the transaction contract; production agent use remains deferred.

### Phase 4: Editor module split

- Reduce `markdown_editor.ts` to its facade.
- Split the virtual renderer and block splitter.
- Split parser repairs from the pipeline.
- Preserve all existing probes and add focused module checks.

### Phase 5: Export frontend

- Split the export dialog by form, picker, template actions, configuration actions, and diagnostics.
- Split preprocessing by rewrite family.
- Remove confirmed shared path and form duplication.
- Re-run export and UI probes.

### Phase 6: Rust boundaries and duplication

- Split `files.rs` and package import.
- Add localized I/O error and atomic replacement helpers.
- Split menu/settings where responsibilities remain mixed.
- Centralize Rust test temporary-directory support.
- Keep Tauri command names stable unless an API migration is separately approved.

### Phase 7: Documentation and structural checks

- Update `docs/architecture.md`, `docs/structure.md`, `docs/ai-context.md`,
  `docs/adding-a-command.md`, and `docs/writing-comments.md`.
- Add compact, human-readable examples to new command/event modules where an example explains a
  real input, state transition, or failure better than the types alone.
- Replace the command source check with contract and authority checks.
- Add event-contract and import-direction checks.
- Remove stale line and module counts from structural documentation.
- Record the command/event rule as an extension point for future MCP and agent work.

## Error Handling

- Input parsing failures never reach feature code.
- Unauthorized commands return `forbidden` without side effects.
- Stale document commands return `stale` and include `currentRevision`.
- A failed save or export returns `failed` and may also emit `message`.
- An expected cancellation returns `cancelled`; cancellation is not a failure message.
- An event listener exception is logged with the event id and does not prevent the state change that
  already committed or the remaining listeners from running.
- A command registration conflict fails during application startup.

Commands must not report success before asynchronous work completes. A save command returns only
after the file write and session update have finished.

## Testing

### Pure checks

- Every command id has one contract, one implementation, one effect, one timing, one exposure, and
  one availability rule.
- Every trigger names a declared command.
- Every public command has a runtime input parser.
- Every command effect is handled by the authority matrix.
- A duplicate command id fails registration.
- Invalid, forbidden, unavailable, stale, failed, and cancelled dispatches return the documented
  result shape.
- Every app event has one definition and a JSON-serializable payload.
- Event ids are unique and correlation ids survive through the typed bus.
- Rust-emitted events and native menu triggers map to declared contracts.
- Command and event registries cannot import feature implementations upward; feature modules
  register into the contracts.

### App probes

- An existing formatting command behaves identically from toolbar and keyboard.
- A native-menu command reaches the same dispatcher and implementation.
- A synthetic agent-like source runs an allowed command.
- A read-only or unauthorized origin cannot mutate the document.
- Two range edits with the same expected revision: the first succeeds, the second returns `stale`
  and leaves the document unchanged.
- A successful document command emits one `document_changed` fact with the new revision.
- Typing still uses the synchronous IME path and survives composition, arrow movement, undo, and
  virtualised block replacement.
- A command result names the emitted event id.
- A batch edit is one undo step after the transaction phase is enabled.

Every editor/UI phase runs the affected probes against the Tauri MCP bridge. The final tree runs
`npx tsc --noEmit`, `npm run check`, `cargo test`, and the affected probes; `npm run probe:all` is
run before any merge once the full structural migration is complete.

## Compatibility and Safety

- Public Tauri IPC command names used by `src/api/` remain unchanged in this program.
- Existing command ids remain valid.
- Existing keyboard shortcuts and native menu items remain valid.
- Existing module public exports remain valid through facade modules during and after splitting.
- The raw document and session shapes remain compatible with existing session files.
- No refactor phase changes markdown rendering or export output deliberately.
- A phase with a failing existing check or affected probe is not committed as complete.
- Each phase is committed on the feature branch; merging to `main` remains a maintainer decision.

## Acceptance Criteria

The program is complete when:

1. Keyboard, toolbar, native menu, tests, and future agent/MCP clients can invoke the same typed
   command catalogue.
2. No command payload is an unchecked `unknown` after parsing.
3. A read-only or unauthorized command cannot mutate state through any trigger.
4. Every document mutation advances one revision and emits one typed change fact.
5. Stale agent edits are rejected without changing the document.
6. Same-window events use the typed local path; Tauri transport is limited to cross-window or
   cross-boundary facts and triggers.
7. The five largest frontend modules named in this spec have one public facade and focused internal
   modules.
8. The Rust file, package-import, localized-error, and atomic-write responsibilities are separated.
9. The confirmed path and error duplication has one home.
10. New command, event, and split modules explain their purpose and include a concrete example
    wherever the example removes ambiguity.
11. Existing TypeScript checks, Rust tests, and affected app probes remain green.
12. Architecture and contribution documents describe the new contracts and how to extend them.

## Deferred Work

The following are enabled by this design but not implemented by the refactor:

- a production MCP server that exposes the catalogue;
- built-in AI model integration and prompting;
- multiple simultaneous document transactions;
- collaborative editing;
- event sourcing or replay of editor history;
- replacing every generated UI element with shared form primitives;
- changing user-visible copy, layouts, or workflow.
