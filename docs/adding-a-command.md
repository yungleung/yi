# Adding a command

A command is something the author asks for by name — bold the selection, insert a
table, write a rule. One command has one name, one home and one way in, so the job
is always the same five steps. This recipe was written by adding `edit:insertRule`
(a thematic break on its own line) and following it.

## 1. Say where the work lives

The behaviour belongs in `src/ui/markdown/editing/<area>.ts`, as one function that
takes the editor context and calls `applyEdit` — one edit, so one undo. Read the
caret with `caretOffset(context)` and return `false` when there is none:

```ts
// src/ui/markdown/editing/thematic_break.ts
export function insertThematicBreak(context: EditorContext): boolean {
  const caret = caretOffset(context);
  if (caret === null) {
    return false;
  }
  applyEdit(context, caret, caret, thematicBreakInsertion(context.state.getText(), caret));
  return true;
}
```

**A command is a rule plus a call.** Anything that is a pure function of the text —
which offsets the edit covers, what it inserts, where the caret lands — belongs in
a syntax module (`src/ui/markdown/syntax/*.ts`) or beside the other rules for that
area (`editing/blank_lines.ts`), *not* inside the command. Then `test/checks` can
bundle it and assert it in Node. `thematicBreakInsertion` is the rule; the command
is three lines.

**A command need not be an edit.** `view:togglePage` (the A4-page/width switch) is the
editor's own view state, so its behaviour is a method on `markdown_editor.ts` beside the
scroller it changes — and there is no pure rule to bundle when the rule is one boolean. What
every command owes the rest of the app is the same either way: one id, one home, one way in.

## 2. Name it

Add the id to the union in `src/ui/markdown/commands/registry.ts`:

```ts
export type CommandId =
  | `format:${FormattingStyle}`
  …
  | 'edit:insertRule'
```

Ids are `namespace:name`, always in the same camelCase as the other ids
(`edit:insertFootnote`, `table:insertRowAbove`). The union is what makes a typo a
compile error instead of a command that silently does nothing, so add the id here
before you register anything.

## 3. Register it where the behaviour is

In `src/ui/markdown/markdown_editor.ts`, `registerCommandEvents` registers every
command the editor owns. A single command is one line:

```ts
registerCommand({ id: 'edit:insertRule', run: () => insertThematicBreak(this.context) });
```

A *family* of commands (one per style, per list command, per table operation) is a
loop over the list its module exports, so a trigger cannot name a command nobody
registered:

```ts
for (const style of FORMATTING_STYLES) {
  registerCommand({ id: `format:${style}`, run: () => applyFormatting(this.context, style) });
}
```

## 4. Give it a trigger

Three kinds, and a command may have several:

| Trigger | File | Shape |
| --- | --- | --- |
| A key chord | `src/ui/markdown/commands/keymap.ts` | `'shift+r': 'edit:insertRule'` |
| A toolbar button | `src/ui/toolbar/<toolbar>.ts` | the button's press handler calls `runCommand('…')` |
| A table menu item | `src/ui/table/table_menu.ts` | the item's action calls `runCommand('table:<entry>', target)` |
| The native app menu | `src/ui/markdown/commands/menu.ts` | the Rust menu emits an event; the table maps it to an id |

Triggering code calls `runCommand` and nothing else: no module outside
`commands/registry.ts` names a command event, and the check
`test/checks/commands.mjs` fails if one does. A chord the native menu already
claims arrives as a menu event instead (`menu.ts`); a chord it does not claim
(`Cmd+Shift+R`) is handled in the webview by `keymap.ts`.

## 5. Prove it

Two tests, one for the rule and one for the command:

```js
// test/checks/check-thematic-break.mjs — the rule, in Node
check('a paragraph line right above is separated, not underlined',
  applied('a\nb\n', 2), 'a\n\n---\n\nb\n');
```

```js
// test/probes/insert-rule.js — the command, in the app
t.scroller().dispatchEvent(new KeyboardEvent('keydown', {
  key: 'R', shiftKey: true, metaKey: true, bubbles: true, cancelable: true
}));
```

The probe drives the real trigger and asserts the raw document *and* what is
rendered. Write it before the command exists and watch it fail — with no
registration the chord does nothing, and the probe reports `rules: 0` and
`failed: [...]`.

Then run everything, from a freshly started app for the probe:

```bash
npx tsc --noEmit
npm run check
npm run tauri dev                                   # terminal 1
npm run probe -- test/probes/<your-probe>.js        # terminal 2
npm run probe:all
```

## Traps

- **The caret is a decision.** `applyEdit`'s default puts it after the inserted
  text; that is wrong when the insertion ends in a marker — the next keystroke
  joins the `---` line and takes the rule with it. Pass a target, and pass a
  function of the new state (`(state) => …`) when the answer depends on the blocks
  the edit just made. A blank line *between* two blocks is not a place a caret can
  be (`state.getBlocks()` has no block for it), so "the line below" is the next
  block's `charStart`, or the end of the text.
- **Text entry is not a command.** Typing, `Enter`, `Backspace`, `Tab` and the
  arrows stay in the editor's keydown handler and call `editing/*` directly.
- **Adding a syntax fact?** It needs one home — put it in
  `src/ui/markdown/syntax/markers.ts` and add its name to the facts list in
  `test/checks/syntax-home.mjs`, which fails if the fact is defined twice.
