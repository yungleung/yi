# Markdown editor clean-up, P3 (caret and offsets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `position.ts` is 624 lines and holds both directions of the offset mapping
plus the arithmetic they share, so a change to how a link's source maps to the
document and a change to where the caret lands in a table read as one file. P3 splits
it into the two directions it actually has, writes down what each maps to, and
documents the caret's module state.

**Architecture:** `caret/offsets.ts` owns the model — how a rendered position lines up
with raw text — and the way in from the DOM (`documentOffsetAt`, `caretLocation`).
`caret/dom_position.ts` owns the way out (`domPositionAtOffset`) and imports the model
from `offsets.ts`. Both are pure mappings over the state and the rendered tree; neither
holds state of its own. `position.ts` disappears.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** `docs/superpowers/specs/2026-09-21-markdown-editor-architecture-design.md`
(section 4 model, section 5 layout, section 8 P3)

## Global Constraints

- **Behaviour is preserved.** This phase moves code and writes prose. The caret, the
  offsets and source mode are where the bugs live: read section 4 of the spec and
  `docs/architecture.md`'s "The four offsets" before touching anything here.
- **The document offset is the truth.** A rendered position is derived from it and
  re-derived after any rebuild; nothing in this phase may introduce a second source of
  caret truth.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` keeps its
  count (59/59 passing, 6 skipped) from a freshly started app.
- Commit style: `refactor(caret): …`, `docs: …`.
- A module header says what the file is for, what it may import, and the invariant it
  upholds (spec section 7).

## What is where today

`src/ui/markdown/position.ts`, in the order it is written:

| Part | Terms | Goes to |
| --- | --- | --- |
| `documentOffsetAt`, `caretLocation`, `sourceTextOffset` | DOM position → document offset | `caret/offsets.ts` (public) |
| `RENDERED_LENGTH` helpers: `renderedLength`, `nodeRawRange`, `rawStartOf`, `hasHiddenMarkers`, `mapRenderedOffset`, `mapNode`, `SOURCE_SELECTOR`, `textOffsetInElement`, `closestBlockElement` | the arithmetic both directions share | `caret/offsets.ts` (shared: `SOURCE_SELECTOR`, `renderedLength`, `nodeRawRange` are imported by the other file) |
| `domPositionAtOffset`, `sourceTextPosition`, `DomPosition` | document offset → DOM position | `caret/dom_position.ts` (public) |
| `renderedOffsetAtRaw`, `mapNodeRawToRendered`, `textNodeAtRenderedOffset` | the arithmetic the way out needs | `caret/dom_position.ts` (private) |

Importers of `position.ts` today — five, and only these:

```
src/ui/markdown/markdown_editor.ts      documentOffsetAt
src/ui/markdown/editing/context.ts      documentOffsetAt, domPositionAtOffset
src/ui/markdown/editing/formatting.ts   documentOffsetAt, domPositionAtOffset
src/ui/markdown/editing/find_controller.ts  domPositionAtOffset
src/ui/markdown/editing/table.ts        caretLocation
```

---

## Tasks

### Task 1: The way in — `caret/offsets.ts`

**Files:**
- Create: `src/ui/markdown/caret/offsets.ts`
- Modify: `src/ui/markdown/position.ts` (keeps the way out for now)
- Modify: `src/ui/markdown/markdown_editor.ts:21`, `src/ui/markdown/editing/context.ts:15`, `src/ui/markdown/editing/formatting.ts:11`, `src/ui/markdown/editing/table.ts:12`

**Interfaces:**

- Produces: `CaretLocation` (`{ block: MarkdownBlock; offset: number; blockOffset: number }`),
  `caretLocation(state: MarkdownEditorState): CaretLocation | null`,
  `documentOffsetAt(state: MarkdownEditorState, container: Node, positionOffset: number): CaretLocation | null`,
  `sourceTextOffset(source: HTMLElement, container: Node, offset: number): number | null`,
  and the shared model `SOURCE_SELECTOR: string`, `renderedLength(node: RootContent): number`,
  `nodeRawRange(node: RootContent, block: MarkdownBlock): { start: number; end: number } | null`.
- Consumes: `state.getBlocks()`, `state.getBlockAtLine(lineStart)`, `state.getBlockContent(block)`,
  the `data-text-from` / `data-source-from` / `data-table-cell` tags, and `getCaretRange()`.

- [ ] **Step 1: Write the module**

Move the code, do not rewrite it. The header is the three-line shape:

```ts
/**
 * Where a DOM position sits in the raw document: the caret, a selection
 * boundary, and the arithmetic both offset directions share.
 *
 * May import: the caret's range, the state and its blocks, the table's raw
 * source, the bibliography's cached citation text. Upholds: a rendered position
 * is derived from a document offset and re-derived after any rebuild — the
 * offset is the truth, and this is the half that reads a rendered position back
 * into one.
 */
