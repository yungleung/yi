# Command Contract Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the editor-local command registry with one app-wide typed command catalogue, dispatcher, authority model, and trigger boundary without changing user-visible behaviour.

**Architecture:** A serializable contract map owns each command id, input parser, effect, timing, exposure, and description. Feature modules register only execution and availability, while keyboard, toolbar, menu, tests, and future agent/MCP adapters dispatch through the same result-returning dispatcher.

**Tech Stack:** TypeScript 7, Tauri 2, Node checks bundled with rolldown, Tauri MCP probes.

**Spec:** `docs/superpowers/specs/2026-10-31-human-maintainable-command-event-architecture-design.md`

## Global Constraints

- Never commit to `main`; work on `codex/human-maintainable-command-event`.
- Preserve all existing command ids, shortcuts, menu behavior, and document behavior.
- No new production dependency.
- No command trigger may call command implementations directly.
- Every command payload is parsed from `unknown` before feature code runs.
- Normal typing, IME, caret movement, and undo behavior remain synchronous.
- Every source module must have a house-style header.
- Function and method comments include a concrete example when the contract is not obvious.
- Run `npx tsc --noEmit` and `npm run check` after each task.
- Run affected Tauri MCP probes after app wiring changes.
- Commit each independently reviewable task on the feature branch.

---

### Task 1: Command Contracts and Input Parsers

**Files:**
- Create: `src/commands/contracts.ts`
- Test: `test/checks/check-command-contracts.mjs`

**Interfaces:**
- Consumes: `FORMATTING_STYLES`, `LIST_KINDS`, `TABLE_COMMANDS`, and `TableTarget`.
- Produces:
  - `type CommandId = keyof CommandContracts`
  - `type CommandInput<Id extends CommandId> = CommandContracts[Id]['input']`
  - `commandContracts: CommandContracts`
  - `parseCommandInput<Id extends CommandId>(id: Id, value: unknown): CommandInput<Id>`
  - `CommandInputError`

- [x] **Step 1: Write the failing contract check**

Create `test/checks/check-command-contracts.mjs` with a real rolldown import and hand-derived input expectations:

```js
/**
 * Checks the command catalogue as data: every id has one contract, each
 * parser accepts its real trigger shape, and malformed external input is refused.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-command-contracts-'));
const build = await rolldown({ input: 'src/commands/contracts.ts', logLevel: 'silent' });
const { output } = await build.generate({ format: 'esm' });
await build.close();
const file = join(directory, 'contracts.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const {
  commandContracts,
  parseCommandInput,
  CommandInputError
} = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const rejects = (name, id, value) => {
  let thrown = null;
  try {
    parseCommandInput(id, value);
  } catch (error) {
    thrown = error;
  }
  check(name, thrown instanceof CommandInputError, true);
};

check('the table includes every current command family', [
  'format:bold' in commandContracts,
  'list:indent' in commandContracts,
  'table:insert' in commandContracts,
  'file:newMarkdown' in commandContracts,
  'session:restore' in commandContracts
], [true, true, true, true, true]);

check(
  'a no-input command accepts the absent payload the native menu sends',
  parseCommandInput('format:bold', undefined),
  null
);
rejects('a no-input command refuses accidental data', 'format:bold', { style: 'bold' });

check(
  'a new note preserves the tree folder that chose its destination',
  parseCommandInput('file:newMarkdown', { folder: '/notes/history' }),
  { folder: '/notes/history' }
);
check('the menu may ask for a new note without a folder', parseCommandInput('file:newMarkdown'), null);
rejects('a new note refuses a non-string folder', 'file:newMarkdown', { folder: 7 });

check(
  'a table operation receives the menu target as numbers',
  parseCommandInput('table:deleteRow', { lineStart: 12, row: 1, column: 0 }),
  { lineStart: 12, row: 1, column: 0 }
);
rejects(
  'a table operation refuses a target with an infinite row',
  'table:deleteRow',
  { lineStart: 12, row: Infinity, column: 0 }
);

check(
  'the table picker sizes are positive integers',
  parseCommandInput('table:insert', { rows: 3, columns: 4 }),
  { rows: 3, columns: 4 }
);
rejects('the table picker refuses a fractional row count', 'table:insert', {
  rows: 2.5,
  columns: 4
});

check('a session id is a non-empty string', parseCommandInput('session:restore', 'note-7'), 'note-7');
rejects('a session command refuses an empty id', 'session:drop', '');
check(
  'an export kind is optional because the old menu may omit it',
  parseCommandInput('file:export', undefined),
  null
);
rejects('an export kind cannot be a number', 'file:export', 3);

const incomplete = Object.entries(commandContracts).filter(([, contract]) =>
  typeof contract.description !== 'string' ||
  contract.description.length === 0 ||
  !['none', 'document.write', 'session.write', 'workspace.write', 'export.run', 'version.write']
    .includes(contract.effect) ||
  !['sync', 'async'].includes(contract.timing) ||
  !['public', 'internal'].includes(contract.exposure) ||
  typeof contract.parse !== 'function'
);
check('every command has complete serializable metadata', incomplete.map(([id]) => id), []);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('command contracts: every command has one typed input');
```

