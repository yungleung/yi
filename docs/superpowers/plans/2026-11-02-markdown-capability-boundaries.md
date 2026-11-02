# Markdown Capability Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove the blanket “closed Markdown domain” rule while keeping Markdown’s internal capabilities cohesive and its dependency direction explicit.

**Architecture:** Pure `syntax` and `document` rules remain independent of DOM and application services. Markdown command handling moves back into a focused `commands/` capability that imports the app-wide command runtime directly. The shell keeps presentation, native menus, dialogs, translation and host integrations. Existing find, image, clipboard, table-menu and shared-contract splits stay because they isolate real responsibilities rather than enforcing a blanket import ban.

**Tech Stack:** TypeScript, Tauri, Node checks, Tauri MCP probes.

**Spec:** `docs/architecture.md`, `docs/structure.md`, `AGENTS.md`, and the user’s revised capability-boundary rule.

## Global Constraints

- Always test behavior through the Tauri MCP bridge with `npm run tauri dev` and `npm run probe`.
- Preserve observable behavior; this is a structural refactor.
- Pure syntax and document modules may not depend on DOM, application services, commands or Tauri.
- Markdown capability modules may import external modules when integration is their owned responsibility.
- Each capability exposes one explicit entrypoint.
- No import cycles.
- No duplicated command registry or second editing path.
- Function comments include compact concrete examples when the contract is not obvious.

---

### Task 1: Replace the blanket host-boundary guard

**Files:**
- Modify: `test/checks/module-layout.mjs`
- Modify: `docs/architecture.md`
- Modify: `docs/structure.md`
- Modify: `docs/ai-context.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `sourceFiles()`, `resolveImport()` and the existing module-layout failure collector.
- Produces: `expectMarkdownDependencyDirection()`, which rejects application imports from `syntax/` and `document/` only.

- [x] **Step 1: Write the failing guard change**

Replace `expectMarkdownHostBoundary()` with:

```js
const expectMarkdownDependencyDirection = () => {
  const pureRoots = ['src/ui/markdown/syntax/', 'src/ui/markdown/document/'];
  const forbidden = [
    'src/api/',
    'src/commands/',
    'src/services/',
    'src/ui/'
  ];
  for (const importer of sourceFiles('src/ui/markdown', ['.ts'])) {
    if (!pureRoots.some((prefix) => importer.startsWith(prefix))) {
      continue;
    }
    const source = readFileSync(join(root, importer), 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier.startsWith('@tauri-apps/')) {
        failures.push(`${importer} imports host plugin ${specifier} from a pure layer`);
        continue;
      }
      const target = resolveImport(importer, specifier);
      if (target !== null && forbidden.some((prefix) => target.startsWith(prefix))) {
        failures.push(`${importer} reaches outward from the pure Markdown model with ${target}`);
      }
    }
  }
};

expectMarkdownDependencyDirection();
```

Add required command modules and remove required `markdown_host` modules:

```js
expectFile('src/ui/markdown/commands/index.ts');
expectFile('src/ui/markdown/commands/editor_commands.ts');
forbidFile('src/ui/markdown/command_api.ts');
forbidFile('src/ui/markdown_host/commands.ts');
forbidFile('src/ui/markdown_host/index.ts');
```

- [x] **Step 2: Run the check to verify RED**

Run: `node test/checks/module-layout.mjs`

Expected: failure because `src/ui/markdown/commands/editor_commands.ts` and `index.ts` do not exist.

- [x] **Step 3: Update living design documents**

In `AGENTS.md`, replace the “Treat Markdown as a closed editing domain” bullet with:

```md
- Organize Markdown by owned capabilities. Keep pure syntax and document rules independent of DOM,
  services, commands and Tauri. Editing, rendering, command integration and application adapters are
  separate capabilities with explicit entrypoints. Markdown modules may import stable external
  contracts when that integration is their responsibility; do not require every dependency to pass
  through one host object. Shell presentation, translation, dialogs and native menus still belong to
  the shell.
```

Update `docs/architecture.md`, `docs/ai-context.md` and `docs/structure.md` to describe dependency
direction and capability ownership rather than a closed Markdown domain. Remove claims that
Markdown may import no commands or services.

- [x] **Step 4: Run documentation and module checks**

Run: `node test/checks/headers.mjs`

Expected: PASS.

Run: `node test/checks/module-layout.mjs`

Expected: still RED only for the missing command capability files.

---

### Task 2: Restore commands to a focused Markdown capability

**Files:**
- Create: `src/ui/markdown/commands/index.ts`
- Create: `src/ui/markdown/commands/editor_commands.ts`
- Delete: `src/ui/markdown/command_api.ts`
- Delete: `src/ui/markdown_host/commands.ts`
- Delete: `src/ui/markdown_host/index.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/ui/markdown/editor/keyboard.ts`
- Modify: `src/ui/markdown/editing/keys.ts`
- Modify: `src/ui/markdown/host.ts`
- Modify: `src/ui/editor_panel.ts`
- Modify: `test/probes/agent-range-edit.js`

**Interfaces:**
- Consumes: `EditorContext`, `applyEditorHistory`, `MarkdownFindSession`, `EditorPageLayout`, the command runtime and keymap.
- Produces: `registerEditorCommands(host: CommandHost): void`, where `CommandHost` exposes the editor context, history callback, layout toggle, and find callbacks.

- [x] **Step 1: Write the failing command-capability expectation**

The module-layout RED from Task 1 is the failing test for this task:

```text
missing required module: src/ui/markdown/commands/index.ts
missing required module: src/ui/markdown/commands/editor_commands.ts
```

- [x] **Step 2: Create the command capability**

Create `src/ui/markdown/commands/editor_commands.ts` with `CommandHost` and
`registerEditorCommands(host)`. Move the registration bodies from
`src/ui/markdown_host/commands.ts`, replacing API calls with direct context operations:

```ts
registerCommand({
  id: 'format:bold',
  run: () => {
    applyFormatting(context, 'strong');
    return null;
  }
});

