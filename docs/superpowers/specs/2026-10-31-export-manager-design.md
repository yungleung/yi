# Export Manager design

## Status

Approved interaction design for a central management surface for export conversion
settings and template packages.

## Problem

Export configuration currently appears in several places:

- the export card edits one kind's `export.{kind}.yaml`;
- the Template row chooses the package for that export;
- the template library imports, creates, duplicates and removes packages;
- the package editor edits package files;
- the same editor edits a kind's defaults YAML when opened from the export card.

Each control is correct in isolation, but there is no place to see a kind's complete
setup or manage its package library without first beginning an export. The reader
also has to understand an important distinction that the current navigation does not
make explicit: a defaults YAML is a singleton per Pandoc-backed kind, while template
packages are a library with zero or more compatible entries.

## Goals

- Provide one main-window Export Manager reachable from a native File-menu item.
- Show every export kind in a stable, grouped list.
- Show one kind's base conversion settings, active package and package library
  together.
- Reuse the existing export catalogue, template APIs, package operations, code
  editor and persistence.
- Make the active package, inspected package, broken package and shipped/customized
  defaults states unambiguous.
- Keep transient per-export choices in the export card.
- Make the manager testable without duplicating export or package rules.

## Non-goals

- The manager does not export a document.
- It does not manage per-export choices such as page size, citation-list
  suppression, self-contained HTML or remote Reveal.js resources.
- It does not manage note frontmatter templates used when creating a note.
- It does not add template support to kinds that do not have it.
- It does not move or rename `export.{kind}.yaml` files.
- It does not introduce a second template registry, manifest format or config key.
- It does not make export packages or defaults YAML session documents.
- It does not add another launch point for the first version. The native menu item is
  the canonical entry.

## Core model

Three facts remain distinct:

1. **Kind defaults** — one `export.{kind}.yaml` per Pandoc-backed export kind. It is
   the base configuration read by every export of that kind.
2. **Template package** — an imported, created or duplicated package in the app's
   template library. A package may carry template files, a reference document,
   package defaults, assets and Pandoc filters.
3. **Active package** — zero or one package id stored per kind in
   `AppConfig.export_templates`. No id means "Pandoc's default".

The effective export precedence is:

```
export.{kind}.yaml
  → selected package's export.yaml/defaults.yaml, when present
  → explicit export-card choices
```

The manager exposes the first two layers and the selection pointer. It does not own
the third.

## Entry point

A new native File-menu item, **Manage Export Templates…**, appears immediately after
the Export submenu. It has no keyboard accelerator.

The Rust menu emits the typed app event `manage_export_templates`. The browser-side
menu bridge maps that event to the command `export:manageTemplates`. The command is
registered by the export UI and opens the singleton Export Manager dialog.

The event and command names are new facts. They must be added to the typed app-event
map, the command-id union, the native-menu bridge and all eight locale catalogues.

## Surface

The manager is a modal in the main window. It is not a separate Tauri window and not
a session document.

- It follows the app's floating-surface conventions: a veiled, centred surface that
  is hidden until opened and closes on Escape.
- Opening the manager does not silently take the editor caret.
- Closing returns keyboard focus to the document editor.
- The dialog is sized for a two-pane layout, with a bounded content area and internal
  scrolling rather than a dialog taller than the window.
- A backdrop press does not close it; Close and Escape do.
- Escape closes the package/defaults editor first. The manager stays open beneath it
  and closes on the next Escape.

## Kind list

The left sidebar uses one row per export kind from the existing export-kind
catalogue. It must not maintain a second list of supported kinds.

The catalogue gains one grouping fact per kind:

- **Documents** — DOCX, ODT, LaTeX, HTML, EPUB, PDF
- **Presentations** — Reveal.js, Beamer
- **Other** — processed Markdown
- **Unassigned** — shown only when one or more broken packages have no readable
  export kind

The grouping belongs to the export-kind declaration so a future kind cannot be
added to the catalogue without being placed in the manager. Empty groups are not
drawn.

Each row shows:

- the localized kind label;
- the active package name, or "Pandoc's default";
- a short defaults state: shipped, customized or not created;
- a warning count when broken packages exist for that kind.

The first kind in the catalogue is selected when the manager opens. The selected
kind is not persisted after the manager closes.

## Kind page

The selected kind's right-hand page is divided into three regions.

### Summary

The summary names:

