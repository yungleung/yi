# Architecture

The editor turns a markdown document into a rendered page you can type in, with
the raw markdown kept as the only source of truth. This document is the map: the
layers, the invariants that hold them together, and where a change belongs.

## The model

- **Document** — the raw markdown string. Every edit is a range replacement in it.
- **Block** — a slice of consecutive lines the renderer treats as one unit
  (`frontmatter`, `fencedCode`, `displayMath`, `paragraph`, …), described by a line
  range and a character range. `src/ui/markdown/blocks.ts` splits the document.
- **Node component** — the DOM component for one mdast node inside a block
  (`src/ui/markdown/nodes/`), created through the registry
  (`registry.ts` + `create_node.ts`).
- **Viewport window** — only the blocks near the scroll position are mounted; the
  rest are two spacers sized from remembered heights
  (`virtual_block_renderer.ts`).
- **Source mode** — while the caret is inside something whose rendering holds none
  of the characters it was made from (a formula's KaTeX, a link's title, a
  citation's formatted reference), that *thing* is built as its own markdown
  instead: the shape an inline code span or fenced code block always has
  (`source_mode.ts`).

## Layers and import rules

| Layer | Files | May import |
| --- | --- | --- |
| Syntax (pure) | `blocks.ts`, `syntax/**` | other syntax modules, mdast types, the remark plugins |
| Document | `state.ts` | syntax |
| Render | `virtual_block_renderer.ts`, `block_sizes.ts`, `viewport_window.ts`, `create_block.ts`, `registry.ts`, `create_node.ts`, `nodes/*`, `source_mode.ts`, `format.ts`, `format_dom.ts`, `lazy.ts` | document, syntax |
| Caret and offsets | `caret/*` (`offsets.ts` in, `dom_position.ts` out) | render, document |
| Commands | `editing/*`, `commands/*`, `markdown_editor.ts`, `click_routing.ts` | everything above |

The rule that matters: **a syntax module never reaches into the DOM.** That is what
keeps the rules testable in Node, and it is the boundary most likely to be broken by
an innocent import. `test/checks/layering.mjs` enforces it.

### One fact, one home

| Fact | Home |
| --- | --- |
| Fences, frontmatter delimiters, html terminators, list markers, delimiter lines, block starts | `syntax/markers.ts` |
| Line spans, touched lines, item subtrees | `syntax/lines.ts` |
| Empty-paragraph lines | `syntax/blank_lines.ts` |
| Trailing-space rewriting | `syntax/trailing_spaces.ts` |
| Table source, table/list/code edits, `TextEdit` | `syntax/table_source.ts`, `syntax/table_edits.ts`, `syntax/list_edits.ts`, `syntax/code_edits.ts`, `syntax/edit_range.ts` |
| Parser repairs (empty items, footnote labels) and the remark pipeline | `syntax/empty_items.ts`, `syntax/footnotes.ts`, `syntax/parser.ts` |

`test/checks/syntax-home.mjs` fails if any of those facts is defined anywhere else.

## Invariants

1. **The document text is the only source of truth.** Every edit is a raw-text range
   replacement (`editing/context.ts: applyEdit`).
2. **A block's rendering is a pure function of its own source**, never of where it
   sits, so caches key on content rather than line numbers (`blocks.ts:
   blockContentKey`, `virtual_block_renderer.ts`).
3. **A caret's document offset is the truth.** A rendered position is derived from
   it and re-derived after any DOM rebuild (`caret/caret.ts`, `caret/offsets.ts`,
   `caret/dom_position.ts`).
4. **Source mode is decided from the document**, from the caret's offset, never by
   swapping an element behind the caret (`source_mode.ts`).
5. **One fact about markdown syntax has one home.**

## The four offsets

Almost every bug in this editor has been a confusion between these:

1. **document offset** — an index into the raw markdown. What `applyEdit` takes.
2. **block-relative offset** — a document offset minus `block.charStart`. What mdast
   positions inside a block are.
3. **rendered offset** — an index into an element's text, after markdown markers
   are hidden and widgets drawn.
4. **DOM range** — a live `Range` in the rendered tree. It may be anchored to a text
   node or to an element, and the browser *relocates* it — it does not drop it —
   when the node it points into is replaced. That is why a rebuild re-places the
   caret by offset (`editing/context.ts: showSourceAt`, `placeCaret`).

**What maps to what, and when.** Each flavour has one direction in and one out,
and none of them is stored: every mapping is re-derived from the one above it.

| Flavour | → document offset | document offset → | Re-derived when |
| --- | --- | --- | --- |
| document | it *is* the truth | — | never: the offset is recomputed from the caret on the next keystroke, and nothing holds one across a rebuild |
| block-relative | `caret/offsets.ts`: the block's `charStart` plus the node positions and `data-*-from` tags | `caret/offsets.ts: renderedOffsetAtRaw` (the block's `charStart` comes off) | on every edit: `charStart` moves, and so do the tags it is added to |
| rendered | `caret/offsets.ts: mapRenderedOffset` (through `textOffsetInElement`) | `caret/dom_position.ts: textNodeAtRenderedOffset` | after any DOM rebuild, because a block is rendered from its source again |
| DOM range | `caret/offsets.ts: documentOffsetAt` | `caret/caret.ts`: a fresh collapsed range, by `editing/context.ts: placeCaret` | after a rebuild, always: the browser *relocates* a range into the node that replaced its text, so a range that looks connected may sit where the author never put it |