registerCommand({
  id: 'document:replaceRange',
  run: (input) => {
    const current = {
      documentKey: context.state.getDocumentKey(),
      revision: context.state.getRevision()
    };
    if (
      input.documentKey !== current.documentKey ||
      input.revision !== current.revision
    ) {
      throw new CommandExecutionError('stale', `document moved to ${current.documentKey}@${current.revision}`);
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

Create `src/ui/markdown/commands/index.ts` with explicit exports:

```ts
export { registerEditorCommands } from './editor_commands';
export type { CommandHost } from './editor_commands';
```

- [x] **Step 3: Wire keyboard and list triggers directly**

In `editor/keyboard.ts`, restore direct keymap/runtime use:

```ts
export function handleEditorShortcut(event: KeyboardEvent): boolean {
  const command = commandForKey(event);
  if (command === null) {
    return false;
  }
  event.preventDefault();
  return runCommand(command, null, 'keyboard');
}
```

In `editing/keys.ts`, replace `host.listStep()` with:

```ts
runCommand(
  event.shiftKey ? 'list:outdent' : 'list:indent',
  null,
  'keyboard'
)
```

- [x] **Step 4: Compose commands inside the editor**

In `WysiwygMarkdownEditor`:

```ts
registerEditorCommands({
  context: this.context,
  applyHistory: (direction) => this.replayHistory(direction),
  toggleLayout: () => {
    this.setLayout(this.pageLayout.get() === 'page' ? 'auto' : 'page');
  },
  openFind: (replace) => this.findUi?.open(replace),
  closeFind: () => this.findUi?.close()
});
```

Remove `commands()`, `commandApi`, `EditorCommandPort`, `createEditorCommandPort()` and the
`markdown_host` imports from `editor_panel.ts`. Keep native-menu dispatch installation in the shell.

- [x] **Step 5: Run static tests to verify GREEN**

Run: `npx tsc --noEmit`

Expected: PASS.

Run: `node test/checks/module-layout.mjs`

Expected: `module layout: all checks passed`.

Run: `npm run check`

Expected: 85/85 checks passed, or the new total if another check was added.

- [x] **Step 6: Prove the command path in the app**

Run `npm run tauri dev` in one terminal.

Run:

```bash
npm run probe -- test/probes/agent-range-edit.js
npm run probe -- test/probes/format-buttons.js
npm run probe -- test/probes/list-tab-indent.js
npm run probe -- test/probes/find-replace.js
```

Expected: every probe exits successfully with `failed: []`.

- [x] **Step 7: Commit**

```bash
git add src/ui/markdown src/ui/markdown_host src/ui/editor_panel.ts test/checks test/probes docs AGENTS.md
git commit -m "refactor(markdown): restore capability-owned command wiring"
```

---

### Task 3: Verify the revised architecture end to end

**Files:**
- Modify: `docs/adding-a-command.md`
- Modify: `test/README.md` only if the check/probe index changed

**Interfaces:**
- Consumes: the completed command capability and revised module guard.
- Produces: final documentation and verification evidence.

- [x] **Step 1: Update command-authoring guidance**

Replace the `markdown_host/commands.ts` example with the real Markdown capability location:

```ts
// src/ui/markdown/commands/editor_commands.ts
import { registerCommand } from '../../../commands/runtime';

registerCommand({
  id: 'edit:insertRule',
  run: () => {
    insertThematicBreak(context);
    return null;
  }
});
```

Explain that Markdown may import the global command contract, while toolbar, menu and future MCP
clients still converge on the same command id.

- [x] **Step 2: Run final static and Rust verification**

Run:

```bash
npx tsc --noEmit
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
git diff --check
```

Expected: all commands exit successfully.

- [x] **Step 3: Run the complete Tauri suite**

With a fresh `npm run tauri dev` process:

Run: `npm run probe:all`

Expected: `276/276 probes passed (36 skipped)`.

- [x] **Step 4: Commit documentation**

```bash
git add docs test/README.md
git commit -m "docs(markdown): define capability dependency boundaries"
```

## Self-Review

- Spec coverage: the blanket import ban is removed; pure layers keep honest dependencies; command
  ownership returns to Markdown; shell presentation remains outside.
- Placeholder scan: no `TODO`, `TBD`, or unspecified implementation step remains.
- Type consistency: `CommandHost`, `registerEditorCommands`, `EditorContext`,
  `handleEditorShortcut`, and `runCommand` match the existing surrounding APIs.
