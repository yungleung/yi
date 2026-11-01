# Structure

What the code is made of, and where a change belongs. `docs/architecture.md` is the *model* — the
layers, the invariants, the four offsets; this is the *shape*: the tree, the class families, the
conventions and which of them a check enforces, the modules that carry two jobs, and the order the
structural work is worth taking. `docs/ai-context.md` is the brief to read first.

The numbers below were measured on 2026-11-01 — a walk over `src/` for files, lines and the import
graph, and `rg` for the class counts and the attribute names. They are the tree *after* the pass
described at the end of this document: 421 TypeScript modules, 47,136 lines, and no import cycles
anywhere in them.

## The tree

| Path | Modules | Lines | What it holds |
| --- | --- | --- | --- |
| `src/ui/markdown/syntax/` | 29 | 3,311 | the pure rules: markers, lines, citation keys, edit arithmetic and the parser pipeline |
| `src/ui/markdown/syntax/equation/` | 3 | 430 | equation wrapper parsing, environment lowering and offset-preserving parser masking |
| `src/ui/markdown/syntax/callout/` | 6 | 877 | callout model, readers, parser preparation, body materialisation and kind editing |
| `src/ui/markdown/syntax/table/` | 5 | 861 | table source, captions, source edits and command vocabulary |
| `src/ui/markdown/syntax/list/` | 3 | 576 | list caption attachment and list/indent edit rules |
| `src/ui/markdown/syntax/code/` | 4 | 264 | fenced-code metadata, listing nodes and code indentation |
| `src/ui/markdown/syntax/footnote/` | 5 | 321 | footnote marker grammar, incremental labels, parser borrowing and insertion |
| `src/ui/markdown/syntax/container/` | 3 | 423 | Pandoc Div boundaries and fence-body edits |
| `src/ui/markdown/syntax/container/quote/` | 4 | 407 | quote-carrier parsing, quote edits and offset-preserving projection |
| `src/ui/markdown/plugins/` | 3 | 507 | the remark extensions implemented as focused plugin subdomains |
| `src/ui/markdown/document/` | 11 | 2,491 | the text store, blocks, block index, parse cache, history and derived target indexes |
| `src/ui/markdown/nodes/` | 39 | 2,440 | the node components and their shared editable/revealable contracts |
| `src/ui/markdown/caret/` | 13 | 2,468 | the caret, drawn span, geometry, offsets, navigation and projection |
| `src/ui/markdown/editing/` | 41 | 4,952 | the commands: typing, deleting, lists, tables, fences, find, links and focused helpers |
| `src/ui/markdown/commands/` | 1 | 228 | editor command registration: the typed behaviours the editor owns |
| `src/commands/` | 7 | 941 | the app-wide command contracts, registry, dispatcher, authority, runtime and trigger adapters |
| `src/events/` | 1 | typed synchronous delivery for facts that stay inside one window |
| `src/ui/markdown/*` (top level) | 23 | 3,592 | stable editor/renderer facades, block dispatch and shared render support |
| `src/ui/markdown/block_views/` | 3 | 251 | equation, fence/listing and exact-source block rendering strategies |
| `src/ui/markdown/source_mode/` | 4 | 296 | source-mode state, block rules and node-source questions |
| `src/ui/markdown/editor/` | 7 | 509 | command wiring, history, keyboard, layout, render-context and view-state adapters |
| `src/ui/markdown/renderer/` | 5 | 530 | renderer DOM creation, measured-height policy, scroll/spacer geometry, and mounted-element caching |
| `src/ui/markdown/editing/blank_lines/` | 4 | 294 | paragraph, list and deletion rules for empty-line editing |
| `src/ui/floating/` | 6 | 340 | the shared floating surfaces, question card and placement rule |
| `src/ui/new_document/` | 4 | 605 | new-note registration, flow, placement dialog and template picker |
| `src/ui/session/` | 3 | 210 | session commands and the stacked-document panel |
| `src/ui/export/workflow/` | 10 | 898 | command entry, question, request, paths, progress, bibliography, notices and body preparation |
| `src/ui/export/pipeline/` | 18 | 1,810 | pipeline contracts and orchestration plus focused source-rewrite stages |
| `src/ui/export/assets/` | 5 | 390 | image contracts, LaTeX portability, raster preparation and picture diagnostics |
| `src/ui/export/reference/` | 3 | 255 | reference headers and native bibliography adaptation |
| `src/ui/export/dialog/` | 3 | 733 | the export question card, presentation-only form and its DOM controls |
| `src/ui/export/manager/` | 6 | 927 | the Export Manager surface, backend/config source, kind navigation, flow, kind page and pure rules |
| `src/ui/export/templates/` | 16 | 2,220 | template package browser, lifecycle operations, rows, editor shell, file list, dialogs and rules |
| `src/ui/**` outside `markdown/` (the shell) | 140 | 14,128 | title bar, status bar, sidebar, panels, prompts, settings, workspace, toolbars, versions and image URLs |
| `src/services/` | 7 | 464 | cross-cutting services beside the feature directories |
| `src/api/` | 9 | 766 | one file per backend seam (`invoke`, or a granted plugin) |
| `src/citations/` | 3 | 237 | reading CSL: types, library loading and parsing |
| the two entry points (`src/main.ts`, `src/settings.ts`) | 2 | 200 | the app window and the settings window |
| `src-tauri/src/*.rs` | 7 | 871 | the library root and focused app services |
| `src-tauri/src/files/` | 4 | 466 | file listing, displayable names, tree mutations, and atomic writes behind one command façade |
| `src-tauri/src/export/` | 57 | 8,332 | export commands over the kinds, run, templates, HTML and external-program boundaries |
| `src-tauri/src/fonts/` | 7 | 1,165 | font parsing, bundled faces and machine-font queries behind one façade |
| `src-tauri/src/menu/` | 3 | 330 | menu construction, event mapping and installation façade |
| `src-tauri/src/settings/` | 3 | 298 | configuration model, persistence and command façade |
| `src-tauri/src/versioning/` | 5 | 1,076 | the git seam and writes, folder facts and version reads |

