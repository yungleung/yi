# Local Event Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver same-window app events through one synchronous typed bus while preserving Tauri transport for native-menu and cross-window inputs.

**Architecture:** A pure `LocalEventBus` owns subscriptions and typed event envelopes. `EventManager` composes that bus with Tauri listeners only for events declared as inbound, so local UI facts no longer serialize through Tauri while native menu and settings events still cross boundaries.

**Tech Stack:** TypeScript 7, Tauri events, Node checks with rolldown, Tauri MCP probes.

**Spec:** `docs/superpowers/specs/2026-10-31-human-maintainable-command-event-architecture-design.md`

## Global Constraints

- No new dependency.
- Same-window event listeners run synchronously in subscription order.
- A listener exception is logged with the event identity and does not prevent later listeners.
- Event payloads stay JSON-serializable.
- Native menu and Rust-emitted events continue to use Tauri transport.
- Existing event names remain stable during this phase.
- Every source module has the repository header.
- Function and method comments include a concrete example when the contract is not obvious.
- Run `npx tsc --noEmit`, `npm run check`, and affected Tauri MCP probes.
- Commit each independently testable task.

---

### Task 1: Pure Local Event Bus

**Files:**
- Create: `src/events/local_bus.ts`
- Test: `test/checks/check-local-events.mjs`

**Interfaces:**
- Consumes: a generic JSON-compatible event map.
- Produces:
  - `interface EventEnvelope<Name, Payload>`
  - `class LocalEventBus<Events>`
  - `on<Name>(name, listener): () => void`
  - `emit<Name>(name, payload, options?): EventEnvelope<Name, Events[Name]>`

- [x] **Step 1: Write the failing check**

Create `test/checks/check-local-events.mjs`:

```js
/**
 * Checks local fact delivery: subscription order, unsubscribe, unique envelopes,
 * correlation, and isolation from a failing listener.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-local-events-'));
const build = await rolldown({ input: 'src/events/local_bus.ts', logLevel: 'silent' });
const { output } = await build.generate({ format: 'esm' });
await build.close();
const file = join(directory, 'local_bus.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { LocalEventBus } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const logged = [];
const bus = new LocalEventBus({
  onListenerError: (error) => logged.push(error.message)
});
const calls = [];
const unsubscribeFirst = bus.on('workspace_changed', (event) => {
  calls.push(`first:${event.payload}`);
});
bus.on('workspace_changed', (event) => {
  calls.push(`second:${event.payload}`);
});

const first = bus.emit('workspace_changed', '/notes/history', {
  correlationId: 'command-7'
});
check('both listeners run in subscription order', calls, [
  'first:/notes/history',
  'second:/notes/history'
]);
check('the envelope carries the event name', first.name, 'workspace_changed');
check('the envelope carries the payload', first.payload, '/notes/history');
check('the envelope carries the caller correlation', first.correlationId, 'command-7');
check('the envelope has a unique id', first.id.length > 0, true);

unsubscribeFirst();
bus.emit('workspace_changed', '/notes/physics');
check('an unsubscribed listener stops hearing events', calls.slice(-1), [
  'second:/notes/physics'
]);

const second = bus.emit('workspace_changed', '/notes/chemistry');
check('each delivery has a new identity', first.id === second.id, false);

bus.on('workspace_changed', () => {
  throw new Error('listener failed');
});
bus.on('workspace_changed', (event) => calls.push(`after:${event.payload}`));
bus.emit('workspace_changed', '/notes/math');
check('a throwing listener is reported', logged, ['listener failed']);
check('and later listeners still receive the fact', calls.slice(-1), ['after:/notes/math']);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('local events: one typed synchronous delivery path');
```

- [x] **Step 2: Verify RED**

```bash
node test/checks/check-local-events.mjs
```

Expected: FAIL because `src/events/local_bus.ts` does not exist.

- [x] **Step 3: Implement the bus**

Create `src/events/local_bus.ts` with a generic event map constrained to JSON-compatible records. The implementation uses `Map<keyof Events, Set<Listener>>`, catches each listener independently, and creates deterministic incrementing event ids with a per-bus prefix.

The comment for `emit` includes this example:

```ts
/**
 * Delivers one already-committed fact to same-window listeners.
 *
 * Example: `emit('workspace_changed', '/notes/history')` updates the tree and
 * returns after every local listener has seen that exact path.
 */
```

- [x] **Step 4: Verify GREEN**

```bash
node test/checks/check-local-events.mjs
npx tsc --noEmit
```

Expected: both pass.

- [x] **Step 5: Commit**

```bash
git add src/events/local_bus.ts test/checks/check-local-events.mjs
git commit -m "refactor(events): add a typed local event bus"
```

---

### Task 2: Declare Inbound Event Transport

**Files:**
- Modify: `src/services/app_events.ts`
- Modify: `test/checks/check-events.mjs`

**Interfaces:**
- Consumes: `AppEventName`.
- Produces:
  - `type EventBoundary = 'local' | 'inbound'`
  - `EVENT_BOUNDARIES: Readonly<Record<AppEventName, EventBoundary>>`
  - `isInboundEvent(name): boolean`

