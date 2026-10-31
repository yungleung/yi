# Adding a command

A command is something the app can be asked to do by name: bold the selection,
open find, save a version, or create a note. Every command has one typed contract,
one implementation, and one dispatch path.

The same command must be usable by a keyboard chord, toolbar button, native menu,
test, and future built-in agent or MCP client. Those sources differ by **origin**
and **authority**, not by a second implementation.

## 1. Write the failing proof

Start with the smallest test that proves the missing behaviour:

- a pure rule goes in `test/checks/`;
- a command that needs the real caret, DOM, keyboard or menu goes in
  `test/probes/`;
- a payload parser or authority rule belongs in `test/checks/check-command-contracts.mjs`
  or `test/checks/check-command-dispatch.mjs`.

Run the test before implementation and confirm it fails for the missing command,
not because of a typo or missing import.

Example: to add `edit:insertRule`, first drive Cmd+Shift+R in a probe and observe
that no thematic rule is inserted.

## 2. Put the rule in the right module

The behaviour belongs where its state lives:

| Work | Home |
| --- | --- |
| Markdown arithmetic | `src/ui/markdown/syntax/` |
| Editing a document through the caret | `src/ui/markdown/editing/` |
| The editor's view or interaction wiring | `src/ui/markdown/` |
| Session, files, versions, export or settings | their feature modules under `src/ui/`, `src/services/` or `src/api/` |

A command is a rule plus the smallest adapter that asks the rule to run. Pure
markdown rules stay testable in Node; DOM or native integration stays with its
owner.

## 3. Declare the typed contract

Add the command id and its contract to `src/commands/contracts.ts`. The contract
owns the input parser, effect, timing, exposure, description, and input/output
types.

Example:

```ts
'edit:insertRule': {
  effect: 'document.write',
  timing: 'sync',
  exposure: 'public',
  description: 'insert a thematic rule',
  parse: parseNoInput
}
```

For a command with input, parse the transport shape once:

```ts
function parseTableTarget(value: unknown): TableTarget {
  // ...
}
```

No feature module receives unchecked menu, MCP, agent or test input. If a payload
cannot be parsed, dispatch returns `invalid-input` and the implementation does not
run.

`effect` is part of the authority contract:

- `none` reads or opens UI;
- `document.write` changes the current note;
- `session.write` changes open documents or the stack;
- `workspace.write` changes files or folders;
- `export.run` runs an export;
- `version.write` writes a version.

## 4. Implement and register the behaviour

Implement the work in the module that owns it. Register against the app-wide
runtime near that behaviour:

```ts
import { registerCommand } from '../../commands/runtime';

registerCommand({
  id: 'edit:insertRule',
  run: () => {
    insertThematicBreak(context);
    return null;
  }
});
```

A family of commands is registered by looping over the module that owns the
family:

```ts
for (const style of FORMATTING_STYLES) {
  registerCommand({
    id: `format:${style}`,
    run: () => {
      applyFormatting(context, style);
      return null;
    }
  });
}
```

Registering one id twice throws during startup. Do not replace an existing
command from another module.

## 5. Add the trigger

Triggers only dispatch command ids. They do not implement the work.

| Trigger | File | Shape |
| --- | --- | --- |
| Key chord | `src/commands/triggers/keymap.ts` | map the chord to a `CommandId`; the editor passes origin `keyboard` |
| Toolbar | `src/ui/toolbar/` | `runCommand('…', null, 'toolbar')` |
| Table context menu | `src/ui/table/table_menu.ts` | dispatch the captured target with origin `context-menu` |
| Native app menu | `src/commands/triggers/native_menu.ts` | map the Rust event to a `CommandId`; the editor passes raw payload with origin `native-menu` |

Typed local callers use `runCommand` or `dispatchCommand`. A transport adapter
that has not parsed its payload uses `dispatchRawCommand`.

Normal typing, Enter, Backspace, Tab and arrow movement remain the synchronous
text path. Do not simulate a keystroke to give an agent an editing capability;
give it a semantic command such as a range replacement or formatting command.

## 6. Prove the command

Run:

```bash
npx tsc --noEmit
npm run check
```

Start a fresh app on the current branch:

```bash
npm run tauri dev
```

Run the probe from another terminal:

```bash
npm run probe -- test/probes/<your-probe>.js
```

The probe must drive a real trigger or the explicit command runtime, then assert:

- the raw document or state changed as intended;
- the visible DOM, caret and scroll are correct when relevant;
- a read-only or unauthorized origin cannot perform the effect;
- an invalid payload is refused before implementation code runs.

Run `npm run probe:all` when the change affects the shared command path.

## Command or event?

- A **command** asks for work: `format:bold`, `file:save`, `session:open`.
- An **event** reports a fact after work commits: `document_changed`,
  `document_session_changed`, `workspace_changed`.

Never emit an event as a disguised command. Never mutate state from an event
listener. The document or session owner applies the change; the event announces it.

## Comments

When a command or its parser is not obvious from its name and types, put a short
concrete example in the comment:

```ts
/**
 * Reads the table target captured before a context menu took focus.
 *
 * Example: `{ lineStart: 12, row: 1, column: 0 }` means the first body cell
 * of the table beginning on line 12.
 */
```

Show the input and result or the failure the function prevents. Do not merely
restate its goal.