- [x] **Step 2: Run the check and verify RED**

Run:

```bash
node test/checks/check-command-contracts.mjs
```

Expected: FAIL because `src/commands/contracts.ts` does not exist.

- [x] **Step 3: Implement the contract catalogue**

Create `src/commands/contracts.ts`. Use explicit mapped families for formatting, list, and table commands so the type and runtime catalogue derive from the existing command vocabularies.

```ts
/**
 * The one catalogue of app commands: id, input, effect, timing, exposure and parser.
 *
 * Example: the native menu sends `{ folder: '/notes/history' }` for
 * `file:newMarkdown`; the tree sends the same shape, and both are parsed here
 * before the new-note flow sees them.
 *
 * May import: command vocabulary types only. Upholds: one command id has one
 * declared contract, and no external trigger passes unchecked input to feature code.
 */

import { FORMATTING_STYLES, type FormattingStyle } from '../ui/markdown/format';
import { LIST_KINDS } from '../ui/markdown/syntax/list_edits';
import {
  TABLE_COMMANDS,
  type TableCommand,
  type TableTarget
} from '../ui/markdown/editing/table';

export type CommandEffect =
  | 'none'
  | 'document.write'
  | 'session.write'
  | 'workspace.write'
  | 'export.run'
  | 'version.write';

export interface CommandContract<Input, Output = null> {
  /** Phantom type only; command input is parsed at dispatch time. */
  declare readonly __input?: Input;
  /** Phantom type only; command output is reported in the dispatch result. */
  declare readonly __output?: Output;
  readonly effect: CommandEffect;
  readonly timing: 'sync' | 'async';
  readonly exposure: 'public' | 'internal';
  readonly description: string;
  readonly parse: (value: unknown) => Input;
}

/** A malformed value crossed a command boundary. */
export class CommandInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandInputError';
  }
}

export interface NewDocumentCommandInput {
  readonly folder: string;
}

export interface TableSizeInput {
  readonly rows: number;
  readonly columns: number;
}

type NoInputContract = CommandContract<null>;
type FormattingContracts = {
  [Id in `format:${FormattingStyle}`]: NoInputContract;
};
type ListContracts = {
  [Id in `list:${ListCommand}`]: NoInputContract;
};
type TableContracts = {
  [Id in `table:${TableCommand}`]: CommandContract<TableTarget>;
};

export type CommandContracts = FormattingContracts &
  ListContracts &
  TableContracts & {
    'history:undo': NoInputContract;
    'history:redo': NoInputContract;
    'edit:cut': NoInputContract;
    'edit:selectAll': NoInputContract;
    'edit:insertFootnote': NoInputContract;
    'edit:insertLink': NoInputContract;
    'edit:insertRule': NoInputContract;
    'edit:insertImage': NoInputContract;
    'file:save': CommandContract<null>;
    'file:saveAs': CommandContract<null>;
    'file:export': CommandContract<string | null>;
    'export:manageTemplates': NoInputContract;
    'file:newMarkdown': CommandContract<NewDocumentCommandInput | null>;
    'help:tutorial': NoInputContract;
    'help:documentation': NoInputContract;
    'version:save': NoInputContract;
    'session:toggleStack': NoInputContract;
    'session:nextStacked': NoInputContract;
    'session:previousStacked': NoInputContract;
    'session:openStack': NoInputContract;
    'session:restore': CommandContract<string>;
    'session:drop': CommandContract<string>;
    'view:togglePage': NoInputContract;
    'find:open': NoInputContract;
    'find:replace': NoInputContract;
    'find:close': NoInputContract;
    'table:insert': CommandContract<TableSizeInput>;
  };

export type CommandId = keyof CommandContracts;
export type CommandInput<Id extends CommandId> =
  CommandContracts[Id] extends CommandContract<infer Input, unknown> ? Input : never;
export type CommandOutput<Id extends CommandId> =
  CommandContracts[Id] extends CommandContract<unknown, infer Output> ? Output : never;

function parseNoInput(value: unknown): null {
  if (value === undefined || value === null) {
    return null;
  }
  throw new CommandInputError('this command takes no input');
}

function parseRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CommandInputError(`${name} must be a non-empty string`);
  }
  return value;
}

function parseOptionalString(value: unknown, name: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return parseRequiredString(value, name);
}

function parseNewDocumentInput(value: unknown): NewDocumentCommandInput | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CommandInputError('new note input must be an object or null');
  }
  const folder = (value as { folder?: unknown }).folder;
  if (folder === undefined) {
    return null;
  }
  return { folder: parseRequiredString(folder, 'folder') };
}

function parseFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CommandInputError(`${name} must be a finite number`);
  }
  return value;
}

function parseTableTarget(value: unknown): TableTarget {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CommandInputError('table target must be an object');
  }
  const target = value as Record<string, unknown>;
  return {
    lineStart: parseFiniteNumber(target.lineStart, 'lineStart'),
    row: parseFiniteNumber(target.row, 'row'),
    column: parseFiniteNumber(target.column, 'column')
  };
}

function parseTableSize(value: unknown): TableSizeInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CommandInputError('table size must be an object');
  }
  const size = value as Record<string, unknown>;
  const rows = parseFiniteNumber(size.rows, 'rows');
  const columns = parseFiniteNumber(size.columns, 'columns');
  if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(columns) || columns <= 0) {
    throw new CommandInputError('table rows and columns must be positive integers');
  }
  return { rows, columns };
}

const noInput = (description: string): NoInputContract => ({
  effect: 'none',
  timing: 'sync',
  exposure: 'public',
  description,
  parse: parseNoInput
});

const documentWrite = (description: string): NoInputContract => ({
  ...noInput(description),
  effect: 'document.write'
});

const formatting = Object.fromEntries(
  FORMATTING_STYLES.map((style) => [
    `format:${style}`,
    documentWrite(`apply ${style} to the current selection`)
  ])
) as FormattingContracts;

const lists = Object.fromEntries(
  [...LIST_KINDS, 'indent', 'outdent'].map((command) => [
    `list:${command}`,
    documentWrite(`apply the ${command} list command`)
  ])
) as ListContracts;

const tables = Object.fromEntries(
  TABLE_COMMANDS.map((command) => [
    `table:${command}`,
    {
      ...documentWrite(`apply the ${command} table command`),
      parse: parseTableTarget
    }
  ])
) as TableContracts;

export const commandContracts: CommandContracts = {
  ...formatting,
  ...lists,
  ...tables,
  'history:undo': documentWrite('undo the last document edit'),
  'history:redo': documentWrite('redo the last undone document edit'),
  'edit:cut': documentWrite('cut the current selection'),
  'edit:selectAll': noInput('select the whole document'),
  'edit:insertFootnote': documentWrite('insert a footnote'),
  'edit:insertLink': documentWrite('insert a link'),
  'edit:insertRule': documentWrite('insert a thematic rule'),
  'edit:insertImage': documentWrite('insert an image'),
  'file:save': {
    ...noInput('save the document on screen'),
    effect: 'workspace.write',
    timing: 'async'
  },
  'file:saveAs': {
    ...noInput('save the document under another path'),
    effect: 'workspace.write',
    timing: 'async'
  },
  'file:export': {
    effect: 'export.run',
    timing: 'async',
    exposure: 'public',
    description: 'export the document on screen',
    parse: (value) => parseOptionalString(value, 'export kind')
  },
  'export:manageTemplates': {
    ...noInput('open the export template manager'),
    timing: 'async'
  },
  'file:newMarkdown': {
    effect: 'workspace.write',
    timing: 'async',
    exposure: 'public',
    description: 'create and open a new markdown note',
    parse: parseNewDocumentInput
  },
  'help:tutorial': noInput('open the tutorial'),
  'help:documentation': noInput('open Documentation'),
  'version:save': {
    ...noInput('save a version of the document'),
    effect: 'version.write',
    timing: 'async'
  },
  'session:toggleStack': {
    ...noInput('toggle the current document in the stack'),
    effect: 'session.write'
  },
  'session:nextStacked': {
    ...noInput('open the next stacked document'),
    effect: 'session.write'
  },
  'session:previousStacked': {
    ...noInput('open the previous stacked document'),
    effect: 'session.write'
  },
  'session:openStack': noInput('open the stacked document list'),
  'session:restore': {
    effect: 'session.write',
    timing: 'sync',
    exposure: 'public',
    description: 'open a stacked document',
    parse: (value) => parseRequiredString(value, 'document id')
  },
  'session:drop': {
    effect: 'session.write',
    timing: 'async',
    exposure: 'public',
    description: 'drop a document from the stack',
    parse: (value) => parseRequiredString(value, 'document id')
  },
  'view:togglePage': noInput('switch between the page and full-width layout'),
  'find:open': noInput('open find'),
  'find:replace': noInput('open find and replace'),
  'find:close': noInput('close find'),
  'table:insert': {
    effect: 'document.write',
    timing: 'sync',
    exposure: 'public',
    description: 'insert a table',
    parse: parseTableSize
  }
};

export function parseCommandInput<Id extends CommandId>(
  id: Id,
  value: unknown
): CommandInput<Id> {
  return commandContracts[id].parse(value) as CommandInput<Id>;
}
```

