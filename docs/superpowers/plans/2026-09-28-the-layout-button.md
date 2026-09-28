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
3. **The button** is `src/ui/toolbar/layout_toolbar.ts`, in the titlebar's right group beside
   the `⋯` menu. It draws the layout the editor is in (the user's two icons), names what
   pressing it will do (`Full width` while on a page, `A4 page` while full width) and carries
   `aria-pressed`. It reaches the editor only by naming the command and by hearing the event.
4. **The memory** is the app config: `editor_layout` in `settings.rs` (a string with a serde
   default of `page`, so an existing config still loads), `AppConfig` in `src/api/settings.ts`,
   and the wiring in `main.ts` — the saved layout is applied after the config loads and every
   change is saved through `configManager`.
5. **The tests**: `test/probes/page-layout-toggle.js` drives the real button and measures both
   layouts; `test/checks/check-tag-offsets.mjs` gains `data-layout` as an exempt tag (it is a
   flag, not a document offset); and `test/probes/lib.js` gains `t.layout()` / `t.useLayout()`
   so a probe that measures one layout asks for it rather than inheriting the reader's choice.

## Handoff

*(written when the work lands)*
