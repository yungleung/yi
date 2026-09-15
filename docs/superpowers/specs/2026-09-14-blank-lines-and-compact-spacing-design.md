# Blank lines, empty paragraphs, and compact block spacing

## Problem

The editor slices the raw document into blocks by runs of non-blank lines, so a
blank line has no block, no DOM and no caret home:

- `Enter` at the end of a paragraph inserts `\n\n` at the caret; the source ends
  up with a three-blank-line run that renders identically to before, and typing
  then lands at the end of the *previous* paragraph.
- Clicking the 16px margin between two blocks hits `.prose`, and the
  document-level handler clears the caret — the margin is a dead zone.
- The spacing itself is generous for a reading view: a fixed `1rem` block margin
  plus the heading's own margins, e.g. 64px of white space between a paragraph
  and a following `h2`.

## Goal

Make it possible to start a new paragraph anywhere, in a model that still reads
as typeset prose rather than as a source view:

1. a blank line stays a *separator* (a compact margin, no rendered line);
2. blank lines the author deliberately adds beyond the separator become real,
   typable empty paragraphs;
3. `Enter` at the end of a paragraph puts the caret on a new line, and the first
   character typed there becomes its own paragraph.

## Non-goals

- No ghost/virtual line: every caret home is derived from the raw text, so the
  raw document stays the single source of truth (block slicing stays a pure
  function of the text).
- No line-faithful layout: the editor keeps collapsing a separator into a margin
  instead of rendering it as a line.
- Blank lines *inside* a block (fenced code, indented code, frontmatter) keep
  their current behaviour, except for the list rule in §2.3.

## 1. Model

Definitions, all derived from the raw text:

- **line**: characters between two newlines; the final newline of the file only
  terminates the last line and does not create one.
- **blank line**: a line that is empty or whitespace only.
- **block**: a slice of consecutive lines, as today (`splitBlocks`), including
  the new `blank` kind below.

A run of `n` newlines between two blocks contains `n - 1` blank lines. The first
blank line is the markdown separator; the rest are empty paragraphs:

| run (newlines) | rendered |
| --- | --- |
| `n = 2` (one blank line) | separator only — today's margin, no line |
| `n = 3` | separator + 1 empty paragraph line |
| `n = 4` | separator + 2 empty paragraph lines |

(Between two blocks `n` is always at least 2: a single newline leaves them one
block.)

Runs that are not between two blocks need no separator:

- leading run (`\n\n` at the very top): `n` empty paragraphs;
- trailing run (`a\n\n` at EOF): `n - 1` empty paragraphs, so a file ending in a
  single newline (`a\n`) has none.

An **empty paragraph** is a block of kind `blank`, spanning one blank line, with
`charStart === charEnd ===` the line's start offset. It renders as one body
line-height (24px) with a paragraph's margins, so the rhythm around it matches a
paragraph, and carries a placeholder element so the caret can be placed on it
(the same mechanism the list placeholder uses).

## 2. Rules

### 2.1 Enter