The mapped interfaces and runtime catalogue both derive from the existing constants, so adding a
formatting style, list kind, or table operation fails at compile time until its contract exists.

- [x] **Step 4: Run the contract check and verify GREEN**

Run:

```bash
node test/checks/check-command-contracts.mjs
```

Expected: `command contracts: every command has one typed input`

- [x] **Step 5: Run type and full pure checks**

```bash
npx tsc --noEmit
npm run check
```

Expected: both pass; the check count increases by one.

- [x] **Step 6: Commit**

```bash
git add src/commands/contracts.ts test/checks/check-command-contracts.mjs
git commit -m "refactor(commands): declare one typed command contract"
```

---

### Task 2: Typed Registry and Dispatcher

**Files:**
- Create: `src/commands/registry.ts`
- Create: `src/commands/dispatch.ts`
- Create: `src/commands/authority.ts`
- Test: `test/checks/check-command-dispatch.mjs`

**Interfaces:**
- Consumes: `commandContracts`, `CommandId`, `CommandInput`, `CommandOutput`.
- Produces:
  - `class CommandRegistry`
  - `interface CommandDefinition<Id extends CommandId>`
  - `class CommandDispatcher`
  - `type CommandOrigin`
  - `type CommandAccess`
  - `type CommandResult`

- [x] **Step 1: Write the failing dispatcher check**