```

`caretLocation`, `documentOffsetAt`, `sourceTextOffset`, `closestBlockElement`,
`textOffsetInElement`, `hasHiddenMarkers`, `mapRenderedOffset`, `mapNode`,
`renderedLength`, `rawStartOf`, `nodeRawRange` and `SOURCE_SELECTOR` move here
unchanged, `SOURCE_SELECTOR`, `renderedLength` and `nodeRawRange` exported.

- [ ] **Step 2: Leave the way out where it is**

`position.ts` keeps `domPositionAtOffset`, `sourceTextPosition`, `DomPosition`,
`renderedOffsetAtRaw`, `mapNodeRawToRendered` and `textNodeAtRenderedOffset`, and
imports the three shared names from `./caret/offsets`. Its header now says what it
still holds and that Task 2 moves it.

- [ ] **Step 3: Point the importers at the new home**

The four files in the Files block import `documentOffsetAt` / `caretLocation` from
`./caret/offsets` (or `../caret/offsets`), and `domPositionAtOffset` from wherever it
still lives.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit          # silent
npm run check             # 13/13
```

Then, with the app freshly started (`npm run tauri dev`), the probes that read a
rendered position back into a document offset:

```bash
npm run probe -- test/probes/boundary-caret.js
npm run probe -- test/probes/inline-math-source.js
npm run probe -- test/probes/revealable-flows.js
npm run probe -- test/probes/empty-line-editing.js
```

- [ ] **Step 5: Commit** — `refactor(caret): put the way into the document in its own module`

### Task 2: The way out — `caret/dom_position.ts`

**Files:**
- Create: `src/ui/markdown/caret/dom_position.ts` (moved from `src/ui/markdown/position.ts`)
- Delete: `src/ui/markdown/position.ts`
- Modify: `src/ui/markdown/editing/context.ts`, `src/ui/markdown/editing/formatting.ts`, `src/ui/markdown/editing/find_controller.ts` (their `domPositionAtOffset` import)

**Interfaces:**

- Produces: `DomPosition` (`{ node: Node; offset: number }`),
  `domPositionAtOffset(state: MarkdownEditorState, root: HTMLElement, offset: number): DomPosition | null`,
  `sourceTextPosition(source: HTMLElement, offset: number): DomPosition | null`.
- Consumes: from Task 1, `SOURCE_SELECTOR`, `renderedLength`, `nodeRawRange`.

- [ ] **Step 1: Move the file**

```bash
git mv src/ui/markdown/position.ts src/ui/markdown/caret/dom_position.ts
```

The relative imports gain a level (`./caret/caret` → `./caret`, `./blocks` → `../blocks`,
and the three shared names now come from `./offsets`). The header:

```ts
/**
 * The document offset as a position in the rendered tree: where the caret goes
 * after an edit or a rebuild.
 *
 * May import: the offset model (`./offsets`), the state and its blocks, the
 * table's raw source. Upholds: the mapping is re-derived from the offset every
 * time — never cached, never the other way round.
 */
```

- [ ] **Step 2: Point the importers at it**