`src/ui/markdown/` is 225 of the 421 modules and 26,736 of the 47,136 lines: the editor is the app,
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
subclasses) is the one that asks. `ui/toolbar/base.ts: Toolbar` (12 subclasses) is a button row
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
but it is the one name in the tree that means two things (item 9 below). The source walk is
`document/block_scanner.ts`; `document/block_scan_rules.ts` owns the ordered multi-line container
rules for fences, equations, indented code, terminated HTML, quotes and fenced Divs.

## Module organization guide

These rules are binding for every module and file move:

1. **Organize by owned domain and capability, not by shared filename prefix.** Table commands,
   table view models and table browser UI may share a `table/` domain; unrelated files with a
   common word do not.
2. **Create a folder when it has a domain contract.** A folder must represent shared state,
   lifecycle, an operation family, or a provider/consumer boundary. Do not create a folder merely
   to reduce a directory listing.
3. **A domain has one explicit public entrypoint.** Use `index.ts` (or Rust `mod.rs`) to export the
   intended surface. Prefer explicit named exports; wildcard re-exports are not domain APIs.
4. **Do not repeat the parent domain in a child filename.** Use `session/model.ts`, not
   `session/session_model.ts`; use `workspace/tree/menu.ts`, not `workspace/tree/tree_menu.ts`.
5. **Role suffixes are allowed only when they clarify ownership.** Names such as `model.ts`,
   `rules.ts`, `state.ts`, `contracts.ts`, `dialog.ts`, `flow.ts`, `form.ts`, `manager.ts` and
   `index.ts` are useful because they name a role, not a repeated domain.
6. **Cross-domain consumers import the public domain entrypoint.** Deep imports are reserved for
   the owning domain and tests that deliberately target an internal rule.
7. **Do not build compatibility barrels.** When an internal path moves, update every import. Keep a
   second path only for the stable facades listed below.
8. **No generic buckets.** `shared/`, `utils/`, `misc/`, `common/` and `helpers/` are not domains.
   Name the capability or leave a cohesive standalone module at its current layer.
9. **Dependencies point inward.** Rust and TypeScript follow their existing layer rules; a domain
   facade may depend on its own internals, but its internals must not reach back through consumer
   UI or create cycles.
10. **Commands, events and state ownership do not change because a file moves.** The approved
    command/event architecture remains authoritative.
11. **Every file move preserves tests and behavior.** A structural commit runs TypeScript/Rust
    checks and the affected Tauri probes; the completed pass runs the full app probe suite.
12. **Document the shape with the move.** Update module headers, `docs/structure.md`,
    `docs/ai-context.md` and any direct path references in tests, probes or plans.

The stable cross-app facades are `src/api/*`, `src/commands/*`,
`src/ui/markdown/markdown_editor.ts`, `src/main.ts`, `src/settings.ts`, and Rust command paths
exported through `src-tauri/src/lib.rs`. Their internals may move; their consumer paths do not.

## Which way the imports point

`docs/architecture.md` states the rule; this is what the code does today, measured by walking every
relative import in `src/`.