Create `test/checks/check-command-dispatch.mjs` covering duplicate registration, parsing, availability, authority, sync result, async result, and thrown errors:

```js
/**
 * Checks command dispatch as behavior: a malformed, forbidden, unavailable or
 * stale command cannot run, and a successful command reports its correlation id.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-command-dispatch-'));
async function bundleModule(input, name) {
  const build = await rolldown({ input, logLevel: 'silent' });
  const { output } = await build.generate({ format: 'esm' });
  await build.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const { CommandRegistry } = await bundleModule('src/commands/registry.ts', 'registry');
const { CommandDispatcher } = await bundleModule('src/commands/dispatch.ts', 'dispatch');
const { localAccess } = await bundleModule('src/commands/authority.ts', 'authority');

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const origin = { kind: 'toolbar', windowId: 'main' };
const access = localAccess(true);
const registry = new CommandRegistry();
const dispatcher = new CommandDispatcher(registry, () => access);
registry.register({
  id: 'edit:insertRule',
  run: (input, context) => ({ input, correlationId: context.correlationId })
});

const first = dispatcher.dispatch(
  'edit:insertRule',
  null,
  origin,
  { correlationId: 'run-7' }
);
check('a sync command returns a result directly', first instanceof Promise, false);
check('and the result is successful', first.ok, true);
check('and it carries the caller correlation id', first.correlationId, 'run-7');

const invalid = dispatcher.dispatch('session:restore', '', origin, {
  correlationId: 'run-8'
});
check('invalid external input is refused', invalid.code, 'invalid-input');
check('and feature code does not run', invalid.commandId, 'session:restore');

const forbiddenRegistry = new CommandRegistry();
forbiddenRegistry.register({
  id: 'edit:insertRule',
  run: () => {
    throw new Error('must not run');
  }
});
const forbidden = new CommandDispatcher(forbiddenRegistry, () => localAccess(false)).dispatch(
  'edit:insertRule',
  null,
  origin,
  { correlationId: 'run-9' }
);
check('a read-only document refuses a document write', forbidden.code, 'forbidden');

const unavailableRegistry = new CommandRegistry();
unavailableRegistry.register({
  id: 'edit:insertRule',
  available: () => false,
  run: () => null
});
const unavailable = new CommandDispatcher(unavailableRegistry, () => access).dispatch(
  'edit:insertRule',
  null,
  origin,
  { correlationId: 'run-10' }
);
check('an unavailable command is refused', unavailable.code, 'unavailable');

const asyncRegistry = new CommandRegistry();
asyncRegistry.register({
  id: 'file:save',
  run: async () => null
});
const asyncResult = await new CommandDispatcher(asyncRegistry, () => access).dispatch(
  'file:save',
  null,
  origin,
  { correlationId: 'run-11' }
);
check('an async command resolves through a result', asyncResult.ok, true);

const throwingRegistry = new CommandRegistry();
throwingRegistry.register({
  id: 'edit:insertRule',
  run: () => {
    throw new Error('no selection');
  }
});
const failed = new CommandDispatcher(throwingRegistry, () => access).dispatch(
  'edit:insertRule',
  null,
  origin,
  { correlationId: 'run-12' }
);
check('a thrown feature error becomes a failed result', failed.code, 'failed');
check('and the result preserves the reason', failed.message, 'no selection');

let duplicate = '';
const duplicateRegistry = new CommandRegistry();
const definition = { id: 'edit:insertRule', run: () => null };
duplicateRegistry.register(definition);
try {
  duplicateRegistry.register(definition);
} catch (error) {
  duplicate = error instanceof Error ? error.message : String(error);
}
check('registering one id twice is an explicit bug', duplicate, 'duplicate command: edit:insertRule');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('command dispatch: one typed, authorized result path');
```

