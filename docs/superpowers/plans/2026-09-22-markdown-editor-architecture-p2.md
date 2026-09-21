# Markdown editor clean-up, P2 (one command path) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A contributor adds a command in one file. Today one command touches three files across two layers: the toolbar button emits a Tauri event whose *name* is defined in the button's own module, the editor subscribes to that name, and the native menu's commands arrive as bare string literals (`'undo'`, `'find'`) straight into the editor. P2 gives commands one home — a registry — and one way in.

**Architecture:** A command table in `src/ui/markdown/commands/registry.ts`, filled by the modules that own the behaviour and read by everything that triggers it (the keymap, the toolbars, the table menu, the native-menu bridge). Triggering code stops *emitting* Tauri events and starts *calling* a command id; the Tauri event bus stays for what genuinely crosses windows (the native menu, the settings window, `document_opened`, `workspace_changed`, toasts).

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** `docs/superpowers/specs/2026-09-21-markdown-editor-architecture-design.md` (section 5 layout, section 8 P2)

## Global Constraints

- Behaviour is preserved. The same keys do the same things; the same buttons do the same things; the native menu works.
- Text entry is not a command. Typing, `Enter`, `Backspace`, `Tab` and the arrows stay in the editor's keydown handler and keep calling `editing/*` directly: they are the text path, not actions with names.
- A command id is a string with a `namespace:name` shape (`format:bold`, `edit:insert-footnote`, `table:insert`), declared as a union type in the registry so a typo is a compile error.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` keeps its count (57/58 passing, 6 skipped) from a freshly started app.
- Commit style: `refactor(editor): …`, `test: …`, `docs: …`.

## What is where today

| Trigger | Today | Becomes |
| --- | --- | --- |
| Key chord (`Cmd+Z`, `Cmd+A`, …) | `markdown_editor.ts: handleShortcut` calls `editing/*` inline | `keymap.ts` → `runCommand('history:undo')` |
| Toolbar button | `formatting_toolbar.ts` emits `formatting_command` over the Tauri bus; the editor subscribes | the button calls `runCommand('format:bold')` |
| Table menu entry | `table_menu.ts` emits `table_command`; the editor subscribes | `runCommand('table:<entry>', target)` |
| Table picker | `table_toolbar.ts` emits `table_insert` | `runCommand('table:insert', size)` |
| List buttons | `list_toolbar.ts` emits `list_command` | `runCommand('list:<command>')` |
| Footnote button | `footnote_toolbar.ts` emits `footnote_command` | `runCommand('edit:insert-footnote')` |
| Native menu (`undo`, `find`, `save_as`, …) | Tauri events; the editor subscribes to bare literals | Tauri events → `commands/menu.ts`, one place, mapping name → command id |

## Tasks

### Task 1: The registry and the check that keeps it honest

**Files:** create `src/ui/markdown/commands/registry.ts`, `test/checks/commands.mjs`

- [ ] **Step 1: Write the check (RED)** — it reads sources and asserts: every `runCommand('…')` id in `src` is registered; ids are unique; no module outside `commands/registry.ts` defines a `*_COMMAND` constant; and every `eventManager.on('…')` in the editor either maps through `commands/menu.ts` or is in a documented list of cross-window events (`document_opened`, `workspace_changed`, `citation_updated`, `toast`). Run it: it fails today, on all four counts.
- [ ] **Step 2: Write the registry** — `CommandId` union, `Command` (`id`, `run(context, payload?)`, `available?(context)`), `registerCommand(command)`, `runCommand(id, payload?)`, `registeredCommands()`, and a `commandContext` type holding what a command needs (the editor context plus the registry's own hooks). Register nothing yet.
- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run check` shows the new check failing for the reasons Step 1 lists.
- [ ] **Step 4: Commit** — `test: say what a command is, and watch the editor disagree`.

### Task 2: Route every trigger through the registry

**Files:** create `src/ui/markdown/commands/menu.ts`, `src/ui/markdown/keymap.ts`; modify the five toolbar/table modules, `src/ui/markdown/markdown_editor.ts`, `src/ui/table/table_menu.ts`

- [ ] **Step 1: Register the commands where the behaviour lives** — `formatting` (`format:bold|italic|strike|inlineCode`), `history:undo|redo`, `edit:cut|selectAll|insertFootnote`, `find:open|replace`, `table:insert`, `table:<entry>` (from `tableMenuModel`'s entries, so the menu's model and its commands cannot drift apart), `list:<command>`.
- [ ] **Step 2: The menu bridge** — `commands/menu.ts` maps the native-menu Tauri event names to ids in one table, and the editor subscribes to that table instead of naming literals.
- [ ] **Step 3: The keymap** — `keymap.ts` maps chords (`Cmd/Ctrl+Z`, `+Shift+Z`, `+X`, `+A`, `+F`, `+H`) to ids; `handleShortcut` becomes `const id = commandForKey(event); if (id) { event.preventDefault(); runCommand(id); return true; }`.
- [ ] **Step 4: The producers** — each toolbar/table module calls `runCommand(...)` and no longer imports `eventManager` for its own commands. Its `*_COMMAND` constant is deleted.
- [ ] **Step 5: Verify** — `npx tsc --noEmit`; `npm run check` → the new check passes; probes for the toolbar and table paths (`table-menu.js` by name with the window in front, `table-picker-insert.js`, `list-buttons.js`, `footnote-button.js`).
- [ ] **Step 6: Commit** — `refactor(editor): give commands one home and one way in`.

### Task 3: Split the shell

**Files:** create `src/ui/markdown/click_routing.ts`; rename `src/ui/markdown_editor.ts` → `src/ui/editor_panel.ts`; modify `markdown_editor.ts`, whoever imports the wrapper (`rg -n "markdown_editor'" src`)

- [ ] **Step 1: `click_routing.ts`** — move the four click handlers (task checkbox, footnote jump, table context menu, pointer fallback) into one module that takes the editor context, so `markdown_editor.ts` holds wiring rather than behaviour.
- [ ] **Step 2: Rename the wrapper** — `git mv src/ui/markdown_editor.ts src/ui/editor_panel.ts`, update its importers, and note in the file why two names existed (the class `MarkdownEditor` stays; only the file moves).
- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npm run probe:all`; the app still opens a document from the tree.
- [ ] **Step 4: Commit** — `refactor(editor): separate the shell from the commands it runs`.

### Task 4: Write the recipe, and prove it

**Files:** create `docs/adding-a-command.md`; add `edit:insert-rule` (a thematic break as its own paragraph) as the proof; modify `docs/architecture.md`, `docs/ai-context.md`, `test/README.md`

- [ ] **Step 1: Add the proof command** — `edit:insert-rule`, following the recipe as it will be written: one function in `editing/`, one `registerCommand` line, one keymap/documented trigger, one probe.
- [ ] **Step 2: Write the recipe** from what that took, with the exact files and a code sketch, ending in the commands that prove it.
- [ ] **Step 3: Update the maps** — `docs/architecture.md` (the commands layer and the "add a command" row), `docs/ai-context.md` (the command list), `test/README.md` (the new check).
- [ ] **Step 4: Verify** — `npx tsc --noEmit`, `npm run check` (12/12), `npm run probe:all` (fresh app), and the new probe by name.
- [ ] **Step 5: Commit** — `docs: write the recipe for adding a command, and add one by following it`.

## Notes for the implementer

- Do not move `editing/*` files in this phase. They are where behaviour lives; P2 is about how it is *reached*.
- When a probe opens a native menu it needs the window in front (`@needs-foreground-window`); `probe:all` skips those, so run them by name.
- A dev app left running for hours degrades and makes probes time out: restart `npm run tauri dev` before the acceptance run.

---

## Handoff (2026-09-22, after the first half of Task 2)

**Where the branch is.** `codex/editor-commands`, four commits ahead of `main`: the
plan, the registry and its check (`5fe1072`), and the menu bridge, the keymap and the
editor's registrations (`5e61114`). `npx tsc --noEmit` is clean and `npm run check`
is 11/12 — the one failure is `test/checks/commands.mjs`, whose output *is* the
to-do list: five producer modules still own a `*_COMMAND` constant.

**Done.** `commands/registry.ts` (ids as a union type, duplicate registration
refused, `runCommand` the only way in); `commands/menu.ts` (the one module that
names the native menu's event strings); `commands/keymap.ts` (chords → ids);
`markdown_editor.ts` registers the nine commands it owns, subscribes through the
menu table, and `handleShortcut` asks the keymap. `regression-undo` passes, so the
native-menu path is proven end to end.

**Next, in order.**

1. **Diagnose the footnote button before rewiring anything else.** `Toolbar.announce`
   emitted a Tauri event — an asynchronous round trip — while `runCommand` is a
   synchronous call inside the click handler. Rewiring `footnote_toolbar.ts` to
   `runCommand('edit:insertFootnote')` made `test/probes/footnote-button.js` report
   `definitions: 0`: the button stopped working, so that change was reverted and the
   tree is green. Cheap test of the hypothesis: run that probe on the current tree
   (it should pass), change *only* the footnote button, watch it fail, then try
   deferring the call (`queueMicrotask`) or re-focusing the editor before running it.
2. Rewire the remaining producers — `formatting_toolbar`, `list_toolbar`,
   `table_menu` — to `runCommand(...)`, delete their constants with their
   subscriptions, and register the ids they need (`format:<style>`, `list:<command>`,
   `table:<entry>`, `table:insert`). The check going green is the proof; the
   toolbar and table probes by name are the behaviour proof.
3. Task 3 (split the shell: `click_routing.ts`, the `editor_panel.ts` rename) and
   Task 4 (`docs/adding-a-command.md`, proven by adding `edit:insert-rule`).

**Rules that matter here.** Text entry is not a command: typing, `Enter`,
`Backspace`, `Tab` and the arrows stay in the editor's keydown handler. Triggering
code calls a command id; nothing outside `commands/registry.ts` names a command
event. Verify with `npm run check`, then the probes by name against a **freshly
started** app (`npm run tauri dev` — a long-running dev app degrades and makes every
probe time out), then `npm run probe:all`.