`editing/context.ts`, `editing/formatting.ts` and `editing/find_controller.ts` import
`domPositionAtOffset` from `../caret/dom_position`. `rg -n "position'" src` must come
back empty.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit          # silent
npm run check             # 13/13
```

Then, freshly started app, the probes that place a caret from an offset:

```bash
npm run probe -- test/probes/regression-arrows.js
npm run probe -- test/probes/display-math-arrows.js
npm run probe -- test/probes/display-math-source.js
npm run probe -- test/probes/footnote-button.js
npm run probe -- test/probes/table-cells.js
```

- [ ] **Step 4: Commit** — `refactor(caret): put the way out to the DOM in its own module`

### Task 3: Say what the caret's state is

**Files:**
- Modify: `src/ui/markdown/caret/caret.ts` (header only)

**Interfaces:**

- Consumes: nothing.
- Produces: nothing. The behaviour of every function in the file stays exactly as it is.

- [ ] **Step 1: Write the state down, instead of converting it**

The module holds nine `let`s that outlive every call: `caretElement`, `activeRange`,
`selectionRange`, `listenersAttached`, `stopWatchingLayout`, `caretFrame`,
`caretTimeout`, `pendingNativeSelection`, `selectionTimeout`, plus the
`caretRangeListeners` set. The spec allows either documenting them or making them an
instance; document them, because there is exactly one editor per window, every one of
these is already reached through module functions by `navigation.ts`, `geometry.ts`,
`offsets.ts` and the commands, and an instance would be a behaviour change in the
phase that is not allowed to make one. Say that in the header:

```ts
/**
 * The caret: the logical range, and the span that renders it.
 *
 * May import: the rendered geometry (`geometry.ts`, `observer.ts`, `dom.ts`).
 * Upholds: the range is the truth and the span is derived from it; the module is
 * the caret's single owner, and it holds that state module-wide because a window
 * holds one editor. The state is `activeRange`/`selectionRange` (what is where),
 * `caretElement` and the pending frame/timer handles (what is drawing it), and
 * the listener set and `listenersAttached` (who is told when it moves).
 */
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit          # silent
npm run check             # 13/13
npm run probe -- test/probes/boundary-caret.js   # the caret still exists after a rebuild
```

- [ ] **Step 3: Commit** — `docs(caret): say what the caret's module state is, and why`

### Task 4: The offset invariant, and the maps

**Files:**
- Modify: `docs/architecture.md` (the layer table, "The four offsets")
- Modify: `docs/ai-context.md` (the map, the four offsets)

**Interfaces:**

- Produces: the statement the phase is accepted against — for each flavour, what maps
  to what, which function does it, and when the mapping is re-derived.

- [ ] **Step 1: Replace "The four offsets" with the table**

```md
| Flavour | What it is | Mapped by | Re-derived when |
| --- | --- | --- | --- |
| document | index into the raw markdown | `caret/dom_position.ts: domPositionAtOffset` (1 → 4), `caret/offsets.ts: documentOffsetAt` (2–4 → 1) | never stored; recomputed from the caret on the next keystroke |
| block-relative | document offset − `block.charStart` | `caret/offsets.ts` (via the node tags and positions) | on every edit: `block.charStart` moves, the tags are rewritten with it |
| rendered | index into an element's text | `caret/offsets.ts: textOffsetInElement`, `caret/dom_position.ts: textNodeAtRenderedOffset` | after any DOM rebuild, because a block's rendering is rebuilt from its source |
| DOM range | a live `Range`, which the browser *relocates* rather than drops | `caret/caret.ts` (the span and the logical range) | after a rebuild, by offset (`editing/context.ts: placeCaret`) |
```

Keep the prose that says why the DOM range cannot be trusted across a rebuild, and
name which module owns each direction.

- [ ] **Step 2: Point the maps at the new files**

`docs/architecture.md`: the "Caret and offsets" layer row becomes `caret/*` alone; the
line naming `position.ts` names `caret/offsets.ts` and `caret/dom_position.ts`.
`docs/ai-context.md`: the same two places, and its four-offsets paragraph names the two
new files.

- [ ] **Step 3: Verify nothing names the old file**

```bash
rg -n "position\.ts" src docs test    # only this plan, and the history
npm run check                          # 13/13
```

- [ ] **Step 4: The phase's acceptance run**

Freshly started app, every probe the spec names for P3, then the whole suite:

```bash
npm run probe -- test/probes/boundary-caret.js
npm run probe -- test/probes/regression-arrows.js
npm run probe -- test/probes/empty-line-editing.js
npm run probe -- test/probes/display-math-arrows.js
npm run probe -- test/probes/inline-math-source.js
npm run probe -- test/probes/revealable-flows.js
npm run probe:all                      # 59/59 (6 skipped)
```

- [ ] **Step 5: Commit** — `docs: write down what maps to what, and when`

## Notes for the implementer

- Do not rename the *functions*. `documentOffsetAt` and `domPositionAtOffset` are named
  in the spec, in `docs/`, and in the headers of half a dozen modules; P3 moves them.
- `position.ts` is imported by five files and nothing else, and no test imports it. If
  `rg` finds a sixth importer, stop and read it before moving anything.
- The two directions share exactly three names. If you find yourself exporting a
  fourth, the split is wrong: the shared arithmetic belongs to the model, and the model
  is `offsets.ts`.
- Probes are the safety net here, not the compiler: a wrong offset still compiles.
  Restart `npm run tauri dev` before the acceptance run — a long-running dev app
  makes every probe time out.