- [x] **Step 2: Run the check and verify RED**

```bash
node test/checks/check-command-dispatch.mjs
```

Expected: FAIL because the command modules do not exist.

- [x] **Step 3: Implement `authority.ts`**

Create `src/commands/authority.ts` with a closed origin/effect vocabulary. `localAccess(true)` permits `document.write`; `localAccess(false)` does not. `accessForOrigin` permits current local UI origins and denies automation origins until an explicit adapter grants access.

Use these exact signatures:

```ts
export type CommandOriginKind =
  | 'keyboard'
  | 'toolbar'
  | 'native-menu'
  | 'context-menu'
  | 'builtin-agent'
  | 'mcp'
  | 'test';

export interface CommandOrigin {
  readonly kind: CommandOriginKind;
  readonly windowId?: string;
  readonly requestId?: string;
}

export interface CommandAccess {
  readonly effects: ReadonlySet<CommandEffect>;
}

export function localAccess(documentWritable: boolean): CommandAccess;
export function setDocumentWritable(writable: boolean): void;
export function documentWritable(): boolean;
export function accessForOrigin(origin: CommandOrigin): CommandAccess;
```

`localAccess(false)` excludes exactly `document.write` and keeps the other current effects. `accessForOrigin` grants that local access for the five local UI origin kinds and returns an empty effect set for `builtin-agent`, `mcp`, and `test`.

- [x] **Step 4: Implement `registry.ts`**

Create a class-based registry plus singleton registration helpers. The classes are what tests instantiate; the singleton helpers preserve the existing import style during migration.

```ts
export interface CommandDefinition<Id extends CommandId> {
  readonly id: Id;
  run(
    input: CommandInput<Id>,
    context: CommandContext
  ): CommandOutput<Id> | Promise<CommandOutput<Id>>;
  available?(context: CommandContext): boolean;
}

export class CommandRegistry {
  register<Id extends CommandId>(command: CommandDefinition<Id>): void;
  get<Id extends CommandId>(id: Id): CommandDefinition<Id> | null;
  all(): readonly CommandDefinition<CommandId>[];
}

export const commandRegistry: CommandRegistry;
export function registerCommand<Id extends CommandId>(
  command: CommandDefinition<Id>
): void;
export function registeredCommands(): readonly CommandDefinition<CommandId>[];
```

The duplicate error is exactly `duplicate command: <id>`.

- [x] **Step 5: Implement `dispatch.ts`**

