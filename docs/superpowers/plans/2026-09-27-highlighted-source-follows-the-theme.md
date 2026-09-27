# Highlighted Source Follows the Theme

**Goal:** the user's ask — *"highlight the frontmatter like a fenced code, but it should
have a light background which can change with the theme"*, then, on the design, *"we can
also make fenced code and latex source mode auto change their theme."*

**Spec:** the user's two messages; the branch is `codex/highlighted-source-theme` and the
user reviews before any merge.

## Why one change and not three

The app colours every kind of highlighted source with `highlight.js`'s
**tokyo-night-dark** stylesheet, imported once in `src/styles.css`. Those tokens are drawn
for one dark background, and the box they sit in is daisyUI's `neutral` — dark in every
theme. Measured against the theme's own light surface (`base-200`, `rgb(242,247,254)` in
winter):

| token | on today's dark box | on a light `base-200` |
| --- | --- | --- |
| `#bb9af7` keyword/attr | 7.91:1 | 2.15:1 |
| `#9ece6a` string | 10.02:1 | 1.70:1 |
| `#ff9e64` number | 9.00:1 | 1.89:1 |
| `#e0af68` built-in | 9.16:1 | 1.86:1 |
| `#a9b1d6` base text | 8.67:1 | 1.96:1 |

So a fixed palette cannot serve both themes: whichever background the theme picks, half of
the tokens fall to roughly 2:1. The revealed inline formula source — which sits on the
page rather than in a box — is already being drawn at those ratios, because winter is the
default theme.

## What this does

1. **One palette, one home.** `@import "highlight.js/styles/tokyo-night-dark.css"` goes,
   and `src/styles.css` defines the app's own highlighted-source palette: plain text and
   punctuation `base-content`; comments `base-content` over `base-200`; and keys,
   strings, numbers and deletions each a daisyUI semantic colour mixed 25% into
   `base-content`. Every colour is a theme token or a mix of one, so the palette follows
   `data-theme` with no `dark:` variant and no second stylesheet.
2. **One surface.** `.prose pre` — the fenced code block, the frontmatter and the
   display-formula source, which are all `pre` in the prose — takes
   `background-color: var(--color-base-200)` in place of the theme's `neutral`. The
   revealed inline sources (link, image, citation, wikilink, math, break, thematic break)
   take the same surface at inline scale.
3. **The frontmatter is rendered through the highlighter** — a new module,
   `nodes/frontmatter_highlight.ts`, built on `hljs.highlight(node.text, { language:
   node.format })`, with `latex_highlight.ts`'s invariant in its header: markup must not
   change the text, because the caret is placed by character offset over the block's own
   characters.

## Tasks

- [ ] Task 1: the pure rule and its check — `frontmatter_highlight.ts` and
      `test/checks/check-source-highlight.mjs` (the markup's text equals the source, for
      yaml, toml, and characters HTML would otherwise eat).
- [ ] Task 2: the rendering — `create_block.ts: renderFrontmatter` builds a `pre` holding
      a `code.language-<format>`, so the block gets the code block's own box.
- [ ] Task 3: the palette and the surface in `src/styles.css`, with the fixed stylesheet
      import dropped.
- [ ] Task 4: the probe — `test/probes/source-theme.js`: the tokens, the text unchanged,
      the caret still landing where it is clicked in the frontmatter, the surface equal to
      `base-200`, and every token's colour *changing* between `winter` and `dim` with
      every contrast ratio at or over 4.5:1 in both.
- [ ] Task 5: acceptance and docs — `npx tsc --noEmit`, `npm run check`,
      `npm run probe:all`, `docs/architecture.md`, `docs/roadmap.md`, `test/README.md`.

## Handoff

*(written when the work lands)*
