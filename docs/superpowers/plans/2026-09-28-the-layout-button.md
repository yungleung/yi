# The Layout Button

**Goal:** the user's ask — *"add a button at the right of the taskbar to switch the layout of
the editor between the original (auto) and the A4."*

**Spec:** the user's message, the agreed design, and the two icons they sent (a sheet for the
page, a frame for the full-width column). The branch is `codex/layout-button` and the user
reviews before any merge.

## What the two layouts are

- **`page`** — what the editor has been since the A4 work: a 210 mm sheet with a 25 mm margin,
  a desk under it, and the sheet, its type and its whole rhythm scaled to fit the pane.
- **`auto`** — what it was before: the column at the width of the pane, no sheet, no desk, and
  every measurement at 1 (the 16 px type over 24 px lines it always had).

They are one attribute on the scroller — `data-layout` — and `styles.css` scopes the sheet,
the desk and the scale to `[data-layout='page']`. `fitPage` reads the same attribute: in
`auto` the scale is 1 whatever the pane is.

## The five pieces

1. **The state** is the editor's: `markdown_editor.ts: setLayout` writes the attribute, re-fits
   the page, and says which way it went (`EDITOR_LAYOUT_CHANGED`).
2. **The command** is `view:togglePage`, added the way `docs/adding-a-command.md` says: the id
   in the registry's union, one line in `editor_commands.ts`, the flip on the editor that owns
   the scroller. (The recipe's step 1 sends an edit's rule to `editing/`; a view command's
   behaviour is the editor's own, and the recipe now says so.)
3. **The button** is `src/ui/toolbar/layout_toolbar.ts`, at the right of the status bar (the
   first version put it in the titlebar's right group; the second round moved it, see below).
   It draws the layout the editor is in (the user's two icons), names what pressing it will do
   (`Full width` while on a page, `A4 page` while full width) and carries `aria-pressed`. It
   reaches the editor only by naming the command and by hearing the event.
4. **The memory** is the app config: `editor_layout` in `settings.rs` (a string with a serde
   default of `page`, so an existing config still loads), `AppConfig` in `src/api/settings.ts`,
   and the wiring in `main.ts` — the saved layout is applied after the config loads and every
   change is saved through `configManager`.
5. **The tests**: `test/probes/page-layout-toggle.js` drives the real button and measures both
   layouts; `test/checks/check-tag-offsets.mjs` gains `data-layout` as an exempt tag (it is a
   flag, not a document offset); and `test/probes/lib.js` gains `t.layout()` / `t.useLayout()`
   so a probe that measures one layout asks for it rather than inheriting the reader's choice.

## Second round, on the user's review

Two changes, on the user's say-so: the button moves from the titlebar to the **status bar**
(the bar under the document, where the word count sits) — they meant that bar by "task bar" —
and it draws the two larger glyphs they sent (a 32×32 sheet, a 24×24 frame) instead of the
20×20 pair it started with.

The status bar was **17px** tall on its own: a 12px word count and a hairline. `btn-xs` is
24px, which would have taken the bar to 25px — nearly the titlebar's 30 — so the button is
sized to 20px (`h-5 min-h-5 px-1`) with a 16px box for the glyph, and the bar is **21px**
now. That is the "a little high, but not that much" the user allowed; the two numbers to
move are `STATUS_BUTTON` in `layout_toolbar.ts` (the button) and its `text-[1em]` (the icon).
`page-layout-toggle.js` now asserts where the button lives (not in `.titlebar`) and that the
bar it sits in stays at or under 24px, alongside the icon shapes and the two layouts.

## Handoff

*(written when the work lands)*