- the export kind;
- the active template package, or Pandoc's default;
- the defaults file state and its full path when one exists;
- package count and broken-package count, when applicable.

The summary is derived from current data whenever the page refreshes. It is never
stored separately.

### Conversion settings

This region represents `export.{kind}.yaml`.

- It always shows the path the app will use.
- A missing file is described as "Not created yet"; opening it for editing creates
  the reader's copy from the shipped defaults.
- **Edit** opens the existing CodeMirror defaults editor.
- **Restore Shipped File** is shown only when the file exists and differs from the
  shipped bytes.
- Restore asks for confirmation and replaces the entire file with the shipped
  version.
- Returning from the editor refreshes the path and state.
- The manager does not add a second save mechanism: the defaults editor writes only
  on its own Save and handles its own discard prompt.

Kinds that Pandoc does not write have no conversion-settings region. Plain Markdown
shows an explicit explanation instead of a disabled empty control.

### Template packages

This region lists packages compatible with the selected kind, plus the
**Pandoc's default** option.

The active package and the inspected package are separate states:

- The **active** package is the one named by the config.
- The **inspected** package is the row currently selected for Details/Edit.
- A package row may be inspected without changing the export configuration.
- The active package carries an "In use" marker even when another row is inspected.
- **Use This Template** commits the inspected package to the existing per-kind
  config entry.
- **Pandoc's default** can be inspected and activated to remove the config entry.

Selecting another kind, opening the editor and returning, or refreshing the library
never changes the active package by implication.

Packages whose readable manifest declares another kind are not shown under the
selected kind. Broken packages are shown when their intended kind can be determined.
Packages whose kind cannot be determined appear once under the sidebar's
**Unassigned** row, rather than being copied into every kind. That row uses a details
page limited to package identity, path, error and Remove; it has no defaults section
and no primary template-selection action.

## Package actions

Package operations continue through the existing template API and dialogs.

- **Import file/folder** is available for kinds that support packages and does not
  require Pandoc.
- **Create from Pandoc's default** requires Pandoc.
- **Duplicate** requires a selected package with a readable manifest.
- **Details** opens the existing details editor for a readable package. For a
  broken package it opens a read-only error/details view containing the package id,
  path and error, so the reader can identify what must be removed or repaired.
- **Edit files** requires a selected package with at least one editable file.
- **Validate** requires Pandoc and a readable package.
- **Test PDF** requires Pandoc, a readable package, and a PDF-capable package.
- **Remove** requires a selected package. Removing the active package asks first,
  then falls back to Pandoc's default.
- **Use This Template** requires a readable package compatible with the selected
  kind.

Actions that do not apply are absent where the entire concept is unsupported and
disabled with a nearby reason where the concept applies but a prerequisite is
missing.

After import, creation, duplication, details updates or removal, the manager reloads
the package summaries and preserves the selected kind. When possible, it also
preserves a still-existing inspected package id; otherwise it inspects the active
package or Pandoc's default.

## Unsupported and absent capabilities

- Reveal.js and Beamer have conversion settings but no template-package support.
- Plain Markdown has neither conversion settings nor template packages.
- A missing Pandoc binary does not prevent viewing, importing, editing or removing
  packages or editing defaults YAML. It disables actions that must execute Pandoc.

## Component boundaries

### Export Manager

`src/ui/export/manager/export_manager.ts` owns the modal, the kind sidebar, dialog
lifecycle, loading and refresh. It delegates kind-specific rendering and package
operations rather than duplicating them.

### Kind page

`src/ui/export/manager/kind_page.ts` composes one kind's summary, conversion
settings and package browser. It receives current export-kind, package and config
facts and reports requested actions back to the manager.

### Package browser

The package list, rows and action policy currently live inside
`src/ui/export/templates/library.ts`. They are extracted into an embeddable package
browser used by both:

- the existing export-card library chooser, whose primary action returns a choice;
- the Export Manager, whose primary action persists the active package.

The browser owns package UI and invokes shared package operations. It does not own
the modal container or the meaning of the primary action. This avoids opening a
library dialog inside the manager while keeping one implementation of package rows,
broken states and operations.

### Editor

`src/ui/export/templates/editor.ts` remains the only code editor for both package
files and defaults YAML. `openDefaults` gains the same completion callback that
`openPackage` already supports so the manager can refresh after editing.

### Rules

Compatibility, grouping, primary-action availability and active/inspected behavior
are pure functions in a manager-rules module. They consume the existing export-kind,
template-summary and config vocabulary. UI modules render those decisions and do not
re-derive them.

