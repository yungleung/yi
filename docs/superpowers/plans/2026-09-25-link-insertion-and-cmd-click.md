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

- [x] Task 1: `syntax/link_edits.ts` with `linkInsertion`, `clipboardDestination` and
      `isOpenableUrl`, and `test/checks/check-link-edits.mjs` — including what the
      parser reads back (a URL with parentheses, an escaped title, an empty title).
- [x] Task 2: `editing/links.ts` (`insertLink`), the id in `commands/registry.ts`, the
      registration in `markdown_editor.ts`.
- [x] Task 3: `link_toolbar.ts` with the user's icon, and its place in `main.ts`.
- [x] Task 4: `test/probes/insert-link.js` — press the button (with the clipboard
      stood in for): the document, the caret in the title part, typing the title, and
      the selection case.
- [x] Task 5: `routeLinkClick` in `click_routing.ts` (+ the preview card's rule moving
      to `isOpenableUrl`), and `test/probes/link-cmd-click.js` — the opener called with
      the URL, the webview not navigating, the source not revealed, and a plain click
      still revealing it.
- [x] Task 6: acceptance and docs — `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/architecture.md`,
      `docs/adding-a-command.md` if the recipe needs it, `test/README.md`,
      `docs/roadmap.md`. **No merge**: the user reviews first.

## Handoff

**Waiting on the user's review — nothing is merged.** `codex/link-insert-and-cmd-click`
holds four commits after this plan: the link rule and the command with the button, the
⌘-click routing, the harness fix below, and these docs.

**What was built.** `syntax/link_edits.ts` is the pure home: what a link is written as
(`[title](destination)`, with `<…>` when markdown cannot read the destination plainly and
escapes in the title), the caret's place at the end of the title, the clipboard rule (one
token with an `http:`/`https:`/`mailto:` scheme) and `isOpenableUrl` (`^https?:`, which the
preview card's link handler now uses instead of its own copy). `editing/links.ts:
insertLink` reads the clipboard first and then the selection, so a slow or refused
clipboard cannot leave the insertion at a moved offset, and one `applyEdit` writes the
link with the caret inside the brackets. The button is the user's icon in
`src/ui/toolbar/link_toolbar.ts`, a group of its own after the formatting styles, running
`edit:insertLink`. `click_routing.ts: routeLinkClick` opens the href on ⌘/Ctrl-click
through `@tauri-apps/plugin-opener` (the same call the preview card makes), skips a
footnote marker's `<a>` (its gesture is the jump) and falls through to the plain click for
hrefs the app may not open.

**Two things to look at in review.** (1) A *selection* becomes the title and the caret
lands at its end — the user's message only described the caret case, and this is the
choice a toolbar button would suggest; (2) when the clipboard holds nothing usable the
caret still lands in the *title* part, as asked, which means the author then has to click
into the destination to write it. Both are one-line changes if the user prefers otherwise.

**The harness hole this uncovered.** A probe's own verdict was never read: the harness
exited 0 whenever the probe *ran*, so `npm run probe:all` counted every probe that ran as
passed. It reads `{ checks, failed }` now (`test/tauri-probe.mjs: failedChecks`), and the
suite immediately reported two probes that had been failing quietly — `format-buttons.js`
(which changes the raw text and leaves the rendering stale, logging `Error: this block is
not in the index`) and `insert-rule.js`'s `atTheEnd` (the caret goes to the top of the
document instead of under the rule). Both were checked at `d4a26cf`, before either of the
two phases that came before this one, so they are not mine: they are recorded in
`docs/roadmap.md` under *Open* with what was measured, and they are why the suite now
reads **87/89 (8 skipped)** rather than 89/89.

**Second round, on the user's review.** Two changes. (1) The button draws the *other*
link icon the user sent — the 16×16 one, `width="1em" height="1em"`, a transparent box
and a `<g fill="currentColor">` of two glyph paths — and `insert-link.js` checks that
shape (the viewBox, both glyph path prefixes and the group's fill), so an icon cannot be
swapped by accident. (2) The clipboard is now read by the **app**: clicking the button in
the webview made WebKit show its own paste confirmation ("a paste button"), which is not
what the author asked for on a click that only meant "fill the URL in". `src-tauri/src/
clipboard.rs` reads AppKit's general pasteboard (`NSPasteboard::generalPasteboard` →
`stringForType`, macOS only; other platforms answer `None`), exposed as the app command
`read_clipboard_text` and wrapped in `src/api/clipboard.ts`; `editing/links.ts` asks the
app first and keeps `navigator.clipboard.readText` as the fallback for a platform without
a native read. The dependency is already in the tree through tauri's own runtime
(`objc2-app-kit` 0.3, no new crates), and the command was measured live in the app before
the probes were written to stand in for it: the app's call answers a 200 with the JSON
value, and `read_clipboard_text` returned the clipboard's text (the probe reports the
*shape* of that answer, never its content). `insert-link-clipboard.js` now covers the
three ways the read can come back — text that is not a URL, a backend without the command
(the webview's API answers), and both refusing — and all pass.

**Acceptance.** `npx tsc --noEmit` clean, `npm run check` **24/24**, a freshly started
`npm run tauri dev`, `npm run probe:all` **87/89 (8 skipped)** with the two long-standing
failures above, and by hand against that fresh app: `insert-link`, `link-cmd-click`
(both also fail without their change — checked), `format-buttons`, `footnote-preview`,
`boundary-caret`, `revealed-source-exit`, `revealable-flows`. `insert-link` reports the
platform's own clipboard API as present (`typeof navigator.clipboard.readText` is
`function`); the one seam no probe can exercise is the *gesture* that API wants, so the
user's own click is what proves the clipboard end to end.