| caret | effect |
| --- | --- |
| caret at the block's end (`offset === block.charEnd`), nothing but separators after it | insert one `\n`; the run after the block grows by one, so a new empty paragraph appears; caret moves onto the first empty paragraph after the block |
| caret at the block's start (`offset === block.charStart`) | give the block one empty paragraph above by growing the run in front of it just enough: three newlines between two blocks (one when the separator is already there, two when the block follows another block directly, none when the paragraph is already there), one newline at the top of a file; the caret moves onto the empty line adjacent to the block |
| inside a block (mid-line, or at a line end that is not the block's end) | insert the newlines still missing from a paragraph break, counting the newlines on **both** sides of the caret: `2` in the middle of a line, `1` when a newline already sits before or after the caret, `0` when a whole break is already there; the caret lands after the break, before the text that follows |
| on an empty paragraph line | insert one `\n` at the caret: the line splits in two, caret stays on the first |
| on a blank list item's line | clear the item's marker (the line becomes blank) and add the second newline **only when a line of content follows**: a blank line already below the item is reused rather than added to, so the file gains nothing, and the item's own line becomes the empty paragraph. The list ends there (§2.3) and the caret lands on the empty paragraph that appears in the item's place |

`Enter` inside fenced code, display math or indented code still inserts a single
newline inside the block.

### 2.2 Typing on an empty paragraph

Insert the text at the line's start. When a block follows the empty paragraph,
the same edit also inserts the `\n` that keeps the next block separate
(`a` `␣` `␣` `b` + `x` → `a` `␣` `x` `␣` `b`), because markdown needs a blank
line on both sides of a paragraph. One keystroke stays one undo step, and the
layout does not shift: the line already occupied a line's height.

The inverse holds too: deleting the last character of a line that
materialisation created also removes the newline it added, so typing on an
empty line and deleting again leaves the document exactly as it was, instead
of leaving an extra blank line behind.

### 2.3 Block boundaries

A blank-line run that yields at least one empty paragraph is a block boundary,
including inside a loose list: a run with `n ≥ 3` between two list items ends the
list, so the empty paragraph becomes a block of its own between two lists. Runs
with `n = 2` (a normal loose list) keep merging as they do today.

### 2.4 Backspace and Delete

On an empty paragraph line both keys remove the line together with one adjacent
newline (the empty paragraph disappears, the blocks on either side join) and
leave the caret at the end of the previous line. This extends the rule already
implemented for blank list items.

### 2.5 Navigation and pointer

- Up/Down move between rendered lines, so an empty paragraph is a stop between
  two paragraphs; separators are not stops because they are not lines.
- Left/Right cross block boundaries as they do today.
- Clicking an empty paragraph places the caret on it.
- Clicking a separator margin places the caret at the nearest line edge (the top
  half of the margin → end of the previous block, the bottom half → start of the
  next) instead of clearing the caret. The distance is measured to the
  neighbouring *lines*, not to the block boxes: a block box contains its own
  margins, so adjacent boxes touch and their edges cannot be told apart.
- Clicking below the last line places the caret at the end of the document.

### 2.6 Mapping

Offsets stay block-relative, as today. The empty paragraph placeholder maps any
DOM position inside it to the line's start offset, like
`.markdown-list-placeholder`. Separator blank lines remain the only offsets
without a block; `nearestTextOffset` stays as the safety net for them.

## 3. Compact spacing

Typography becomes a set of tokens so the whole rhythm can be tuned in one pass,
measured before/after with the bridge. Current measurements (16px body, 24px
line-height, default demo document):

| element | now | proposed |
| --- | --- | --- |
| block separator margin | 16px (fixed, on top of inner margins) | removed; spacing comes from the content's own margins |
| paragraph skip | 8px | 8px |
| `h1` | 36px/40px, margin-bottom 32px | unchanged size, margin-bottom 12px |
| `h2` | 24px/32px, margin-top 48px, margin-bottom 24px | unchanged size, margin-top 24px, margin-bottom 8px |
| `ul`/`ol` | margin 20px, `li` 4px | margin 8px, `li` 2px |
| blockquote / table | margin ~25.6px / 28px | margin 12px |

Removing the generic block margin is what fixes the doubling: today a paragraph
followed by an `h2` is separated by `16 + 48 = 64px`. Note that margins inside
different blocks do not collapse, so two consecutive blocks add their adjacent
margins (`8 + 8 = 16px` for a paragraph followed by a list); the tokens above are
chosen with that in mind.

## 4. Touch points

- `blocks.ts`: `blank` block kind, run rules, list-boundary rule.
- `state.ts`: no parse for `blank` blocks; a helper for the first empty
  paragraph after an offset.
- `nodes/`: one component rendering an empty paragraph with its placeholder.
- `position.ts`: placeholder branch for the empty line (caret and offset
  mapping).
- `editing/text_commands.ts` + a new `editing/blank_lines.ts`: Enter rules,
  materialisation on typing, line removal for Backspace/Delete.
- `editing/context.ts`: pointer rules for margins and below the last line.
- `styles.css`: the spacing tokens and the empty-paragraph line height.
- `virtual_block_renderer.ts`: intrinsic size for `blank` blocks.

## 5. Verification

Every step is checked in the running app through the Tauri MCP bridge:

1. existing documents are unchanged where the corpus has only single blank-line
   runs (`The Human Condition.md`: 484 runs, all single; math document: 137);
2. `Enter` at the end of a paragraph: raw gains exactly one newline, the caret's
   rect sits one line below the paragraph, and typing produces a new paragraph
   without moving the geometry of the surrounding blocks;
3. the same for a middle paragraph, the last paragraph of the file, a heading,
   and every list kind;
4. Backspace/Delete on an empty paragraph, on the first and last line of the
   file, and with several empty paragraphs;
5. arrows, clicking an empty paragraph, clicking a margin, clicking below the
   last line, copy/paste and undo/redo across empty paragraphs;
6. measured gaps match the token table, and paragraph→heading spacing no longer
   doubles.

## 6. Open questions

- Whether a trailing empty line should always be rendered at EOF so the caret
  can be placed below the last paragraph by clicking; this spec says no, the line
  appears once `Enter` or typing asks for it.
- Whether typing on a *separator* line (reached by arrow or click) should
  materialise an empty paragraph first, or be prevented by keeping the caret out
  of separators. The spec keeps separators caret-free.