Define `CommandContext`, `CommandResult`, and a dispatcher whose result is direct for sync commands and a Promise for async commands.

```ts
export interface CommandContext {
  readonly origin: CommandOrigin;
  readonly access: CommandAccess;
  readonly correlationId: string;
}

export interface CommandSuccess {
  readonly ok: true;
  readonly commandId: CommandId;
  readonly correlationId: string;
  readonly value: unknown;
}

export interface CommandFailure {
  readonly ok: false;
  readonly commandId: CommandId;
  readonly correlationId: string;
  readonly code:
    | 'not-found'
    | 'unavailable'
    | 'forbidden'
    | 'invalid-input'
    | 'failed';
  readonly message: string;
}

export type CommandResult = CommandSuccess | CommandFailure;

export class CommandDispatcher {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly accessForOrigin: (origin: CommandOrigin) => CommandAccess
  );

  dispatch<Id extends CommandId>(
    id: Id,
    input: unknown,
    origin: CommandOrigin,
    options?: { correlationId?: string }
  ): CommandResult | Promise<CommandResult>;
}
```

Dispatch order is: registered command, parsed input, declared effect allowed, availability, execution.

- [x] **Step 6: Run dispatcher checks**

```bash
node test/checks/check-command-dispatch.mjs
npx tsc --noEmit
```

Expected: the check prints `command dispatch: one typed, authorized result path`; TypeScript is silent.

- [x] **Step 7: Commit**

```bash
git add src/commands/registry.ts src/commands/dispatch.ts src/commands/authority.ts test/checks/check-command-dispatch.mjs
git commit -m "refactor(commands): add typed authorized dispatch"
```

---

### Task 3: Migrate Existing Commands and Triggers

**Files:**
- Create: `src/commands/runtime.ts`
- Create: `src/commands/triggers/keymap.ts`
- Create: `src/commands/triggers/native_menu.ts`
- Delete: `src/ui/markdown/commands/registry.ts`
- Delete: `src/ui/markdown/commands/keymap.ts`
- Delete: `src/ui/markdown/commands/menu.ts`
- Modify all command registrations and `runCommand` callers:
  `src/ui/markdown/commands/editor_commands.ts`, `src/ui/session/session_commands.ts`,
  `src/ui/session/stack_popover.ts`, `src/ui/new_document/new_document_flow.ts`,
  `src/ui/export/export_flow.ts`, `src/ui/export/manager/export_manager_flow.ts`,
  `src/ui/versioning/save_version.ts`, `src/ui/tutorial/tutorial_flow.ts`,
  `src/ui/documentation/documentation_flow.ts`, the toolbar modules,
  `src/ui/table/table_menu.ts`, `src/ui/workspace/tree_ops.ts`,
  `src/ui/markdown/editing/keys.ts`, and `src/ui/markdown/markdown_editor.ts`.
- Modify: `test/checks/commands.mjs`
- Modify affected probes that import the old registry path.
- Modify documentation paths in `docs/adding-a-command.md`, `docs/architecture.md`, and
  `docs/ai-context.md`.

**Interfaces:**
- Consumes: registry, dispatcher, authority, and contract map from Tasks 1-2.
- Produces:
  - singleton `commandDispatcher`
  - `runCommand<Id extends CommandId>(id, input, originKind?): boolean`
  - `dispatchCommand<Id extends CommandId>(id, input, origin, options?): CommandResult | Promise<CommandResult>`
  - `dispatchRawCommand<Id extends CommandId>(id, value, origin, options?)`

- [x] **Step 1: Update `test/checks/commands.mjs` first**

Change the check to read `src/commands/registry.ts`, `src/commands/runtime.ts`,
`src/commands/triggers/native_menu.ts`, and `src/commands/triggers/keymap.ts`. It must fail
while the old paths and duplicate registries remain.

The check must require:

```js
const registry = 'src/commands/registry.ts';
const runtime = 'src/commands/runtime.ts';
const menuBridge = 'src/commands/triggers/native_menu.ts';
```

and assert these exports exist:

```ts
// registry.ts
export class CommandRegistry
export function registerCommand
export function registeredCommands

// runtime.ts
export const commandDispatcher
export function runCommand
export function dispatchCommand
export function dispatchRawCommand
```

- [x] **Step 2: Run the command check and verify RED**

```bash
node test/checks/commands.mjs
```

Expected: FAIL naming the missing new command files.