`offsets.ts` is the way in (a rendered position read back into the document,
plus the rendered-length model both directions share); `dom_position.ts` is the
way out (a document offset turned into the text node and offset that hold it).

## One keystroke

1. `markdown_editor.ts` sees the key and calls a command (`editing/*`).
2. The command works out a document offset from the caret (`editing/context.ts:
   caretOffset`) and computes a raw-text edit — the rules are pure
   (`code_edits.ts`, `list_edits.ts`, `table_edits.ts`, `blank_lines.ts`).
3. `applyEdit` replaces the range, decides which source the caret now sits in
   (`showSourceAt`), re-renders the blocks whose content or shape changed
   (`virtual_block_renderer.ts: renderChanged`) and places the caret by offset.
4. Rendering rebuilds only the blocks whose content key or shape key changed; the
   rest keep their DOM, which is what keeps typing cheap in a long document.

## Where does this change go?

| Change | Where |
| --- | --- |
| How the document is split into blocks | `blocks.ts` |
| How one markdown construct looks | `nodes/<type>.ts` |
| What a markdown construct means for editing (a pure rule) | the matching `*_edits.ts` |
| A new keystroke or command | `docs/adding-a-command.md` — the id in `commands/registry.ts`, the work registered in `markdown_editor.ts` (`registerCommandEvents`), and the trigger |
| Where the caret goes, or how it maps | `caret/*` (`offsets.ts`, `dom_position.ts`) |
| When raw source is shown instead of a rendering | `source_mode.ts` |
| Spacing, laziness, virtualisation | `virtual_block_renderer.ts`, `styles.css` |

## Extension points

Every extension point is a named file — never "the renderer" — and each one is
reached in a way the next person can copy:

| Extension point | The file that owns it | Adding one |
| --- | --- | --- |
| A markdown construct's rendering | `nodes/<type>.ts`, registered in `create_node.ts` | `docs/adding-a-node.md` |
| Whether a node's markdown can stand in for its rendering | the `showsSource` flag in `registry.ts: registerComponent` | `docs/adding-a-node.md`, step 4 |
| Which source is shown, and where a click enters it | `source_mode.ts`, with `nodes/revealable_node.ts` | `docs/adding-a-node.md`, step 4 |
| A command the author can ask for | the id in `commands/registry.ts`, the work registered in `markdown_editor.ts: registerCommandEvents`, the trigger | `docs/adding-a-command.md` |
| How the document splits into blocks | `blocks.ts` | a task in the block model, plus `test/checks/check-blocks.mjs` |
| A pure rule about markdown | the matching `syntax/*.ts`, named in the one-fact-one-home table above | `docs/testing.md` — rule-shaped means `test/checks/` |
| What a block is worth in pixels | `block_sizes.ts` | a case in `test/checks/check-block-sizes.mjs` |
| Which blocks are mounted | `viewport_window.ts` | the same |

The registry (`registry.ts`) is the one place that says which node types exist, so
the renderer can stay a consumer of that table rather than a second list of what
markdown means. The recipes that use these points are `docs/adding-a-node.md` and
`docs/adding-a-command.md`.
