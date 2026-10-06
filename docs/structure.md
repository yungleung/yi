# Structure

What the code is made of, and where a change belongs. `docs/architecture.md` is the *model* — the
layers, the invariants, the four offsets; this is the *shape*: the tree, the class families, the
conventions and which of them a check enforces, the modules that carry two jobs, and the order the
structural work is worth taking. `docs/ai-context.md` is the brief to read first.

The numbers below were measured on 2026-10-06 — a walk over `src/` for files, lines and the import
graph, and `rg` for the class counts and the attribute names: 202 TypeScript modules, 26,115 lines,
and no import cycles anywhere in them.

## The tree

| Path | Modules | Lines | What it holds |
| --- | --- | --- | --- |
| `src/ui/markdown/syntax/` | 20 | 3,051 | the pure rules: markers, lines, the edit arithmetic, the parser pipeline |
| `src/ui/markdown/plugins/` | 9 | 720 | the remark extensions: citation, wikilink, definition list |
| `src/ui/markdown/document/` | 5 | 1,771 | the text (a piece table), its blocks, the block index, the edit log |
| `src/ui/markdown/nodes/` | 29 | 1,832 | one class per mdast node: the DOM it draws |
| `src/ui/markdown/caret/` | 7 | 2,222 | the caret, its geometry, the offsets in and out, movement, the layout watcher |
| `src/ui/markdown/editing/` | 22 | 3,620 | the commands: typing, deleting, lists, tables, fences, find, links, formatting |
| `src/ui/markdown/commands/` | 4 | 260 | the command table, the keymap, the native menu |
| `src/ui/markdown/*` (top level) | 18 | 3,625 | the renderer, the registry, source mode, the editor, the DOM patch, the shared cards |
| `src/ui/**` outside `markdown/` (the shell) | 56 | 5,657 | title bar, status bar, sidebar, panels, prompts, settings, the workspace tree, the toolbars, the versions |
| `src/services/` | 19 | 2,702 | the living state: session, workspace, bibliography, i18n, hints, versioning |
| `src/api/` | 8 | 275 | one file per backend seam (`invoke`, or a granted plugin) |
| `src/citations/` | 2 | 149 | reading CSL: the types, and the parse |
| the two entry points (`src/main.ts`, `src/settings.ts`) | 2 | 200 | the app window and the settings window |
| `src-tauri/src/*.rs` | 10 | 2,282 | the app's own commands: files, menu, i18n, session, settings, stats, versioning |

`src/ui/markdown/` is 114 of the 202 modules and 17,101 of the 26,115 lines: the editor is the app,
and the rest of the tree is the window around it. Nothing under `src/` is dead weight except
`src/api/greet.ts` with `src-tauri/src/greeting.rs` — the Tauri template's `greet`, which nothing in
the app calls (measured by `rg`; it is item 8 below).

## The class families

Three families, each with one base class — or one table — and one rule.

**The shell's components.** `ui/component.ts: BaseComponent` (implements `UIComponent`: an element,
`mount`, `destroy`) has 17 direct subclasses, and the two families under it are the floating
surfaces and the toolbars. `ui/floating/surface.ts: FloatingSurface` → `BesideCard` (fixed on the
body, placed by the pure rule in `floating/placement.ts`) and `AnchoredPanel` (inside the button's
own `relative` host) → the footnote preview, the completion list, the session stack, the table
picker, the messages; `ui/floating/question_card.ts: QuestionCard<T>` (6 subclasses) is the one that
asks. `ui/toolbar/toolbar.ts: Toolbar` (12 subclasses) is a button row that knows its command's
*name*, not its behaviour. The rule: a kind may *add* to Escape but never replace it, and a fact one
kind has is a parameter it is built with, or a subclass — never a mode flag on the base.

**The node components.** `nodes/editable_node.ts: EditableNodeComponent` is the contract every
rendered node implements — bind an mdast node, expose the element, place the caret where it was
clicked — with 17 concrete subclasses; `nodes/revealable_node.ts: RevealableNodeComponent` (13
subclasses) is the family whose markdown can stand in for its rendering while the caret is inside
it. `registry.ts` is the one table of node type → component, and it exists *to break a cycle*: a
node module depends on it, it depends only on the base classes, so `create_node.ts` is never
imported by the nodes (its header says so). The rule: a node's rendering is a pure function of its
own source, and whether it shows source at all is *registered* (`showsSource`), not asked of the
renderer.