- [x] **Step 3: Create the runtime facade**

`src/commands/runtime.ts` owns the one singleton registry and dispatcher:

```ts
export const commandRegistry = new CommandRegistry();
export const commandDispatcher = new CommandDispatcher(commandRegistry, accessForOrigin);

export function registerCommand<Id extends CommandId>(
  command: CommandDefinition<Id>
): void {
  commandRegistry.register(command);
}

export function dispatchCommand<Id extends CommandId>(
  id: Id,
  input: CommandInput<Id>,
  origin: CommandOrigin,
  options?: { correlationId?: string }
): CommandResult | Promise<CommandResult> {
  return commandDispatcher.dispatch(id, input, origin, options);
}

export function dispatchRawCommand<Id extends CommandId>(
  id: Id,
  value: unknown,
  origin: CommandOrigin,
  options?: { correlationId?: string }
): CommandResult | Promise<CommandResult> {
  return commandDispatcher.dispatch(id, value, origin, options);
}

export function runCommand<Id extends CommandId>(
  id: Id,
  input: CommandInput<Id>,
  originKind: CommandOriginKind = 'toolbar'
): boolean {
  const result = dispatchCommand(id, input, { kind: originKind });
  if (result instanceof Promise) {
    void result.then((settled) => {
      if (!settled.ok) {
        console.error(`command ${settled.commandId}: ${settled.message}`);
      }
    });
    return true;
  }
  return result.ok;
}
```

The actual signature must make no-input commands ergonomic with a defaulted second argument. Use overloads:

```ts
export function runCommand<Id extends CommandId>(
  id: Id,
  input: CommandInput<Id>
): boolean;
export function runCommand<Id extends CommandId>(
  id: Id,
  input: CommandInput<Id>,
  originKind: CommandOriginKind
): boolean;
```

For no-input commands, declare the overload with `input?: null` so existing `runCommand('find:close')` calls stay valid.

- [x] **Step 4: Move trigger adapters**

Move `keymap.ts` and `menu.ts` under `src/commands/triggers/`. Keep their vocabulary and behavior
unchanged. The native-menu adapter uses `AppEventName` type-only and maps each event to a
`CommandId`.

- [x] **Step 5: Migrate registrations**

Every existing `run(payload)` reads its typed input instead of casting:

```ts
registerCommand({
  id: 'session:restore',
  run: (documentId) => documentSession.restore(documentId)
});
```

```ts
registerCommand({
  id: 'file:newMarkdown',
  run: (input) => void newDocument(input?.folder ?? null, chooser, templateChooser)
});
```

```ts
registerCommand({
  id: 'file:export',
  run: (kind) => void exportNote(host.text(), kind, host.progress)
});
```

For table commands, use the parsed `TableTarget` directly. Remove the local
`runTableOperation(context, command, payload: unknown)` cast and make it accept `TableTarget`.

- [x] **Step 6: Migrate triggers and origins**

Pass the real trigger kind:

```ts
runCommand('format:bold', null, 'toolbar');
runCommand(commandId, null, 'keyboard');
runCommand('session:drop', id, 'toolbar');
runCommand(`table:${command}`, target, 'context-menu');
```

Native-menu listeners use:

```ts
const settled = dispatchRawCommand(command, event.payload, { kind: 'native-menu' });
if (settled instanceof Promise) {
  void settled.catch((error) => console.error(error));
}
```

The editor's `setReadOnly` calls `setDocumentWritable(!readOnly)` instead of
`setEditingAllowed`.

- [x] **Step 7: Update tests and probes that import the old registry**

Use `/src/commands/runtime.ts` in probes and `src/commands/contracts.ts` or
`src/commands/runtime.ts` in checks. Keep test triggers explicit:

```js
runtime.runCommand('find:close', null, 'test');
```

Test origins are denied write effects by default, so read-only/cleanup commands remain valid and
write-command tests continue through the real keyboard or toolbar trigger.

- [x] **Step 8: Run TypeScript, pure checks, and command probes**

```bash
npx tsc --noEmit
npm run check
```

Expected: all checks pass with updated command paths.

Start the app after the branch is current:

```bash
npm run tauri dev
```

In another terminal:

```bash
npm run probe -- test/probes/footnote-preview.js
npm run probe -- test/probes/citation-preview.js
npm run probe -- test/probes/documentation.js
```

Expected: each reports `failed: []`.

