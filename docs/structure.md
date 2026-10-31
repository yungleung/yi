# Structure

What the code is made of, and where a change belongs. `docs/architecture.md` is the *model* — the
layers, the invariants, the four offsets; this is the *shape*: the tree, the class families, the
conventions and which of them a check enforces, the modules that carry two jobs, and the order the
structural work is worth taking. `docs/ai-context.md` is the brief to read first.

The numbers below were measured on 2026-10-06 — a walk over `src/` for files, lines and the import
graph, and `rg` for the class counts and the attribute names. They are the tree *after* the pass
described at the end of this document: 209 TypeScript modules, 26,836 lines, and no import cycles
anywhere in them (the pass added eight modules and took one away).

## The tree

| Path | Modules | Lines | What it holds |
| --- | --- | --- | --- |
| `src/ui/markdown/syntax/` | 20 | 3,051 | the pure rules: markers, lines, the edit arithmetic, the parser pipeline |
| `src/ui/markdown/plugins/` | 9 | 720 | the remark extensions: citation, wikilink, definition list |
| `src/ui/markdown/document/` | 6 | 1,787 | the text (a piece table), its blocks, the block kinds, the block index, the edit log |
| `src/ui/markdown/nodes/` | 29 | 1,848 | one class per mdast node: the DOM it draws |
| `src/ui/markdown/caret/` | 9 | 2,292 | the caret, its drawn span, its geometry, the offsets in and out, movement, the layout watcher |
| `src/ui/markdown/editing/` | 24 | 3,765 | the commands: typing, deleting, lists, tables, fences, find, links, formatting, the key routing |
| `src/ui/markdown/commands/` | 1 | editor command registration: the typed behaviours the editor owns |
| `src/commands/` | 7 | the app-wide command contracts, registry, dispatcher, authority, runtime and trigger adapters |
| `src/events/` | 1 | typed synchronous delivery for facts that stay inside one window |
| `src/ui/markdown/*` (top level) | 21 | the editor facade and blocks, plus focused editor render-context and caret/view-state adapters |
| `src/ui/markdown/renderer_*.ts` | 4 | renderer DOM creation, measured-height policy, scroll/spacer geometry, and mounted-element caching |
| `src/ui/export/preprocess*.ts`, `image_rewrites.ts`, `listing_markdown.ts`, `markdown_escaping.ts` | 4 | cross-kind rewrite orchestration, image resolution, listing output, and shared Markdown escaping |
| `src/ui/export/export_dialog.ts`, `export_form.ts` | 2 | the export workflow controller and its presentation-only form |
| `src/ui/**` outside `markdown/` (the shell) | 57 | 5,905 | title bar, status bar, sidebar, panels, prompts, settings, the workspace tree, the toolbars, the versions, the image URLs |
| `src/services/` | 20 | 2,844 | the living state: session, workspace, bibliography, i18n, hints, versioning, the event map |
| `src/api/` | 7 | 317 | one file per backend seam (`invoke`, or a granted plugin) |
| `src/citations/` | 2 | 149 | reading CSL: the types, and the parse |
| the two entry points (`src/main.ts`, `src/settings.ts`) | 2 | 200 | the app window and the settings window |
| `src-tauri/src/*.rs` | 9 | 1,715 | the app's own commands and services: files, menu, i18n, session, settings, stats, the library root |
| `src-tauri/src/files/` | 4 | file listing, displayable names, tree mutations, and sibling-temporary atomic writes |
| `src-tauri/src/export/` | 16 | 2,002 | the export kind table, configuration, pandoc seam, in-process picture fetch, font hints and the run |
| `src-tauri/src/fonts/` | 4 | 1,136 | font-file parsing, the shipped faces and header, and the machine's faces |
| `src-tauri/src/versioning/` | 5 | 998 | the git seam and writes, the folder facts a versioning decision needs, and version reads |

`src/ui/markdown/` is 120 of the 209 modules and 17,353 of the 26,836 lines: the editor is the app,
and the rest of the tree is the window around it. Nothing under `src/` is dead weight except
`src/api/greet.ts` with `src-tauri/src/greeting.rs` — the Tauri template's `greet`, which nothing in
the app calls (measured by `rg`; it is item 8 below).

## The class families

Three families, each with one base class — or one table — and one rule.

**The shell's components.** `ui/component.ts: BaseComponent` (implements `UIComponent`: an element,
`mount`, `destroy`) has 17 direct subclasses, and the two families under it are the floating
surfaces and the toolbars. `ui/floating/surface.ts: FloatingSurface` → `BesideCard` (fixed on the
body, placed by the pure rule in `floating/placement.ts`) and `AnchoredPanel` (inside the button's
own `relative` host) → the footnote preview, the citation preview, the completion list, the session
stack, the table picker, the messages; `ui/floating/question_card.ts: QuestionCard<T>` (6
subclasses) is the one that asks. `ui/toolbar/toolbar.ts: Toolbar` (12 subclasses) is a button row
that knows its command's *name*, not its behaviour. The rule: a kind may *add* to Escape but never
replace it, and a fact one kind has is a parameter it is built with, or a subclass — never a mode
flag on the base.

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
- **The render layer reaches no service** — it used to be three edges (`nodes/citation.ts`,
  `nodes/wikilink.ts`, `image_sources.ts`), and they are the render context now (item 3 below).
