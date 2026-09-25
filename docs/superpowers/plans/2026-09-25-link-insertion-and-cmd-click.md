# Link Insertion, and a Cmd-Click That Opens

**Goal:** the user's three asks —

1. a toolbar button, with the link icon they gave (the Font Awesome `link` glyph,
   `viewBox="0 0 640 512"`);
2. pressing it inserts a link at the caret: the caret lands **in the title part** for
   typing, and the **URL is filled from the clipboard** when the clipboard holds one;
3. **⌘-click on a link opens it in the default browser**.

**Spec:** the user's message; the branch is `codex/link-insert-and-cmd-click` and the
user reviews before any merge.

## Part 1 — where each piece goes

The house rules decide most of it: a command has one name, one home and one way in
(`docs/adding-a-command.md`), and a pure rule is testable in Node.

| Piece | Home |
| --- | --- |
| What a link is written as — the brackets, the destination, the escaping, where the caret lands | `syntax/link_edits.ts` (pure: `linkInsertion`, plus the two destination rules below) |
| Which clipboard text may become a destination, and which href the app may open | the same module: `clipboardDestination` (a single-token `http:`/`https:`/`mailto:` URL) and `isOpenableUrl` (`^https?:`). The preview card's own inline `^https?:` test moves here, so the app has one rule for "a link it may open" |
| The command: read the clipboard, build the edit, place the caret | `editing/links.ts` — `insertLink(context)`, the shape `editing/thematic_break.ts` uses |
| The name | `edit:insertLink` in `commands/registry.ts` |
| The button | `src/ui/toolbar/link_toolbar.ts`, a group of its own (the formatting group maps one-to-one onto `FormattingStyle`, and a link is not a style), added to the title bar after the formatting group |
| The ⌘-click | `click_routing.ts: routeLinkClick` — the module already holds "a click that means something else" (the footnote's ⌘-click is next door), wired in `markdown_editor.ts` beside the other routed clicks |

## Part 2 — the behaviour, decided

- **No selection:** insert `[](url)` and put the caret between the brackets, so the
  next keystroke writes the title. The link is shown as its own source while the
  caret is inside it (that is what `nodes/link.ts` already does), so the author sees
  the brackets they are typing into.
- **A selection:** the selected text becomes the title — the button then means "make
  this into a link", which is what the other toolbar buttons mean for a selection —
  and the caret lands at the *end of the title*, still in the title part, so typing
  appends to it. **Flagged for review**: the user's message only describes the caret
  case.
- **The URL**: trimmed from the clipboard, and used only when it is a single token
  with an `http:`, `https:` or `mailto:` scheme. Otherwise the destination is empty
  (`[]()`), which is valid markdown and is what the author fills in next.
- **The clipboard read**: `navigator.clipboard.readText()` — the same API
  `editing/clipboard.ts` already writes with — read inside the button's click, so the
  webview sees the user gesture it requires. A refusal (no permission, an empty
  clipboard, no API at all) is not an error: the link is inserted with an empty
  destination. This is the one seam a probe cannot exercise (a synthetic click is not
  a user gesture), so the probe *stands in* for the clipboard the way
  `footnote-preview.js` stands in for the app's opener, and says so.
- **⌘-click**: on a link whose href the app may open, the URL goes to the default
  browser through the app's opener (`@tauri-apps/plugin-opener`, the same call the
  preview card makes for a link in a note) and the click does **not** open the source.
  A plain click is unchanged — it still opens the source for editing. A link with
  nothing openable (a relative path, an empty href) falls through to the plain click,
  so the source still opens.

## Part 3 — tasks

- [ ] Task 1: `syntax/link_edits.ts` with `linkInsertion`, `clipboardDestination` and
      `isOpenableUrl`, and `test/checks/check-link-edits.mjs` — including what the
      parser reads back (a URL with parentheses, an escaped title, an empty title).
- [ ] Task 2: `editing/links.ts` (`insertLink`), the id in `commands/registry.ts`, the
      registration in `markdown_editor.ts`.
- [ ] Task 3: `link_toolbar.ts` with the user's icon, and its place in `main.ts`.
- [ ] Task 4: `test/probes/insert-link.js` — press the button (with the clipboard
      stood in for): the document, the caret in the title part, typing the title, and
      the selection case.
- [ ] Task 5: `routeLinkClick` in `click_routing.ts` (+ the preview card's rule moving
      to `isOpenableUrl`), and `test/probes/link-cmd-click.js` — the opener called with
      the URL, the webview not navigating, the source not revealed, and a plain click
      still revealing it.
- [ ] Task 6: acceptance and docs — `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/architecture.md`,
      `docs/adding-a-command.md` if the recipe needs it, `test/README.md`,
      `docs/roadmap.md`. **No merge**: the user reviews first.

## Handoff

To be written when the work is ready for review.