- [x] **Step 9: Commit**

```bash
git add src/commands src/ui test docs
git commit -m "refactor(commands): route every trigger through one dispatcher"
```

---

### Task 4: Runtime Command Contract Probe and Documentation

**Files:**
- Create: `test/probes/command-contract.js`
- Modify: `docs/adding-a-command.md`
- Modify: `docs/architecture.md`
- Modify: `docs/structure.md`
- Modify: `docs/ai-context.md`

**Interfaces:**
- Consumes: `/src/commands/contracts.ts` and `/src/commands/runtime.ts`.
- Produces: a running-app proof that the catalogue is present, menu payloads parse, invalid input
  is refused, and a real toolbar command still edits through the same route.

- [x] **Step 1: Write the failing app probe**

Create `test/probes/command-contract.js`:

```js
(async () => {
  const checks = [];
  const failed = [];
  const check = (name, pass, detail = null) => {
    checks.push({ name, pass, detail });
    if (!pass) failed.push(name);
  };
  const contracts = await t.app('/src/commands/contracts.ts');
  const runtime = await t.app('/src/commands/runtime.ts');

  check(
    'the app has the typed command catalogue',
    'format:bold' in contracts.commandContracts &&
      contracts.commandContracts['table:deleteRow'].effect === 'document.write'
  );
  check(
    'a native-menu-like folder payload parses',
    JSON.stringify(
      contracts.parseCommandInput('file:newMarkdown', { folder: '/notes/history' })
    ) === JSON.stringify({ folder: '/notes/history' })
  );
  let invalid = null;
  try {
    contracts.parseCommandInput('table:insert', { rows: 0, columns: 1 });
  } catch (error) {
    invalid = error.name;
  }
  check('an invalid command payload is refused before execution', invalid === 'CommandInputError');
  check(
    'the dispatcher is the runtime command entry',
    typeof runtime.commandDispatcher.dispatch === 'function' &&
      typeof runtime.runCommand === 'function'
  );
  return { checks, failed };
})()
```

- [x] **Step 2: Run the probe and verify its initial state**

Start a fresh app on this branch and run:

```bash
npm run probe -- test/probes/command-contract.js
```

Expected before final documentation wiring: the app loads the modules and reports the catalogue
checks. If the module paths are wrong, the probe fails with `failed` naming each missing contract.

- [x] **Step 3: Update the command recipe and architecture maps**

`docs/adding-a-command.md` must say:

1. add the typed id, input parser, effect, timing, exposure, and description to
   `src/commands/contracts.ts`;
2. implement behavior in the feature module;
3. register execution and availability against the typed id;
4. add the trigger with its origin;
5. write the rule check and real app probe.

Replace old paths to `src/ui/markdown/commands/registry.ts` throughout the docs.

`docs/architecture.md` and `docs/structure.md` list:

```text
src/commands/contracts.ts       command vocabulary and input parsers
src/commands/registry.ts        registration
src/commands/dispatch.ts        parse, authority, execution, result
src/commands/authority.ts       origins and document writability
src/commands/runtime.ts         the app singleton
src/commands/triggers/          keyboard and native-menu adapters
```

Document that commands are requests, events are facts, and the state owner remains authoritative.

- [x] **Step 4: Run final command verification**

```bash
npx tsc --noEmit
npm run check
npm run probe -- test/probes/command-contract.js
npm run probe -- test/probes/footnote-preview.js
npm run probe -- test/probes/citation-preview.js
npm run probe -- test/probes/documentation.js
```

Expected: TypeScript silent; all pure checks pass; every probe reports `failed: []`.

- [x] **Step 5: Commit**

```bash
git add test/probes/command-contract.js docs
git commit -m "docs(commands): document the typed command boundary"
```

## Self-Review

- **Spec coverage:** This plan implements the command contract, source/origin model, authority
  checks, typed payloads, one dispatcher, runtime results, trigger adapters, and documentation.
  Event migration, document revisions, agent transactions, and large-file splits remain for
  separate plans.
- **Placeholder scan:** No unresolved implementation placeholders remain. Every task names exact
  files, interfaces, test inputs, commands, and expected results.
- **Type consistency:** `CommandId`, `CommandInput`, `CommandOutput`, `CommandDefinition`,
  `CommandOrigin`, `CommandAccess`, `CommandResult`, `dispatchCommand`, `dispatchRawCommand`, and
  `runCommand` are introduced before consumers depend on them.
