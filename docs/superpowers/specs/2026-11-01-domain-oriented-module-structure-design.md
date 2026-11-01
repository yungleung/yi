# Domain-Oriented Module Structure

**Date:** 2026-11-01

**Status:** Implemented

## Purpose

This structural pass makes Yi's filesystem communicate ownership, capability and domain. A reader
should be able to find a feature by its domain, understand which module is its public entrypoint,
and see from the path which neighbouring rules and adapters belong together.

The pass also removes repeated parent/domain prefixes such as `session/session_model.ts` and
`workspace/tree/tree_menu.ts`, while preserving a small number of genuinely stable cross-app
facades.

This is a movement and exposure refactor, not a feature change. Existing commands, events, state
ownership, observable behavior and external Tauri command names stay unchanged.

## Problems With the Current Shape

Several domains are already visible, but their files are scattered across flat directories:

- `src/services/` has 30 modules, including nine `session_*` files and separate
  `workspace_*`, `new_document_*`, document and versioning families.
- `src/ui/export/` has many `export_*` files beside format stages, dialogs, assets and reference
  helpers; `manager/export_manager*` repeats its folder's noun.
- Existing folders repeat their own name in child files: `workspace/tree_*`,
  `versioning/version_*`, `toolbar/*_toolbar`, `settings/*_settings`, `image/image_*`,
  `table/table_*`, `tutorial/tutorial_*`, and similar.
- `src/ui/markdown/` has `editor_*` and `renderer_*` families at its root.
- `src-tauri/src/fonts/` has `bundled.rs` beside `bundled_*` modules.
- Wildcard domain facades can expose implementation details accidentally.

The files are individually understandable; the paths do not consistently say where a change
belongs.

## Approved Approach

Use domain folders with explicit facades, while preserving the few cross-app contracts other
subsystems and probes genuinely depend on.

Do not reorganize the entire application into new top-level domains. Keep the established
`ui/`, `services/`, `api/`, `commands/` and `events/` layers, and make the domains inside them
honest.

### Stable cross-app facades

These paths remain stable:

- `src/api/*`: the backend and granted-plugin seams.
- `src/commands/*`: typed contracts, registry, dispatch, authority, runtime and triggers.
- `src/ui/markdown/markdown_editor.ts`: the editor component the shell mounts.
- `src/main.ts` and `src/settings.ts`: the two window entrypoints.
- Rust command paths exported through `src-tauri/src/lib.rs`.

Their internals may move. A stable facade must expose an intentional contract; it must not become a
compatibility shim for every old path.

### Service domains

Create these high-confidence domains:

```text
src/services/session/
  index.ts          # living DocumentSession
  rules.ts          # explicit public pure-rule facade
  model.ts
  open.ts
  edit.ts
  editor.ts
  files.ts
  persistence.ts
  serialization.ts

src/services/workspace/
  index.ts
  folders.ts
  setup.ts

src/services/new_document/
  index.ts
  builtins.ts
  templates.ts

src/services/events/
  index.ts
  contracts.ts
  manager.ts

src/services/bibliography/
  index.ts
  reference.ts

src/services/documents/
  index.ts
  identity.ts
  manager.ts

src/services/versioning/
  index.ts
  rules.ts
  versions.ts
```

`documents/index.ts` exposes the identity and catalogue-manager contracts. In `versioning/`,
`rules.ts` remains pure, `versions.ts` is the living list and depends on `rules.ts`, and
`index.ts` exposes both without creating a cycle back through the package facet.

Cross-cutting single-purpose services such as config, i18n, hints, messages, settings paths and
text diff remain flat until they have a real domain cluster. They are not forced into a generic
`core/`, `shared/` or `utils/` bucket.

### UI domains

Repeated prefixes inside existing folders are removed:

- `ui/documentation/documentation_*` becomes `ui/documentation/{flow,text}.ts`.
- `ui/image/image_*` becomes `ui/image/{dialog,flow,urls}.ts`.
- `ui/new_document/new_document_*` becomes `ui/new_document/{dialog,flow}.ts`.
- `ui/settings/*_settings.ts` drops `_settings`.
- `ui/table/table_*` becomes `ui/table/{menu,model}.ts`.
- `ui/toolbar/*_toolbar.ts` drops `_toolbar`; the base moves to `toolbar/base.ts`.
- `ui/tutorial/tutorial_*` becomes `ui/tutorial/{flow,rules,text}.ts`.
- `ui/versioning/version_*` becomes `ui/versioning/{comment_dialog,dialog,diff_view,history_modal,save,status}.ts`.
- `ui/workspace_setup/workspace_setup_*` becomes `ui/workspace_setup/{dialog,flow}.ts`.
- `ui/workspace/tree_*` becomes `ui/workspace/tree/{index,drag,menu,menu_model,ops,rename,rules}.ts`.
- `ui/export/manager/export_manager*` becomes `ui/export/manager/{index,flow}.ts`.
- `ui/export/templates/template_*` becomes `templates/{code_editor,file_list}.ts`; package row
  presentation moves to `templates/{browser,rows}.ts`.

The markdown shell gets two focused domains without moving its stable facade:

```text
src/ui/markdown/
  markdown_editor.ts       # stable facade
  editor/
    command_wiring.ts
    history.ts
    keyboard.ts
    page_layout.ts
    render_context.ts
    view_state.ts
  renderer/
    block_cache.ts
    dom.ts
    geometry.ts
    measurements.ts
```

The existing `virtual_block_renderer.ts` remains the renderer facade. The text-command facade and
caret navigation facade remain at their established paths; their internals may move in the same
pattern only where the import graph proves the boundary is clean.

### Export domains

The export directory is divided by capability:

```text
src/ui/export/
  workflow/     # command entry, question, request, paths, progress, notices
  pipeline/     # shared pre-process and format rewrite stages
  assets/       # image portability and raster preparation
  reference/    # reference headers and native bibliography
  dialog/       # the export card and presentation-only form
  manager/      # existing manager domain
  templates/    # existing package/template domain
```

Files inside these folders do not repeat `export_`. Public probes and callers use the smallest
appropriate facade; tests that intentionally inspect a pipeline stage may import it directly.

### Backend domains

The strongest backend prefix families become domains:

```text
src-tauri/src/fonts/bundled/
  mod.rs
  coverage.rs
  faces.rs
  header.rs

src-tauri/src/export/html/
  mod.rs
  attributes.rs
  media/
    mod.rs
    paths.rs
    package.rs
```

Existing `export/kinds`, `export/run`, `export/templates`, `files/` and `versioning/` domains keep
their facades. No Rust command path changes.

## Permanent Module-Organization Guide

These rules become repository instructions, not just advice for this migration.

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
   second path only for the stable facades listed above.
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

## Migration Order

The migration is one structural branch with reviewable commits:

1. Session, workspace and new-document service domains.
2. Remaining service domains and direct UI prefix cleanup.
3. Markdown editor/renderer domains and export capability domains.
4. Backend font and HTML domains.
5. Update the permanent guide and final path maps.

Within each commit:

1. Move files without changing behavior.
2. Add explicit domain facades and remove redundant exports.
3. Update imports and dynamic probe module paths.
4. Update headers and documentation.
5. Run the narrow checks and affected probes.

## Exposure and Dependency Rules

- A domain `index.ts` exports only what another domain, the shell or a probe legitimately needs.
- Pure internal helpers are not re-exported merely because they are convenient.
- Type-only exports may remain explicit where they form the public contract.
- Existing `api/*` files keep their command-oriented names because they mirror backend seams, not
  a repeated folder noun.
- Tauri command names and event names are wire contracts and do not change.
- Dynamic probe paths may change to a domain entrypoint; probes may still name an internal module
  when the probe's purpose is that rule.

## Non-Goals

- No behavior, command, event, persistence-format or UI change.
- No new framework, dependency-injection container or generic service layer.
- No top-level rewrite into `domains/` that discards the established layer boundaries.
- No renaming of public Tauri commands or event payloads.
- No abstract base classes or wrappers added for directory symmetry.

## Verification

Every commit must keep `npx tsc --noEmit` and relevant checks green. Rust changes add
`cargo test`.

The completed structural pass runs:

- `npx tsc --noEmit`
- `cargo test`
- `npm run check`
- affected Tauri probes after each domain move
- `npm run probe:all` over the final tree

A repository scan confirms no imports still name removed paths except the documented stable
facades.

## Documentation

This design is recorded permanently in:

- `AGENTS.md`: the short non-negotiable organization rules.
- `docs/structure.md`: the detailed current tree and folder/naming conventions.
- `docs/ai-context.md`: the layer map and links a new agent reads first.
- this spec: the rationale, approved boundary map and migration order.