**The block model.** `document/blocks.ts: MarkdownBlock`/`BlockView` is the model — a slice of lines
with a kind, a raw range and a content key — and `create_block.ts: BlockView` is the DOM component
built from it. The public type is `MarkdownBlock`, so the duplicate class name is local to its file,
but it is the one name in the tree that means two things (item 9 below).

## Which way the imports point

`docs/architecture.md` states the rule; this is what the code does today, measured by walking every
relative import in `src/`.

- **No cycles**, across all 202 modules; and `document/*` imports only syntax and its own files.
  The two hardest invariants in the tree, and both hold.
- **`syntax/*` imports only syntax, the AST types, the parser libraries and `plugins/*`** — the 3
  edges into the plugins are the parser's own extensions. `layering.mjs` enforces this.
- **The render layer imports the caret**, in 3 places (`nodes/editable_node.ts`, `create_block.ts`).
  That is the design — a click places the caret — and `docs/architecture.md`'s layer table said the
  opposite; the table has been corrected to say so.
- **Five edges bend upwards** (three of them from the render layer to a service), and they are the
  ones worth knowing:

| Edge | Where | What it costs |
| --- | --- | --- |
| render → shell | `nodes/citation.ts` → `services/bibliography`, `nodes/wikilink.ts` → `services/document_manager`, `image_sources.ts` → `services/workspace_folders` | a node reaches a *service* for the text or the URL it draws, so its rendering is not a function of its node alone |
| render → editor | `create_block.ts` → `editing/language_picker.ts` | the language badge's button opens a command-layer list from the render layer |
| caret → shell | `caret/offsets.ts` → `services/bibliography.ts` | the offset model asks a service how many characters a citation draws |

  The editor layer's 18 edges into the shell (i18n, the bibliography, the table menu, the image flow,
  …) are by design: commands *are* the app's own layer, and `docs/architecture.md` allows it.

## Conventions, and what enforces them

Seven conventions hold the tree together. Five have a check; the other two are the debt this section
exists to name.

| Convention | Written in | Enforced by |
| --- | --- | --- |
| A module header says what it is for, what it may import and what it upholds | `writing-comments.md` | `test/checks/headers.mjs` — over the whole of `src/` (it began on the editor subtree and now covers all 201 modules) |
| One markdown-syntax fact, one home | `architecture.md` | `test/checks/syntax-home.mjs` (9 facts, each defined only in `syntax/markers.ts`) |
| A command has one name, one home, one way in | `adding-a-command.md` | `test/checks/commands.mjs` |
| The syntax layer never imports the DOM | `architecture.md` | `test/checks/layering.mjs` |
| A probe that opens a native menu says so | `testing.md` | `test/checks/probe-markers.mjs` |
| The `data-*` tags that carry offsets | `offset_tags.ts`, with `caret/offsets.ts` documenting the mapping | `test/checks/check-tag-offsets.mjs`: every `setOffset` names a tag from that module, and the fast path's moved list is read through it |
| Classes the editor draws are `markdown-*` | `styles.css` | `test/checks/class-names.mjs`: every `markdown-…` name the app uses is drawn by the stylesheet or listed as a hook with its reason, and every rule in the stylesheet has a name |
| The app's events, and what each carries | `services/app_events.ts` | the type of the bus (`services/event_manager.ts`) for the frontend's half, and `test/checks/check-events.mjs` for the native menu's: every name the Rust side emits is declared in the map |

## Sizes, and when a module is too big

Most modules are small: the median is 90 lines, 140 of the 202 are under 150, and 18 are over 300.
Big is not the same as bad — `syntax/parser.ts` is long because the remark pipeline is, and
`offsets.ts` because the mapping has four flavours to keep straight. A module is too big when it
holds **two jobs that change for different reasons**. Five do:

| Module | Lines | The two jobs |
| --- | --- | --- |
| `document/blocks.ts` | 732 | the kind vocabulary (`BlockKind` and the `isRawRendered`/`hasSourceMode`/`isFenced`/`hasBodyView` predicates) and the splitter (`splitBlocks`/`splitBlocksFrom`/`resumeFrom`) |
| `markdown_editor.ts` | 717 | the shell and the layout (`fitPage`/`setLayout`/`captureView`/`restoreView`) and the keyboard routing (`handleKeydown`/`handleTextKey`/`handleShortcut`/`handleArrowKey`) |
| `editing/context.ts` | 621 | the edit funnel (`applyEdit` and the deferred verify) and reading a selection back into offsets |
| `caret/caret.ts` | 520 | the module-wide caret state (its stated single owner) and the rendered span (positioning, the deferred render, the scroll) |
| `caret/navigation.ts` | 520 | the four directions and the line-fragment hit-testing (`collectLineFragments`/`samplePoints`/`refineColumn`) |

## What to improve, in the order worth taking

Each item says what it is worth, what proves it, and what it costs. None of them is needed for the
app to work; all of them are about the next person finding what they meant to change.

1. **Name the two session modules for what they are.** `services/session.ts` ("the living session:
   the documents the reader has open, kept in step with the editor and with the file they are
   written to") and `services/session_rules.ts` ("the documents a reader has open: the one on
   screen, and the stack behind it") open with nearly the same sentence, and only the second is the
   *rules* — a difference `docs/ai-context.md` explains and the headers do not. Rename the rules
   module (`session_rules.ts`), or say which is which in the two first sentences. The cheapest item
   here.
2. **Give the `data-*-from` tags one home.** Done: `src/ui/markdown/offset_tags.ts` names the
   eleven offset tags and carries the two helpers every writer and reader now uses (`setOffset`,
   `offsetOf`, and `tagSelector` for the selectors). The fast path's own duplicated list and its
   hand-written selector are that module now, `check-tag-offsets.mjs` reads the tags through it, and
   a typo in an attribute name is a compile error rather than a mispicked caret.
3. **Take the services out of the rendering.** Three render-layer modules reach a service for the
   text or the URL they draw (a citation's formatted reference, a wikilink's title, an image's
   source). Passing that in — the way the renderer already passes a block's frame — would make a
   node's rendering a function of its node and the input it was handed, which is the rule the
   architecture already states for blocks.
4. **Extend `headers.mjs` over the whole of `src/`.** Done: the 41 modules outside
   `src/ui/markdown` — the shell, `services/`, `api/`, `citations/`, the two entry points — have
   their three lines, and the check reads `src/` (it says 201 modules).
5. **Check the `markdown-*` class contract.** Done: `test/checks/class-names.mjs` holds every
   `markdown-…` name the app uses to a rule in `styles.css` or to a listed hook (5 of them, each
   with its reason), and the other way round. Writing it found four names `format_dom.ts` looked
   for that nothing sets — a widget's rest form is drawn by its own tag — and they are gone.
6. **Split the five two-job modules**, one branch each, moving no behaviour: the probes are the net
   (`npm run probe:all`, plus the checks the move touches). Start with `document/blocks.ts`: its
   kind half needs no imports at all, and the splitter keeps the three it has.
7. **Type the event bus.** Done: `services/app_events.ts` is the map — the app's own events and the
   native menu's, 29 names, each with its payload — and the bus takes a name from it, so a listener's
   payload is typed and a constant that drifts from its name is a compile error. The menu's half is
   Rust, so `check-events.mjs` reads `src-tauri/src/*.rs` and fails on a name the map does not have
   (the check was proved against a deliberately invented one). Typing it also found the
   `document_session_changed` wire name that the session rename had changed by accident — reverted.
8. **Delete the template's `greet`.** `src/api/greet.ts`, `src-tauri/src/greeting.rs` and its
   registration in `lib.rs` are the Tauri scaffold; nothing calls them.
9. **Kill the `BlockView` collision.** The model's class and the render component's class share a
   name. One rename, no behaviour, and the two files stop being confusable in a stack trace.
10. **Write the header rule's scope into `writing-comments.md`.** Done, in the change that added
    this document: the file used to imply every module while the check covered one subtree — item 4
    is what makes the implication true.

## Keeping the shape honest

The conventions above survive because a check fails when they break, and the checks are cheap to
extend: `test/checks/` bundles one module with rolldown and asserts in Node in milliseconds
(`docs/testing.md`). A new convention should arrive with its check, and this file should name the
check beside it — a rule that only lives in a document is a rule that will drift.

When a move changes what a module may import, its **header is the contract** and the header is what
the next reader trusts; `writing-comments.md` is the shape, and `npx tsc --noEmit` plus
`npm run check` are the first two things to run afterwards.