- [x] **Step 1: Extend the event check first**

Update `test/checks/check-events.mjs` to fail unless every interface event has one boundary
declaration and every Rust `.emit("…")` name is `inbound`.

The check must assert:

```js
const boundaries = new Set(
  source
    .slice(source.indexOf('export const EVENT_BOUNDARIES'))
    .matchAll(/^\s{2}([a-z_]+): '(local|inbound)'/gm)
    .map((match) => [match[1], match[2]])
);
```

and compare the declared interface names to the boundary keys.

- [x] **Step 2: Verify RED**

```bash
node test/checks/check-events.mjs
```

Expected: FAIL because `EVENT_BOUNDARIES` does not exist.

- [x] **Step 3: Add the boundary map**

Every frontend-owned fact is `local`. These Rust-native inputs are `inbound`:

```text
setting
config_changed
citation_config_changed
new_markdown
open_file
open_folder
save
save_as
version_save
manage_export_templates
undo
redo
cut
select_all
find
replace
toggle_stack
next_stacked
previous_stacked
export
documentation
report_issue
check_for_updates
input_source_changed
tutorial
```

Everything else in `AppEvents` is local.

- [x] **Step 4: Verify GREEN and commit**

```bash
node test/checks/check-events.mjs
npx tsc --noEmit
git add src/services/app_events.ts test/checks/check-events.mjs
git commit -m "refactor(events): declare local and inbound boundaries"
```

---

### Task 3: Make EventManager Local-First

**Files:**
- Modify: `src/services/event_manager.ts`
- Modify: `src/services/app_events.ts` only if an envelope type belongs there
- Test: `test/checks/check-event-manager.mjs` (source/structure and pure adapter only)

**Interfaces:**
- Consumes: `LocalEventBus`, `EVENT_BOUNDARIES`, `isInboundEvent`.
- Produces: the existing `eventManager` API, with synchronous local delivery and lazy Tauri listeners for inbound names.

- [x] **Step 1: Write adapter expectations**

The check reads `src/services/event_manager.ts` and requires:

```text
new LocalEventBus
isInboundEvent(eventName)
listen(eventName
local.emit(eventName
```

It also requires that `emit` never calls Tauri's `emit`.

Run:

```bash
node test/checks/check-event-manager.mjs
```

Expected: FAIL because the manager still imports and calls Tauri `emit` for every event.

- [x] **Step 2: Replace broadcast internals**

`EventManager.on`:

1. calls `local.on` immediately;
2. if the event is inbound, lazily installs one Tauri listener for that name;
3. forwards inbound Tauri payloads into `local.emit`;
4. returns an unsubscribe function is not required by the public API, so preserve `off`.

`EventManager.emit`:

1. calls `local.emit` once;
2. returns `Promise<void>` for compatibility;
3. never calls Tauri `emit`.

The Tauri event object passed to listeners retains `event` and `payload`; extra envelope fields
(`id`, `emittedAt`, `correlationId`) are present on locally emitted events.

- [x] **Step 3: Verify adapter and TypeScript**

```bash
node test/checks/check-event-manager.mjs
npx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add src/services/event_manager.ts test/checks/check-event-manager.mjs
git commit -m "refactor(events): deliver local facts without Tauri"
```

---

### Task 4: Prove Local and Inbound App Behavior

**Files:**
- Create: `test/probes/event-transport.js`
- Modify: `docs/architecture.md`
- Modify: `docs/ai-context.md`
- Modify: `docs/structure.md`
- Modify: `test/README.md`

**Interfaces:**
- Consumes: `/src/services/event_manager.ts` and `/src/events/local_bus.ts`.
- Produces: a running-app proof that a local fact reaches a listener before the emit Promise settles,
  while a native event still crosses Tauri.

- [x] **Step 1: Add the probe**

The probe subscribes to `document_session_changed` and `config_changed`, emits a local layout event,
and confirms:

- the local callback runs synchronously;
- the event has an envelope id;
- a native menu event emitted through Tauri still reaches its listener.

- [x] **Step 2: Run affected probes**

```bash
npm run probe -- test/probes/event-transport.js
npm run probe -- test/probes/documentation.js
npm run probe -- test/probes/workspace-outside-home.js
npm run probe -- test/probes/command-contract.js
```

- [x] **Step 3: Final verification and commit**

```bash
npx tsc --noEmit
npm run check
git add test/probes/event-transport.js docs test/README.md
git commit -m "docs(events): document local-first delivery"
```

## Self-Review

- **Spec coverage:** Covers typed event envelopes, synchronous same-window delivery, lazy Tauri
  transport for inbound events, correlation, listener isolation, and documentation.
- **Placeholder scan:** Every task has exact files, expected failures, implementation shape, tests,
  and verification commands.
- **Type consistency:** `LocalEventBus`, `EventEnvelope`, `EVENT_BOUNDARIES`, `isInboundEvent`, and
  the retained `eventManager` API are introduced before later tasks use them.
