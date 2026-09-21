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
| Syntax (pure) | `blocks.ts`, `list_lines.ts`, `blank_lines.ts`, `trailing_spaces.ts`, `table_source.ts`, `code_edits.ts`, `list_edits.ts`, `table_edits.ts`, `parser.ts` | other syntax modules, mdast types |
| Document | `state.ts` | syntax |
| Render | `virtual_block_renderer.ts`, `create_block.ts`, `registry.ts`, `create_node.ts`, `nodes/*`, `source_mode.ts`, `format.ts`, `format_dom.ts`, `lazy.ts` | document, syntax |
| Caret and offsets | `caret/*`, `position.ts` | render, document |
| Commands | `editing/*`, `markdown_editor.ts` | everything above |

The rule that matters: **a syntax module never reaches into the DOM.** That is what
keeps the rules testable in Node, and it is the boundary most likely to be broken by
an innocent import.

## Invariants

1. **The document text is the only source of truth.** Every edit is a raw-text range
   replacement (`editing/context.ts: applyEdit`).
2. **A block's rendering is a pure function of its own source**, never of where it
   sits, so caches key on content rather than line numbers (`blocks.ts:
   blockContentKey`, `virtual_block_renderer.ts`).
3. **A caret's document offset is the truth.** A rendered position is derived from
   it and re-derived after any DOM rebuild (`caret/caret.ts`, `position.ts`).
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

`position.ts: documentOffsetAt` maps 1–4 to 1; `domPositionAtOffset` maps 1 to 4.

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
| A new keystroke or command | `markdown_editor.ts` (`handleKeydown`, `registerCommandEvents`) |
| Where the caret goes, or how it maps | `caret/*`, `position.ts` |
| When raw source is shown instead of a rendering | `source_mode.ts` |
| Spacing, laziness, virtualisation | `virtual_block_renderer.ts`, `styles.css` |

## Extension points

- `registry.ts: registerComponent(type, factory, showsSource)` — `showsSource` marks
  a node type whose markdown can stand in for its rendering.
- `nodes/revealable_node.ts: sourceViewFor(...)` — builds that source view.
- `source_mode.ts` — which source is shown, and where a click enters it.

The recipe that uses them is `docs/adding-a-node.md`.
