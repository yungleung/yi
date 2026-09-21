# Display math with a code block's mechanism

## Why

A fenced code block renders **its own text**. No second representation exists,
so the caret maps 1:1 through text nodes, an edit is an ordinary text edit, the
block re-renders, and the caret comes back exactly where it was. Nothing is
recorded, shifted, clamped or resumed.

Display math renders **KaTeX**, and reaches its source through a *revealable*:
the node swaps its element for a span that carries `data-source-from`, a content
range excluding `$$`, a click mapping by vertical ratio, and a shared
"is this node being edited" record. Every bug reported in this area traces to one
of those pieces:

| symptom | piece |
| --- | --- |
| click lands mid-formula or at a line end | ratio click mapping |
| caret jumps when deleting at the end | content range clamp |
| blank line and fence-side caret, stray `$` | `$$` excluded from the content range |
| characters that are not in the document | rewriting the source into the span |
| "it does not re-render" / stays in source mode | shared editing-range record and its ghosts |

## Design

**Source mode is a block rendering, not a node's swap.**

A `displayMath` block renders one of two things:

- **its own raw text** while the caret is inside the block — the same shape a
  code block has: the block's element holds text nodes, each tagged with its
  block-relative raw start, and the caret, selection, Tab/Shift+Tab and offset
  mapping all take the existing text path;
- **KaTeX** while the caret is elsewhere.

The switch is one condition — *is the caret inside this block's element* — which
a code block satisfies trivially. Because the condition is re-evaluated whenever
the caret moves (the same place the reveal watcher runs today), no state has to
be recorded between renders: there is no editing range to shift through an edit,
no source tag to carry, no content range to clamp against, and no ratio to map a
click through.

## Work

1. **`blocks.ts` / `create_block.ts`** — for `displayMath`, produce the block's
   text view when the caret is inside it, and the parsed view otherwise. The
   text view is the same helper the code block uses for its text (tags and
   line structure included), so there is one implementation of "this block is
   text right now".
2. **`nodes/math.ts`** — `DisplayMath` stops being a revealable. It renders
   KaTeX and nothing else; `sourceContentRange`, `sourceOffsetForClick` and its
   `sourceLineOffsetAt` ratio mapping are deleted.
3. **`position.ts`** — the revealed-source branch applies to *revealables*
   (link, citation, wikilink, image, break, thematic break, inline math), not to
   display math, which is now plain block text like code.
4. **`editing/table.ts`-style guard for keys** — Tab/Shift+Tab and the fence
   protection already work on `displayMath`; keep them, and check that the
   caret can sit on a fence line exactly as it can in code.
5. **Cleanup** — remove what the change orphans: the math entries in the
   revealable registry, the editing-range machinery if nothing else uses it
   (inline math still does), and any now-unused helpers.

## Edge cases to settle while implementing

- **Entering source mode by click.** A click on KaTeX cannot name a character.
  Keep the rule already chosen: entering puts the caret at the **end of the last
  content line**, and the next click lands on the text, where the mapping is
  exact.
- **Leaving.** The caret moving outside the block renders KaTeX again. The block
  must be rebuilt from the document (its parse is current, since the block is
  re-rendered on every edit like code).
- **Empty formula** (`$$\n$$`) and a formula that is the whole document.
- **A caret on a fence line** must be legal, as it is in code — typing there is
  the author's business, with the same consequence code has.

## Acceptance tests

All on the default document, through the Tauri MCP bridge, after a fresh reload:

1. click the display formula, type `X` → the character lands on the content's
   last line; the closing fence stays its own line; the block survives;
2. click, press Enter at the end of the last content line → a blank line inside
   the formula, the block whole, the caret on the new line; type → the text goes
   there, fences untouched;
3. click the blank line, clean it up → the `$$` stay put; no stray `$`;
4. click away → the block renders KaTeX again, caret sound, nothing missing;
5. the four flows confirmed before this change stay green: wikilink delete,
   `$\int_a^b x^2 \, dx$` delete at the end, display-math typing, delete+undo;
6. arrow keys around and through the block do not throw (`IndexSizeError`), and
   `check-code-edits.mjs`, `check-table-*.mjs`, `check-footnotes.mjs`,
   `check-list-edits.mjs` and `npx tsc --noEmit` all pass.