- **Two edges bend upwards**, and they are the ones worth knowing:

| Edge | Where | What it costs |
| --- | --- | --- |
| render → editor | `create_block.ts` → `editing/language_picker.ts` | the language badge's button opens a command-layer list from the render layer |
| caret → shell | `caret/offsets.ts` → `services/bibliography.ts` | the offset model asks a service how many characters a citation draws |

  The editor layer's 18 edges into the shell (i18n, the bibliography, the table menu, the image flow,
  …) are by design: commands *are* the app's own layer, and `docs/architecture.md` allows it.

## Conventions, and what enforces them

Eight conventions hold the tree together, and every one has a check behind it — the two that had none
when this document was written (the class names and the offset tags) are checked now.

| Convention | Written in | Enforced by |
| --- | --- | --- |
| A module header says what it is for, what it may import and what it upholds | `writing-comments.md` | `test/checks/headers.mjs` — over the whole of `src/` (it began on the editor subtree and now covers all 201 modules) |
| One markdown-syntax fact, one home | `architecture.md` | `test/checks/syntax-home.mjs` (9 facts, each defined only in `syntax/markers.ts`) |
| A command has one typed contract, one implementation, and one dispatch path | `adding-a-command.md` | `test/checks/commands.mjs`, `check-command-contracts.mjs`, and `check-command-dispatch.mjs` |
| The syntax layer never imports the DOM | `architecture.md` | `test/checks/layering.mjs` |
| A probe that opens a native menu says so | `testing.md` | `test/checks/probe-markers.mjs` |
| The `data-*` tags that carry offsets | `offset_tags.ts`, with `caret/offsets.ts` documenting the mapping | `test/checks/check-tag-offsets.mjs`: every `setOffset` names a tag from that module, and the fast path's moved list is read through it |
| Classes the editor draws are `markdown-*` | `styles.css` | `test/checks/class-names.mjs`: every `markdown-…` name the app uses is drawn by the stylesheet or listed as a hook with its reason, and every rule in the stylesheet has a name |
| The app's events, and what each carries | `services/app_events.ts` | the type of the bus (`services/event_manager.ts`) for the frontend's half, and `test/checks/check-events.mjs` for the native menu's: every name the Rust side emits is declared in the map |

## Sizes, and when a module is too big

Most modules are small. Big is not the same as bad — the caption and description-list
repairs are long because Markdown's edge cases are, and `offsets.ts` because the mapping has
four flavours to keep straight. A module is too big when it holds **two jobs that change for
different reasons**. Several did, and each is split now:

| Module, then | Still holds (lines) | And the module the other job moved to |
| --- | --- | --- |
| `document/blocks.ts`, 732 | the splitter (673) | the kind vocabulary: `document/block_kinds.ts` (74) |
| `markdown_editor.ts`, 671 | the shell — document, view and command wiring | key routing in `editing/keys.ts`, page/column state and scale in `editor_page_layout.ts`, and shared picker caret arithmetic in `editing/block_opening_edit.ts` |
| `editing/context.ts`, 621 | the edit funnel (463) | reading the selection: `editing/selection.ts` (175) |
| `caret/caret.ts`, 520 | the logical range, the API (320) | the drawn span: `caret/span.ts` (251) |
| `caret/navigation.ts`, 520 | the four directions (401) | the line hit-testing: `caret/line_hits.ts` (136) |

## What was improved, in the order it was taken

Every item below is done, on the branch that added this document, one commit each. Each says what it
was worth, what proved it, and what it cost; the list is spent, and the conventions table above is
what keeps it that way.

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
3. **Take the services out of the rendering.** Done: `ui/markdown/render_context.ts` is the port —
   a citation's formatted reference, a wikilink's title, an image's candidate URLs — and the renderer
   holds one (set by the editor, which may import services) and puts it in force around each block
   build. `nodes/citation.ts`, `nodes/wikilink.ts` and `nodes/image.ts` read the answers from it and
   capture them where a lazy callback runs later, and `image_sources.ts` moved to
   `ui/image/image_urls.ts` (the shell side of that answer). `citation-renders.js` holds the seam: a
   citation draws Smith (2020), not the `[@smith2020]` it was written as.
4. **Extend `headers.mjs` over the whole of `src/`.** Done: the 41 modules outside
   `src/ui/markdown` — the shell, `services/`, `api/`, `citations/`, the two entry points — have
   their three lines, and the check reads `src/` (it says 201 modules).
5. **Check the `markdown-*` class contract.** Done: `test/checks/class-names.mjs` holds every
   `markdown-…` name the app uses to a rule in `styles.css` or to a listed hook (5 of them, each
   with its reason), and the other way round. Writing it found four names `format_dom.ts` looked
   for that nothing sets — a widget's rest form is drawn by its own tag — and they are gone.
6. **Split the five two-job modules**, moving no behaviour. Done, a commit each: the kind vocabulary
   (`document/block_kinds.ts`), the key routing (`editing/keys.ts`), the selection reading
   (`editing/selection.ts`), the drawn span (`caret/span.ts`) and the line hit-testing
   (`caret/line_hits.ts`) are their own modules now, and the table above has the sizes. The probes
   are the net, and `npm run probe:all` was run over the whole pass.
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
