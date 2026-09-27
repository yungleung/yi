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
   punctuation `base-content`; comments `base-content` over `base-200`; and keys, strings,
   numbers and deletions each a daisyUI hue mixed **65%** into `base-content`. Every colour
   is a theme token or a mix of one, so the palette follows `data-theme` with no `dark:`
   variant and no second stylesheet.
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

- [x] Task 1: the pure rule and its check — `frontmatter_highlight.ts` and
      `test/checks/check-source-highlight.mjs` (the markup's text equals the source, for
      yaml, toml, and characters HTML would otherwise eat).
- [x] Task 2: the rendering — `create_block.ts: renderFrontmatter` builds a `pre` holding
      a `code.language-<format>`, so the block gets the code block's own box.
- [x] Task 3: the palette and the surface in `src/styles.css`, with the fixed stylesheet
      import dropped.
- [x] Task 4: the probes — `test/probes/source-theme.js` (the tokens, the text unchanged,
      the surface equal to `base-200` and the box the code block's own, every token's
      colour *changing* between `winter` and `dim`, every contrast ratio at or over its
      floor, and every token at least 0.05 in oklab from the plain text) and
      `test/probes/source-highlight-caret.js` (typing after a click in the frontmatter, on
      a line inside it, and at a character in the middle of a highlighted code block).
- [x] Task 5: acceptance and docs — `npx tsc --noEmit`, `npm run check`,
      `npm run probe:all`, `docs/architecture.md`, `docs/roadmap.md`, `test/README.md`.

## Handoff

**Waiting on the user's review — nothing is merged.** `codex/highlighted-source-theme`
holds this plan and the change.

**What changed.** The fixed stylesheet is gone; `src/styles.css` has the palette
(`--md-source-*`), the `.prose pre` surface (`base-200` in place of daisyUI's typography
mapping to `neutral`), the token rules keyed on highlight.js's own `hljs-*` classes, and the
faint `base-200` the revealed inline sources now wear. The frontmatter is highlighted
through `nodes/frontmatter_highlight.ts` and rendered as a `pre` in
`create_block.ts: renderFrontmatter`, so it takes the code block's box (padding, radius,
monospace, margins) from the prose rather than a rule of its own. Nothing else in the
renderers changed: the code fence and the LaTeX highlighter only supply markup.

**The user caught the first palette, and they were right.** It mixed a quarter of each hue
into `base-content`; in the dark theme every one of its hues is light, so every token landed
at 80–85% lightness with almost no chroma — pale greys two hundredths from the plain text
they sat beside. The palette is now two thirds hue, which is what makes the hue most of the
colours: winter gets blue keys, indigo strings and magenta numbers on white; dim gets green,
salmon and violet on slate. Measured separations run 0.076–0.17 in oklab, and the probe now
holds 0.05 so this cannot come back.

**The hues are `primary`, `secondary` and `accent` for a reason.** They are the theme's dark
colours in winter and light ones in dim. `success`, `info` and `warning` are *surface*
colours in a light theme — `success` measures 2.7:1 as text on winter's `base-200` — so they
cannot carry text at all, whatever they are mixed with. The one exception is a diff's
deletion marker, which keeps the theme's `error` red at the 3:1 a graphic is held to; a
legible red does not exist in the light theme, and the alternative was a grey that passed the
number and meant nothing.

**Acceptance.** `npx tsc --noEmit` clean; `npm run check` **27/27** (the new
`check-source-highlight.mjs` included); a fresh `npm run tauri dev`; `source-theme` **38
checks**, `source-highlight-caret` **3 checks**, and `npm run probe:all` **91/92 (15
skipped)** — the one failure is `insert-rule.js`, the caret case already under *Open*.
Measured live in both themes: surfaces `#f2f7fe` (winter) and `#242933` (dim), tokens at
4.90–9.53:1 with the deletion marker the single 3.47:1, and every token's colour different
between the themes.

**What only a person can check.** I cannot see images in this session, so the *look* is
verified by measurement — surfaces, contrast, separation, box geometry — and not by eye.
The numbers say the tokens stand apart from each other and from the plain text in both
themes; whether the hues please is yours to judge, and the four mix percentages are one line
each if you want them moved.