- **No cycles**, across all 405 modules; and `document/*` imports only syntax and its own files.
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
| caret → shell | `caret/node_projection.ts` → `services/bibliography/index.ts` | the node projection asks a service how many characters a citation draws |

  The editor layer's 18 edges into the shell (i18n, the bibliography, the table menu, the image flow,
  …) are by design: commands *are* the app's own layer, and `docs/architecture.md` allows it.

## Conventions, and what enforces them

Eight conventions hold the tree together, and every one has a check behind it — the two that had none
when this document was written (the class names and the offset tags) are checked now.

| Convention | Written in | Enforced by |
| --- | --- | --- |
| A module header says what it is for, what it may import and what it upholds | `writing-comments.md` | `test/checks/headers.mjs` — over the whole of `src/` (it began on the editor subtree and now covers all 421 modules) |
| Domains expose a façade, avoid cross-domain cycles and do not repeat parent prefixes | this document | `test/checks/module-layout.mjs` resolves TypeScript imports and Rust font/file boundaries |
| One markdown-syntax fact, one home | `architecture.md` | `test/checks/syntax-home.mjs` (9 facts, each defined only in `syntax/markers.ts`) |
| A command has one typed contract, one implementation, and one dispatch path | `adding-a-command.md` | `test/checks/commands.mjs`, `check-command-contracts.mjs`, and `check-command-dispatch.mjs` |
| The syntax layer never imports the DOM | `architecture.md` | `test/checks/layering.mjs` |
| A probe that opens a native menu says so | `testing.md` | `test/checks/probe-markers.mjs` |
| The `data-*` tags that carry offsets | `offset_tags.ts`, with `caret/offsets.ts` documenting the mapping | `test/checks/check-tag-offsets.mjs`: every `setOffset` names a tag from that module, and the fast path's moved list is read through it |
| Classes the editor draws are `markdown-*` | `styles.css` | `test/checks/class-names.mjs`: every `markdown-…` name the app uses is drawn by the stylesheet or listed as a hook with its reason, and every rule in the stylesheet has a name |
| The app's events, and what each carries | `services/events/contracts.ts` | the type of the bus (`services/events/manager.ts`) for the frontend's half, and `test/checks/check-events.mjs` for the native menu's: every name the Rust side emits is declared in the map |

## Sizes, and when a module is too big

Most modules are small. Big is not the same as bad — the caption and description-list
repairs are long because Markdown's edge cases are, while the offset path separates DOM reading
in `offsets.ts` from node projection in `node_projection.ts`. A module is too big when it holds **two jobs that change for
different reasons**. Several did, and each is split now:

| Module, then | Still holds (lines) | And the module the other job moved to |
| --- | --- | --- |
| `document/blocks.ts`, 732 | the splitter (673) | the kind vocabulary: `document/block_kinds.ts` (74) |
| `markdown_editor.ts`, 501 | the editor composition root — document, view and DOM lifecycle | command/menu installation in `editor/command_wiring.ts`, history replay in `editor/history.ts`, shortcut/arrow adapters in `editor/keyboard.ts`, key routing in `editing/keys.ts`, browser pointer/clipboard/preview wiring in `editing/editor_interactions.ts`, page/column state in `editor/page_layout.ts`, and picker caret arithmetic in `editing/block_opening_edit.ts` |
| `editing/context.ts`, 515 | the stable edit funnel and editing facade (157) | caret/selection/scroll placement in `editing/caret_placement.ts`, source-node selection in `editing/source_range.ts`, quote-child inspection in `editing/quote_context.ts`, selection reading in `editing/selection.ts`, and deferred shape verification in `editing/edit_verification.ts` |
| `editing/text_commands.ts`, 16 | the stable text-path facade | insertion in `text_insertion.ts`, deletion in `text_deletion.ts`, Enter in `text_newline.ts`, and task toggling in `task_command.ts` |
| `caret/caret.ts`, 520 | the logical range, the API (320) | the drawn span: `caret/span.ts` (251) |
| `caret/navigation.ts`, 75 | the public direction/dispatch facade | neighbor discovery in `navigation_nodes.ts`, horizontal traversal in `navigation_horizontal.ts`, vertical geometry in `navigation_vertical.ts`, and line hit-testing in `line_hits.ts` |
| `workspace/tree/index.ts`, 395 | workspace lifecycle and the public tree facade (129) | the recursive row DOM, expansion, reveal and row-local interactions in `workspace/tree/node.ts` (282) |
| `export/manager/index.ts`, 465 | modal state, package handling and the public manager facade (338) | backend/config I/O in `manager/source.ts` (58) and kind-sidebar rendering in `manager/navigation.ts` (153) |
| `export/templates/browser.ts`, 447 | package rows, selection, controls and rendering (244) | package lifecycle actions and dialogs in `templates/operations.ts` (238) |
| `export/dialog/form.ts`, 432 | form state, kind rules, diagnostics and answers (344) | reusable DOM controls and row composition in `dialog/controls.ts` (112) |
| `export/pipeline/preprocess.ts`, 393 | export rewrite sequencing, wikilinks, automatic references and citation assembly (198) | shared contracts in `contracts.ts` (70), ordered splices in `rewrites.ts` (20), figures in `figure_rewrites.ts` (117) and listings in `listing_rewrites.ts` (45) |
| `export/templates/editor.ts`, 383 | package/defaults state, file loading, dirty tracking, save, validation and close flow (318) | modal DOM, controls and Escape binding in `templates/editor_shell.ts` (138) |
| `syntax/equation/blocks.ts`, 406 | equation wrapper parsing, body classification and LaTeX lowering (277) | offset-preserving remark input in `syntax/equation/masking.ts` (125), behind the explicit `syntax/equation/index.ts` facade |
| `syntax/footnotes.ts`, 303 | the public footnote rules behind `syntax/footnote/index.ts` | marker grammar and positions in `model.ts`, incremental label tracking in `labels.ts`, borrowed parse definitions in `parse_context.ts`, and the insertion edit in `edits.ts` |
| `syntax/quote_edits.ts`, 353 | quote edit operations behind `syntax/container/quote/index.ts` | carrier parsing in `lines.ts` and offset-preserving source projection in `projection.ts`; fenced Div boundaries and fence-body edits now share the `syntax/container/` facade |
| `create_block.ts`, 359 | the block component dispatcher and shared parsed/blank rendering (151) | equation, fenced/listing and exact-source views under `block_views/` |
| `source_mode.ts`, 350 | source-mode state and a public facade | block rules, node questions and mutable shown-range/frame state under `source_mode/` |
| `editing/blank_lines.ts`, 339 | one public blank-line editing facade | paragraph layout, list-item behavior and deletion under `editing/blank_lines/` |
| `export/manager/rules.ts`, 145 | manager grouping, unassigned packages and defaults-state rules (84) | package-action availability in `templates/availability.ts` (53), where the selected package belongs |
| `src-tauri/src/settings.rs`, 340 | settings commands and public configuration facade (67) | schema/defaults/migration in `settings/model.rs` (175) and file persistence/path expansion in `settings/store.rs` (56) |
| `src-tauri/src/menu.rs`, 356 | installation facade over menu construction and event mapping (28) | menu tree construction in `menu/build.rs` (199) and event/ID mapping in `menu/events.rs` (103) |

## What was improved, in the order it was taken

Every item below is done, on the branch that added this document, one commit each. Each says what it
was worth, what proved it, and what it cost; the list is spent, and the conventions table above is
what keeps it that way.

1. **Name the two session modules for what they are.** `services/session/index.ts` ("the living session:
   the documents the reader has open, kept in step with the editor and with the file they are
   written to") and `services/session/rules.ts` ("the documents a reader has open: the one on
   screen, and the stack behind it") open with nearly the same sentence, and only the second is the
   *rules* — a difference `docs/ai-context.md` explains and the headers do not. Their names now
   distinguish `session/rules.ts` from `session/index.ts` in the two first sentences. The cheapest item
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
   `ui/image/urls.ts` (the shell side of that answer). `citation-renders.js` holds the seam: a
   citation draws Smith (2020), not the `[@smith2020]` it was written as.
4. **Extend `headers.mjs` over the whole of `src/`.** Done: the 41 modules outside
   `src/ui/markdown` — the shell, `services/`, `api/`, `citations/`, the two entry points — have
   their three lines, and the check reads `src/` (it says 405 modules).
5. **Check the `markdown-*` class contract.** Done: `test/checks/class-names.mjs` holds every
   `markdown-…` name the app uses to a rule in `styles.css` or to a listed hook (5 of them, each
   with its reason), and the other way round. Writing it found four names `format_dom_tags.ts` looked
   for that nothing sets — a widget's rest form is drawn by its own tag — and they are gone.
6. **Split the five two-job modules**, moving no behaviour. Done, a commit each: the kind vocabulary
   (`document/block_kinds.ts`), the key routing (`editing/keys.ts`), the selection reading
   (`editing/selection.ts`), the drawn span (`caret/span.ts`) and the line hit-testing
   (`caret/line_hits.ts`) are their own modules now, and the table above has the sizes. The probes
   are the net, and `npm run probe:all` was run over the whole pass.
7. **Type the event bus.** Done: `services/events/contracts.ts` is the map — the app's own events and the
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