## Data flow

On open:

1. Load export-kind information.
2. Load package summaries.
3. Read the current export-template config.
4. Group kinds and packages.
5. Select the first kind in the catalogue.

On kind selection:

1. Resolve that kind's defaults state and active package.
2. Filter or group package summaries by compatibility.
3. Render the kind page from current facts.

On package selection:

1. Change only the inspected id.
2. Re-render row and action states.
3. Do not write config.

On **Use This Template**:

1. Verify the inspected package is compatible.
2. Copy the current `export_templates` map.
3. Set the selected kind to the package id, or remove the key for Pandoc's default.
4. Persist through `configManager.update`.
5. Refresh the active state.

On defaults edit or package edit:

1. Open the existing editor above the manager.
2. Let the editor own Save, dirty state and discard confirmation.
3. On close, refresh the relevant defaults or package summaries.

No backend command is added solely for the manager. Existing kind, template,
defaults and config APIs remain the sources of truth.

## Error handling

- A package-library read error is shown in the manager with a Retry action; the
  last successfully rendered management controls remain unavailable rather than
  appearing to act on unknown data.
- A missing active package is shown as "Missing package · {id}" in the summary and
  in the row list when the package id is known. The reader can activate Pandoc's
  default to clear it.
- A broken package remains removable and inspectable for its error.
- A defaults write or restore failure leaves the previous state visible and reports
  the backend's message.
- A failed config update leaves the previous active-package marker in place.
- Package editor errors remain inside the existing editor and are not duplicated as
  manager state.

## Accessibility and keyboard behavior

- The sidebar uses real buttons with selected state exposed through `aria-current`
  or `aria-selected`.
- Every icon-only control has an accessible label.
- The active package marker has text, not colour alone.
- Tab order follows sidebar then detail page.
- Escape follows the editor-first, manager-second rule above.
- Closing restores focus to the document editor through the editor's existing focus
  hook.

## Test strategy

### Pure checks

Add a manager-rules check covering:

- kind grouping and stable order;
- package compatibility and unassigned/broken classification;
- active package versus inspected package;
- action availability for supported, defaults-only and no-configuration kinds;
- Pandoc-present and Pandoc-absent action matrices;
- missing active package fallback.

### Tauri probes

Add an Export Manager probe covering:

- the native File-menu item is present with its localized label and emits the event
  that opens the manager;
- the sidebar contains every export kind in its group;
- changing kind updates summary, defaults and package regions;
- inspecting a package does not activate it;
- Use This Template persists the id and the export card later shows it;
- Pandoc's default clears the persisted id;
- Edit opens the defaults editor and returning refreshes its state;
- Restore Shipped File restores a modified copy after confirmation;
- a broken package cannot be activated but remains removable;
- Reveal.js and Beamer are defaults-only;
- Plain Markdown explains both absent regions;
- Escape closes the editor first and then the manager.

The probe runs against the fixture workspace and restores the user's export settings,
config and session through the existing harness.

### Verification

The implementation must pass:

- `npx tsc --noEmit`
- `cargo test`
- `npm run check`
- the new pure check
- the new Export Manager probe
- affected existing export, template and menu probes
- the full `npm run probe:all` suite before merge

## Documentation

All eight localized Documentation files gain an Export Manager section explaining:

- the File-menu entry;
- the difference between defaults YAML and template packages;
- selection versus inspection;
- the precedence of defaults, package defaults and per-export choices;
- restore, import, create, validate and remove behavior;
- what each export kind supports.

The default Markdown fixture adds a short pointer to **File → Manage Export
Templates…**.

Architecture and agent context documentation record:

- the Export Manager as the management owner;
- the package-browser extraction;
- the new native-menu event and command;
- the distinction between persistent manager changes and transient export-card
  choices.

## Acceptance criteria

- A reader can open one central manager from **File → Manage Export Templates…**.
- Every export kind is visible once under its correct group.
- The reader can edit or restore the kind's defaults YAML from the manager.
- The reader can inspect, activate, import, create, duplicate, edit, validate, test
  and remove compatible packages from the manager.
- The active package remains distinct from the row being inspected.
- The export card reads the selection changed by the manager without a restart.
- Unsupported kinds communicate their limitations without presenting dead controls.
- No template/default data is copied into a second store, and no export package
  becomes a session document.
