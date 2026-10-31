# Export Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native-menu Export Manager that shows every export kind with its defaults YAML,
active template package and compatible package library in one main-window dialog.

**Architecture:** The Rust export-kind catalogue gains one grouping fact per kind. Pure TypeScript
rules decide groups, compatibility and action availability. The existing template-library rows and
operations are extracted into an embeddable package browser shared by the export-card chooser and
the manager. A new main-window surface owns kind selection and refresh; existing config, template,
defaults and editor APIs remain the only persistence paths.

**Tech Stack:** TypeScript 7, Tauri 2, Rust, daisyUI 5, CodeMirror 6, Node checks, Tauri MCP probes,
Pandoc.

**Spec:** `docs/superpowers/specs/2026-10-31-export-manager-design.md`

## Global Constraints

- The native menu is the only first-version launch point:
  **File → Manage Export Templates…**.
- The manager owns persistent defaults, packages and the per-kind selected package only.
- Page size, citation-list suppression, self-contained HTML and Reveal.js resource choices remain
  transient export-card choices.
- One defaults YAML exists per Pandoc-backed kind; zero or more template packages may exist for a
  package-capable kind.
- The effective precedence is app defaults YAML, then selected package defaults, then explicit
  export-card choices.
- Inspecting a package never activates it; **Use This Template** is the activation action.
- No new template registry, manifest format, config key or session document may be introduced.
- Existing `export.{kind}.yaml` locations and package storage must not move.
- Reuse the existing template API, defaults API, config manager and CodeMirror editor.
- Every export kind appears exactly once in the manager catalogue.
- The manager is a main-window modal, not a separate Tauri window.
- Escape closes the editor first, then the manager.
- Closing the manager restores focus to the document editor.
- All user-facing strings are added to all eight JSON catalogues.
- Documentation changes cover all eight localized guides.
- Every behavior change starts with a failing test, then the minimal implementation.
- Use the running Tauri app through `npm run probe` for UI behavior; Node-only rules use
  `test/checks/`.
- Do not use the maintainer's workspace or session as test data. The harness must restore config,
  export settings and session.
- Do not merge to `main` as part of implementation unless the user asks in that turn.

---

## File Structure

### Rust

- Modify: `src-tauri/src/export/kinds.rs`
  - Owns the export-kind enumeration and each kind's manager group.
- Modify: `src-tauri/src/export/info.rs`
  - Serializes the group to the window with the other export-kind facts.
- Modify: `src-tauri/src/export/tests/kinds.rs`
  - Proves every kind has the expected group.
- Modify: `src-tauri/src/menu.rs`
  - Adds the native File-menu item and event id.

### API and commands

- Modify: `src/api/export.ts`
  - Adds the `ExportGroup` union and `group` field to `ExportKindInfo`.
- Modify: `src/services/app_events.ts`
  - Declares the native `manage_export_templates` event.
- Modify: `src/ui/markdown/commands/registry.ts`
  - Adds `export:manageTemplates`.
- Modify: `src/ui/markdown/commands/menu.ts`
  - Maps `manage_export_templates` to the manager command.
- Modify: `src/main.ts`
  - Registers the manager command with the editor focus hook.

### Pure manager rules

- Create: `src/ui/export/manager/manager_rules.ts`
  - Groups kinds/packages and computes action availability.
- Create: `test/checks/check-export-manager-rules.mjs`
  - Exercises the whole pure rule table.

### Shared package browser

- Create: `src/ui/export/templates/package_browser.ts`
  - Renders package rows and runs shared package operations.
- Modify: `src/ui/export/templates/library.ts`
  - Becomes the kind-specific chooser wrapper around the shared browser.
- Modify: `src/ui/export/export_dialog.ts`
  - Passes the complete `ExportKindInfo` to the chooser instead of only its name.
- Modify: `src/ui/export/templates/details.ts`
  - Adds a read-only broken-package details surface.
- Modify: `src/ui/export/templates/editor.ts`
  - Gives defaults editing the same close callback package editing already has.

### Export Manager

- Create: `src/ui/export/manager/export_manager.ts`
  - Owns the modal, sidebar, current kind, loading, refresh and close behavior.
- Create: `src/ui/export/manager/kind_page.ts`
  - Composes summary, defaults and package regions for one kind.
- Create: `src/ui/export/manager/export_manager_flow.ts`
  - Registers `export:manageTemplates` and opens the manager.
- Create: `test/probes/export-manager.js`
  - Drives the native-menu event, sidebar, defaults, package selection, edge cases and keyboard.

### Localization and documentation

- Modify: `locales/en.json`
- Modify: `locales/de.json`
- Modify: `locales/es.json`
- Modify: `locales/fr.json`
- Modify: `locales/ja.json`
- Modify: `locales/pt.json`
- Modify: `locales/zh-Hans.json`
- Modify: `locales/zh-Hant.json`
- Modify: `src/ui/documentation/documentation.en.md`
- Modify: `src/ui/documentation/documentation.de.md`
- Modify: `src/ui/documentation/documentation.es.md`
- Modify: `src/ui/documentation/documentation.fr.md`
- Modify: `src/ui/documentation/documentation.ja.md`
- Modify: `src/ui/documentation/documentation.pt.md`
- Modify: `src/ui/documentation/documentation.zh-Hans.md`
- Modify: `src/ui/documentation/documentation.zh-Hant.md`
- Modify: `test/fixtures/workspace/default-document.md`
- Modify: `test/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/ai-context.md`

---

### Task 1: Add the export-kind manager group

**Files:**
- Modify: `src-tauri/src/export/kinds.rs`
- Modify: `src-tauri/src/export/info.rs`
- Modify: `src-tauri/src/export/tests/kinds.rs`
- Modify: `src/api/export.ts`

**Interfaces:**
- Produces: `ExportGroup::{Documents, Presentations, Other}` in Rust.
- Produces: `ExportKind.group: ExportGroup`.
- Produces: `ExportKindInfo.group: ExportKindInfo['group']`.
- Produces TypeScript:

```ts
export type ExportGroup = 'documents' | 'presentations' | 'other';
```

- [ ] **Step 1: Write the failing Rust grouping test**

Add to `src-tauri/src/export/tests/kinds.rs`:

```rust
#[test]
fn every_kind_has_the_export_manager_group_that_owns_it() {
    use crate::export::kinds::ExportGroup;

    let expected = [
        ("docx", ExportGroup::Documents),
        ("odt", ExportGroup::Documents),
        ("latex", ExportGroup::Documents),
        ("html", ExportGroup::Documents),
        ("revealjs", ExportGroup::Presentations),
        ("epub", ExportGroup::Documents),
        ("pdf", ExportGroup::Documents),
        ("beamer", ExportGroup::Presentations),
        ("markdown", ExportGroup::Other),
    ];

    assert_eq!(
        crate::export::KINDS
            .iter()
            .map(|kind| (kind.kind, kind.group))
            .collect::<Vec<_>>(),
        expected
    );
}
```

- [ ] **Step 2: Run the Rust test and verify it fails**

Run:

```bash
cargo test every_kind_has_the_export_manager_group_that_owns_it
```

Expected: FAIL because `ExportKind` has no `group` field.

- [ ] **Step 3: Add the Rust enum and kind field**

In `src-tauri/src/export/kinds.rs`, add:

```rust
/// Where the Export Manager lists a kind.
///
/// This is a fact of the kind catalogue so a new kind cannot be added without deciding where a
/// reader finds it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExportGroup {
    Documents,
    Presentations,
    Other,
}

pub struct ExportKind {
    pub group: ExportGroup,
    // Existing fields remain.
}
```

Add the field to every `KINDS` row:

```rust
group: ExportGroup::Documents,
```

for DOCX, ODT, LaTeX, HTML, EPUB and PDF;

```rust
group: ExportGroup::Presentations,
```

for Reveal.js and Beamer; and

```rust
group: ExportGroup::Other,
```

for processed Markdown.

Export `ExportGroup` from `src-tauri/src/export/mod.rs` alongside the existing kind vocabulary.

- [ ] **Step 4: Serialize the group to the window**

Add to `ExportKindInfo` in `src-tauri/src/export/info.rs`:

```rust
pub group: ExportGroup,
```

Set it from the row:

```rust
group: kind.group,
```

Add to `ExportKindInfo` in `src/api/export.ts`:

```ts
export type ExportGroup = 'documents' | 'presentations' | 'other';

export interface ExportKindInfo {
  group: ExportGroup;
  // Existing fields remain.
}
```

- [ ] **Step 5: Run the focused tests**

Run:

```bash
cargo test every_kind_has_the_export_manager_group_that_owns_it
npx tsc --noEmit
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/export/kinds.rs src-tauri/src/export/info.rs \
  src-tauri/src/export/tests/kinds.rs src-tauri/src/export/mod.rs src/api/export.ts
git commit -m "feat(export): group kinds for the export manager"
```

---

### Task 2: Define the pure Export Manager rules

**Files:**
- Create: `src/ui/export/manager/manager_rules.ts`
- Create: `test/checks/check-export-manager-rules.mjs`

**Interfaces:**

```ts
export interface ManagerKindRow {
  info: ExportKindInfo;
  packages: TemplateSummary[];
  broken: number;
}

export interface ManagerGroup {
  group: ExportGroup;
  rows: ManagerKindRow[];
}

export interface PackageActionAvailability {
  importPackage: boolean;
  createPackage: boolean;
  use: boolean;
  details: boolean;
  duplicate: boolean;
  edit: boolean;
  validate: boolean;
  testPdf: boolean;
  remove: boolean;
}

export interface DefaultsActionAvailability {
  edit: boolean;
  restore: boolean;
}

export function managerGroups(
  kinds: ExportKindInfo[],
  packages: TemplateSummary[]
): ManagerGroup[];

export function unassignedPackages(
  kinds: ExportKindInfo[],
  packages: TemplateSummary[]
): TemplateSummary[];

export function packageActionAvailability(
  info: ExportKindInfo,
  pandoc: string | null,
  inspected: TemplateSummary | null
): PackageActionAvailability;

export function defaultsActionAvailability(
  info: ExportKindInfo
): DefaultsActionAvailability;
```

- [ ] **Step 1: Write the failing pure-rule check**

Create `test/checks/check-export-manager-rules.mjs` following the bundling pattern in
`check-session-rules.mjs`:

```js
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-export-manager-'));

async function bundleModule(input, name) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const rules = await bundleModule(
  'src/ui/export/manager/manager_rules.ts',
  'manager_rules'
);

const failures = [];
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
};

const kind = (name, group, overrides = {}) => ({
  kind: name,
  group,
  extension: name === 'latex' ? 'tex' : name,
  name_suffix: '',
  needs_pandoc: name !== 'markdown',
  takes_a_title: false,
  needs_a_language: false,
  names_its_body: false,
  carries_pictures: false,
  takes_a_page_size: false,
  paper_sizes: [],
  config_path: `/config/export.${name}.yaml`,
  config_exists: true,
  config_is_shipped: true,
  template_mode: ['revealjs', 'beamer', 'markdown'].includes(name) ? 'none' : 'text',
  ...overrides
});

const summary = (id, kindName, broken = false) => ({
  id,
  path: `/templates/${id}`,
  manifest: broken
    ? null
    : {
        schema: 1,
        id,
        name: id,
        kind: kindName,
        mode: 'template',
        origin: { type: 'folder' },
        template: 'template.tex',
        reference_doc: null,
        csl: null,
        assets: [],
        deliver: []
      },
  error: broken ? 'template.json is unreadable' : null,
  files: [{ name: 'template.tex', size: 12, editable: !broken }]
});

const kinds = [
  kind('docx', 'documents'),
  kind('latex', 'documents'),
  kind('revealjs', 'presentations'),
  kind('markdown', 'other')
];
const packages = [
  summary('alpha', 'docx'),
  summary('alpha-copy', 'docx'),
  summary('broken-docx', 'docx', true),
  summary('unreadable', 'unknown', true)
];

check(
  'groups follow the kind order and count broken packages',
  rules.managerGroups(kinds, packages).map((group) => ({
    group: group.group,
    rows: group.rows.map((row) => [row.info.kind, row.packages.map((item) => item.id), row.broken])
  })),
  [
    {
      group: 'documents',
      rows: [
        ['docx', ['alpha', 'alpha-copy'], 1],
        ['latex', [], 0]
      ]
    },
    {
      group: 'presentations',
      rows: [['revealjs', [], 0]]
    },
    {
      group: 'other',
      rows: [['markdown', [], 0]]
    }
  ]
);
check(
  'a broken package with no readable kind is unassigned once',
  rules.unassignedPackages(kinds, packages).map((item) => item.id),
  ['unreadable']
);
check(
  'a readable package can be inspected, used, edited, validated and removed',
  rules.packageActionAvailability(kinds[0], '/bin/pandoc', packages[0]),
  {
    importPackage: true,
    createPackage: true,
    use: true,
    details: true,
    duplicate: true,
    edit: true,
    validate: true,
    testPdf: false,
    remove: true
  }
);
check(
  'a broken package remains inspectable and removable but not usable',
  rules.packageActionAvailability(kinds[0], '/bin/pandoc', packages[2]),
  {
    importPackage: true,
    createPackage: true,
    use: false,
    details: true,
    duplicate: false,
    edit: false,
    validate: false,
    testPdf: false,
    remove: true
  }
);
check(
  'without pandoc local package work remains and execution is disabled',
  rules.packageActionAvailability(kinds[0], null, packages[0]),
  {
    importPackage: true,
    createPackage: false,
    use: true,
    details: true,
    duplicate: true,
    edit: true,
    validate: false,
    testPdf: false,
    remove: true
  }
);
check(
  'a kind without template support has no package actions',
  rules.packageActionAvailability(kinds[2], '/bin/pandoc', null),
  {
    importPackage: false,
    createPackage: false,
    use: false,
    details: false,
    duplicate: false,
    edit: false,
    validate: false,
    testPdf: false,
    remove: false
  }
);
check(
  'defaults can be edited whenever the kind has a file and restored only when it differs',
  {
    plain: rules.defaultsActionAvailability(kinds[0]),
    custom: rules.defaultsActionAvailability(
      kind('docx', 'documents', { config_is_shipped: false })
    ),
    markdown: rules.defaultsActionAvailability(kinds[3])
  },
  {
    plain: { edit: true, restore: false },
    custom: { edit: true, restore: true },
    markdown: { edit: false, restore: false }
  }
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('export manager rules: all checks passed');
```

- [ ] **Step 2: Run the check and verify it fails**

Run:

```bash
node test/checks/check-export-manager-rules.mjs
```

Expected: FAIL because `manager_rules.ts` does not exist.

- [ ] **Step 3: Implement the pure rules**

Create `src/ui/export/manager/manager_rules.ts`:

```ts
/**
 * Which kind and package actions the Export Manager can offer.
 *
 * May import: export-kind/template vocabulary types only. Upholds: compatibility, grouping and
 * action availability are decided once for every renderer.
 */
import type { ExportGroup, ExportKindInfo } from '../../../api/export';
import type { TemplateSummary } from '../../../api/templates';

export interface ManagerKindRow {
  info: ExportKindInfo;
  packages: TemplateSummary[];
  broken: number;
}

export interface ManagerGroup {
  group: ExportGroup;
  rows: ManagerKindRow[];
}

export interface PackageActionAvailability {
  importPackage: boolean;
  createPackage: boolean;
  use: boolean;
  details: boolean;
  duplicate: boolean;
  edit: boolean;
  validate: boolean;
  testPdf: boolean;
  remove: boolean;
}

export interface DefaultsActionAvailability {
  edit: boolean;
  restore: boolean;
}

const GROUPS: readonly ExportGroup[] = ['documents', 'presentations', 'other'];

export function managerGroups(
  kinds: ExportKindInfo[],
  packages: TemplateSummary[]
): ManagerGroup[] {
  return GROUPS.map((group) => ({
    group,
    rows: kinds
      .filter((kind) => kind.group === group)
      .map((info) => {
        const compatible = packages.filter(
          (summary) => summary.manifest?.kind === info.kind
        );
        return {
          info,
          packages: compatible,
          broken: compatible.filter((summary) => summary.error !== null).length
        };
      })
  })).filter((group) => group.rows.length > 0);
}

export function unassignedPackages(
  kinds: ExportKindInfo[],
  packages: TemplateSummary[]
): TemplateSummary[] {
  const known = new Set(kinds.map((kind) => kind.kind));
  return packages.filter(
    (summary) => summary.manifest === null || !known.has(summary.manifest.kind)
  );
}

export function packageActionAvailability(
  info: ExportKindInfo,
  pandoc: string | null,
  inspected: TemplateSummary | null
): PackageActionAvailability {
  const supported = info.template_mode !== 'none';
  const manifest = inspected?.manifest ?? null;
  const readable = manifest !== null;
  const compatible = readable && manifest.kind === info.kind;
  const hasEditableFile = inspected?.files.some((file) => file.editable) === true;
  return {
    importPackage: supported,
    createPackage: supported && pandoc !== null,
    use: compatible,
    details: supported && inspected !== null,
    duplicate: supported && readable,
    edit: supported && readable && hasEditableFile,
    validate: supported && readable && pandoc !== null,
    testPdf:
      supported &&
      readable &&
      pandoc !== null &&
      manifest.kind === 'pdf',
    remove: supported && inspected !== null
  };
}

export function defaultsActionAvailability(
  info: ExportKindInfo
): DefaultsActionAvailability {
  return {
    edit: info.needs_pandoc && info.config_path !== '',
    restore:
      info.needs_pandoc &&
      info.config_path !== '' &&
      info.config_exists &&
      !info.config_is_shipped
  };
}
```

- [ ] **Step 4: Run the check and TypeScript**

Run:

```bash
node test/checks/check-export-manager-rules.mjs
npx tsc --noEmit
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/ui/export/manager/manager_rules.ts test/checks/check-export-manager-rules.mjs
git commit -m "feat(export): add export manager rules"
```

---

### Task 3: Extract the shared template package browser

**Files:**
- Create: `src/ui/export/templates/package_browser.ts`
- Modify: `src/ui/export/templates/library.ts`
- Modify: `src/ui/export/export_dialog.ts`

**Interfaces:**

```ts
export interface PackageBrowserState {
  info: ExportKindInfo;
  packages: TemplateSummary[];
  activeId: string | null;
  inspectedId: string | null;
  pandoc: string | null;
  primaryLabel: string;
}

export interface PackageBrowserHandlers {
  inspect(id: string | null): void;
  primary(id: string | null): void;
  changed(packages: TemplateSummary[], keepId: string | null): void;
}

export class TemplatePackageBrowser extends BaseComponent {
  constructor(handlers: PackageBrowserHandlers);
  update(state: PackageBrowserState): void;
  inspectedId(): string | null;
}
```

- [ ] **Step 1: Establish the green chooser baseline**

Run:

```bash
npm run probe -- --with-workspace test/probes/export-template-ui.js
npm run probe -- --with-workspace test/probes/export-template-import.js
```

Expected: both probes pass before the extraction. These are the regression beacons for the shared
browser; no new behavior is introduced in this task.

- [ ] **Step 2: Move package-row rendering into the browser**

Create `src/ui/export/templates/package_browser.ts` containing:

- the current Pandoc-default row;
- the current compatible readable package rows and kind-known broken package rows;
- active and inspected visual states;
- action buttons whose availability comes from
  `packageActionAvailability`;
- `Import file`, `Import folder`, `Create`, `Duplicate`, `Details`, `Edit`, `Validate`, `Test PDF`
  and `Remove`;
- an optional primary button labelled by `state.primaryLabel`.

Use these stable test hooks already used or planned:

```ts
row.dataset.templatePackage = summary.id;
row.dataset.templatePackageId = summary.id;
row.dataset.templateActive = String(summary.id === state.activeId);
row.dataset.templateInspected = String(summary.id === state.inspectedId);
row.dataset.templatePrimary = 'true';
```

The browser calls `handlers.changed(nextPackages, keepId)` after package operations. It never writes
`export_templates`; the chooser settles a value and the manager persists one through its own
handler.

- [ ] **Step 3: Make the existing chooser wrap the browser**

Reduce `TemplateLibraryDialog` to:

- a `QuestionCard<TemplateChoice | null>` shell;
- an `ask(info: ExportKindInfo, selected: string | null, pandoc: string | null)` signature;
- calls to `exportTemplates()`;
- `TemplatePackageBrowser.update(...)` with an empty `activeId`;
- `primaryLabel: t('template.use')`;
- handlers:

```ts
inspect: (id) => {
  this.selected = id;
  this.browser.update(this.state());
},
primary: (id) => this.settle({ id }),
changed: (packages, keepId) => {
  this.packages = packages;
  this.selected = keepId;
  this.browser.update(this.state());
}
```

Update the one caller in `export_dialog.ts`:

```ts
const choice = await templateLibraryDialog.ask(
  info,
  this.selectedTemplateId,
  this.question?.pandoc ?? null
);
```

Preserve all existing `data-template-*` selectors and the chooser's default-row behavior.

- [ ] **Step 4: Run the chooser regression probes**

Run:

```bash
npx tsc --noEmit
npm run probe -- --with-workspace test/probes/export-template-ui.js
npm run probe -- --with-workspace test/probes/export-template-import.js
```

Expected: all exit 0 with the same observable behavior as the baseline.

- [ ] **Step 5: Commit**

```bash
git add src/ui/export/templates/package_browser.ts src/ui/export/templates/library.ts
git add src/ui/export/export_dialog.ts
git commit -m "refactor(export): share the template package browser"
```

---

### Task 4: Add the Export Manager surface, native menu and defaults

**Files:**
- Create: `src/ui/export/manager/export_manager.ts`
- Create: `src/ui/export/manager/kind_page.ts`
- Create: `src/ui/export/manager/export_manager_flow.ts`
- Create: `test/probes/export-manager.js`
- Modify: `src/ui/export/templates/editor.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/markdown/commands/registry.ts`
- Modify: `src/ui/markdown/commands/menu.ts`
- Modify: `src/services/app_events.ts`
- Modify: `src-tauri/src/menu.rs`
- Modify: all eight locale JSON files

**Interfaces:**

```ts
export class ExportManager extends FloatingSurface {
  constructor(source?: ExportManagerSource);
  open(onClose: () => void): Promise<void>;
  requestClose(): Promise<void>;
}

export const exportManager: ExportManager;

export interface ExportManagerSnapshot {
  pandoc: string | null;
  kinds: ExportKindInfo[];
  packages: TemplateSummary[];
  exportTemplates: Record<string, string>;
}

export interface ExportManagerSource {
  load(): Promise<ExportManagerSnapshot>;
  updateTemplates(exportTemplates: Record<string, string>): Promise<void>;
  restoreDefaults(kind: string): Promise<string>;
}

export const liveExportManagerSource: ExportManagerSource;

export interface ExportManagerHost {
  focusEditor(): void;
}

export function registerExportManagerCommand(host: ExportManagerHost): void;
```

`KindPage.update()` receives export-kind facts, current packages and config. In this task it renders
the summary, defaults region and unsupported-kind explanation; package management is added in Task
5.

- [ ] **Step 1: Write the failing manager shell probe**

Create `test/probes/export-manager.js`:

```js
/**
 * The Export Manager: its native-menu event, kind sidebar, defaults and unsupported states.
 *
 * @needs-workspace — export-kind information names fixture/user export files.
 */
(async () => {
  const t = window.__t;
  const { t: words } = await t.app('/src/services/i18n.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const manager = () => document.querySelector('[data-export-manager]');
  const visible = (element) =>
    element !== null && !element.classList.contains('hidden');
  const kindButton = (kind) =>
    document.querySelector(`[data-export-manager-kind="${CSS.escape(kind)}"]`);
  const text = () => manager()?.textContent ?? '';
  const openManager = async () => {
    if (!visible(manager())) {
      await invoke('plugin:event|emit', { event: 'manage_export_templates' });
      await t.sleep(250);
    }
  };

  if (visible(manager())) {
    document.querySelector('[data-export-manager-close]')?.click();
    await t.sleep(120);
  }
  await openManager();

  check('the native menu event opens the manager', visible(manager()), {
    visible: visible(manager())
  });
  check(
    'the sidebar lists every kind in its group',
    [...document.querySelectorAll('[data-export-manager-kind]')].map(
      (row) => row.dataset.exportManagerKind
    ),
    ['docx', 'odt', 'latex', 'html', 'epub', 'pdf', 'revealjs', 'beamer', 'markdown']
  );
  check(
    'the first kind is selected and its summary is shown',
    kindButton('docx')?.getAttribute('aria-current') === 'true' &&
      text().includes(words('export.kind.docx')) &&
      text().includes(words('template.pandocDefault')),
    { first: kindButton('docx')?.getAttribute('aria-current'), text: text().slice(0, 160) }
  );

  kindButton('markdown')?.click();
  await t.sleep(120);
  check(
    'plain Markdown explains that it has neither defaults nor template packages',
    text().includes('Processed Markdown') &&
      text().includes('No conversion settings') &&
      text().includes('No template packages'),
    { text: text().slice(0, 240) }
  );

  kindButton('revealjs')?.click();
  await t.sleep(120);
  check(
    'Reveal.js has conversion settings but no template-package support',
    text().includes('Reveal.js') &&
      text().includes('Conversion settings') &&
      text().includes('Template packages are not supported'),
    { text: text().slice(0, 240) }
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
```

- [ ] **Step 2: Run the probe and verify it fails**

With the app running on the branch:

```bash
npm run probe -- --with-workspace test/probes/export-manager.js
```

Expected: FAIL because `manage_export_templates` is not mapped and no manager exists.

- [ ] **Step 3: Add the native File-menu event**

In `src-tauri/src/menu.rs`, immediately after the Export submenu item, add:

```rust
.item(
    &MenuItemBuilder::new(t(language, "menu.file.manageExportTemplates", &[]))
        .id("manage_export_templates")
        .build(app)?,
)
```

Handle the event:

```rust
"manage_export_templates" => {
    app_handle.emit("manage_export_templates", ()).unwrap();
}
```

Add the event to `AppEvents` as `manage_export_templates: null`.

- [ ] **Step 4: Add the command and menu mapping**

Add `'export:manageTemplates'` to `CommandId`.

Map it in `MENU_COMMANDS`:

```ts
manage_export_templates: 'export:manageTemplates'
```

Create `export_manager_flow.ts`:

```ts
export interface ExportManagerHost {
  focusEditor(): void;
}

export function registerExportManagerCommand(host: ExportManagerHost): void {
  registerCommand({
    id: 'export:manageTemplates',
    run: () => void exportManager.open(host.focusEditor)
  });
}
```

Call it from `src/main.ts` after the export command:

```ts
registerExportManagerCommand({ focusEditor: () => editor.focusText() });
```

- [ ] **Step 5: Build the manager surface and initial kind page**

`ExportManager` extends `FloatingSurface`, uses a veiled centred layout, and exposes:

```ts
element.dataset.exportManager = 'true';
```

It loads through the live source:

```ts
export const liveExportManagerSource: ExportManagerSource = {
  load: async () => {
    const [{ pandoc, kinds }, packages] = await Promise.all([
      exportKinds(),
      exportTemplates()
    ]);
    return {
      pandoc,
      kinds,
      packages,
      exportTemplates: configManager.get()?.export_templates ?? {}
    };
  },
  updateTemplates: async (exportTemplates) => {
    await configManager.update({ export_templates: exportTemplates });
  },
  restoreDefaults: async (kind) => await restoreExportConfig(kind)
};
```

It selects the first kind in catalogue order. The sidebar:

- uses `managerGroups(kinds, packages)`;
- renders localized group labels;
- renders one `button[data-export-manager-kind]` per kind;
- sets `aria-current="true"` on the selected row.

`KindPage` initially renders:

- the localized kind name;
- active package name or `template.pandocDefault`;
- defaults state: shipped, customized or not created;
- a **Conversion settings** region;
- an explicit unsupported explanation for Markdown and for package-less presentation kinds.

- [ ] **Step 6: Add defaults editing and restore**

Extend `TemplateEditorPanel.openDefaults`:

```ts
async openDefaults(
  kind: string,
  label: string,
  onClose: (() => void) | null = null
): Promise<void>
```

Store `onClose` in the existing callback field and call it from `close()` after the editor closes,
whether save happened or not.

In `KindPage`, render:

- `button[data-export-manager-edit-defaults]`;
- `button[data-export-manager-restore-defaults]`;
- `p[data-export-manager-defaults-state]`.

Edit calls:

```ts
void templateEditorPanel.openDefaults(kind, label, onClose);
```

Restore uses the app's question card, then:

```ts
await this.source.restoreDefaults(kind);
onRefresh();
```

Only show Restore when `defaultsActionAvailability(info).restore` is true.

- [ ] **Step 7: Add localized strings**

Add equivalent keys to all eight catalogues:

```json
"menu.file.manageExportTemplates": "Manage Export Templates…",
"exportManager.title": "Export Manager",
"exportManager.group.documents": "Documents",
"exportManager.group.presentations": "Presentations",
"exportManager.group.other": "Other",
"exportManager.group.unassigned": "Unassigned",
"exportManager.close": "Close",
"exportManager.summary": "Effective setup",
"exportManager.defaults": "Conversion settings",
"exportManager.templates": "Template packages",
"exportManager.shipped": "Shipped settings",
"exportManager.customized": "Customized settings",
"exportManager.notCreated": "Not created yet",
"exportManager.editDefaults": "Edit",
"exportManager.restoreDefaults": "Restore Shipped File",
"exportManager.noConversionSettings": "This export has no conversion-settings file.",
"exportManager.noTemplateSupport": "Template packages are not supported for this export kind.",
"exportManager.pandocMissing": "Pandoc was not found; actions that run it are unavailable.",
"exportManager.missingPackage": "Missing package · {id}",
"exportManager.retry": "Retry",
"exportManager.libraryFailed": "The template library could not be read: {message}",
"exportManager.selectionFailed": "The template selection could not be saved: {message}",
"template.inUse": "In use"
```

Translate the values rather than copying English into non-English catalogues.

- [ ] **Step 8: Run the manager probe**

Run:

```bash
npx tsc --noEmit
npm run probe -- --with-workspace test/probes/export-manager.js
```

Expected: PASS for the shell, first kind, Markdown and Reveal.js checks.

- [ ] **Step 9: Verify the native item and commit**

Inspect the File menu in the running macOS app:

```bash
osascript -e 'tell application "System Events" to tell process "yi" to get name of every menu item of menu "File" of menu bar 1'
```

Expected: the localized **Manage Export Templates…** item is present immediately after the Export
submenu.

Commit:

```bash
git add src-tauri/src/menu.rs src/services/app_events.ts \
  src/ui/markdown/commands/registry.ts src/ui/markdown/commands/menu.ts \
  src/main.ts src/ui/export/manager/export_manager.ts \
  src/ui/export/manager/kind_page.ts src/ui/export/manager/export_manager_flow.ts \
  src/ui/export/templates/editor.ts locales test/probes/export-manager.js
git commit -m "feat(export): add the export manager surface"
```

---

### Task 5: Add package inspection, activation and library actions

**Files:**
- Modify: `src/ui/export/manager/export_manager.ts`
- Modify: `src/ui/export/manager/kind_page.ts`
- Modify: `src/ui/export/templates/package_browser.ts`
- Modify: `test/probes/export-manager.js`

**Interfaces:**
- Consumes `managerGroups`, `unassignedPackages`, `packageActionAvailability`.
- Consumes `TemplatePackageBrowser.update(state)`.
- Produces manager-owned selection persistence:

```ts
private setActivePackage(kind: string, id: string | null): Promise<void>
```

- [ ] **Step 1: Extend the probe for inspection and activation**

Before the manager opens, create two HTML packages through the existing template API fixture:

```js
const templates = await t.app('/src/api/templates.ts');
const exportApi = await t.app('/src/api/export.ts');
const checkout = window.__probePaths.checkout;
const path = `${checkout}test/fixtures/templates/html-marker`;
const proposal = await templates.inspectTemplate(path);
const alpha = await templates.importTemplate({
  source: path,
  name: `Manager Alpha ${Date.now().toString(36)}`,
  kind: 'html',
  entry: proposal.entry,
  source_url: null,
  license: 'CC0-1.0',
  map_title: false,
  map_author: false
});
const beta = await templates.importTemplate({
  source: path,
  name: `Manager Beta ${Date.now().toString(36)}`,
  kind: 'html',
  entry: proposal.entry,
  source_url: null,
  license: 'CC0-1.0',
  map_title: false,
  map_author: false
});
```

Add checks:

```js
kindButton('html')?.click();
await t.sleep(120);
const alphaRow = document.querySelector(
  `[data-template-package="${CSS.escape(alpha.id)}"]`
);
alphaRow?.click();
await t.sleep(120);
const beforeUse = await invoke('get_config');
check(
  'inspecting a package does not activate it',
  (beforeUse.export_templates ?? {}).html === undefined &&
    alphaRow?.dataset.templateInspected === 'true' &&
    alphaRow?.dataset.templateActive === 'false',
  {
    active: alphaRow?.dataset.templateActive,
    inspected: alphaRow?.dataset.templateInspected,
    config: beforeUse.export_templates
  }
);

document.querySelector('[data-template-primary]')?.click();
await t.sleep(250);
const afterUse = await invoke('get_config');
check(
  'Use This Template persists the inspected package',
  afterUse.export_templates?.html === alpha.id &&
    document.querySelector(
      `[data-template-package="${CSS.escape(alpha.id)}"]`
    )?.dataset.templateActive === 'true',
  { configured: afterUse.export_templates?.html ?? null, expected: alpha.id }
);

document.querySelector('[data-template-default]')?.click();
document.querySelector('[data-template-primary]')?.click();
await t.sleep(250);
const cleared = await invoke('get_config');
check(
  'Pandoc’s default clears the kind selection',
  cleared.export_templates?.html === undefined,
  { configured: cleared.export_templates?.html ?? null }
);
```

Add cleanup helpers that remove both probe-created packages and restore the prior config. The
harness already snapshots config and export settings; keep package cleanup local to the probe:

```js
const created = [alpha.id, beta.id];
const priorTemplates = (await invoke('get_config')).export_templates ?? {};
const cleanupPackages = async (ids, exportTemplates) => {
  await invoke('set_config', {
    cfg: {
      ...(await invoke('get_config')),
      export_templates: exportTemplates
    }
  });
  const { configManager } = await t.app('/src/services/config_manager.ts');
  await configManager.load();
  for (const id of ids) {
    try {
      await templates.removeTemplate(id);
    } catch {
      // Already removed by the probe.
    }
  }
};
```

The implementation of this task wraps manager opening and package checks in
`try { ... } finally { await cleanupPackages(created, priorTemplates); }`.

- [ ] **Step 2: Run the probe and verify the new checks fail**

Run:

```bash
npm run probe -- --with-workspace test/probes/export-manager.js
```

Expected: FAIL because the manager kind page does not yet render package rows or a primary action.

- [ ] **Step 3: Integrate the package browser into the kind page**

`KindPage` receives:

```ts
interface KindPageHandlers {
  inspect(id: string | null): void;
  activate(id: string | null): void;
  packagesChanged(packages: TemplateSummary[], keepId: string | null): void;
  refresh(): Promise<void>;
}
```

It passes `TemplatePackageBrowser`:

```ts
{
  info,
  packages,
  activeId,
  inspectedId,
  pandoc,
  primaryLabel: t('template.use')
}
```

The manager keeps `inspectedId` per open manager session. Changing kind resets inspection to the
active package, or Pandoc's default when there is no active package.

- [ ] **Step 4: Persist activations through `configManager.update`**

Implement:

```ts
private async setActivePackage(kind: string, id: string | null): Promise<void> {
  const current = configManager.get();
  if (current === null) {
    return;
  }
  const remembered = { ...(current.export_templates ?? {}) };
  if (id === null) {
    delete remembered[kind];
  } else {
    remembered[kind] = id;
  }
  await this.source.updateTemplates(remembered);
  this.config = remembered;
  this.render();
}
```

On failure, leave `this.config` unchanged and show the backend error in the manager's status line.

- [ ] **Step 5: Verify the export card consumes the manager's choice**

Use `exportNote`'s existing config read in the probe by emitting `export` with payload `html` and
checking `[data-export-dialog]` contains the activated package name. Close the card without running
the export. Close the manager first so the export card is the top surface.

- [ ] **Step 6: Run the focused tests**

Run:

```bash
npx tsc --noEmit
node test/checks/check-export-manager-rules.mjs
npm run probe -- --with-workspace test/probes/export-manager.js
npm run probe -- --with-workspace test/probes/export-template-ui.js
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/ui/export/manager/export_manager.ts \
  src/ui/export/manager/kind_page.ts src/ui/export/templates/package_browser.ts \
  test/probes/export-manager.js
git commit -m "feat(export): manage template selection in the export manager"
```

---

### Task 6: Handle broken, missing and unassigned packages

**Files:**
- Modify: `src/ui/export/manager/export_manager.ts`
- Modify: `src/ui/export/manager/kind_page.ts`
- Modify: `src/ui/export/templates/package_browser.ts`
- Modify: `src/ui/export/templates/details.ts`
- Modify: `test/probes/export-manager.js`

**Interfaces:**
- Consumes `unassignedPackages(kinds, packages)`.
- Consumes `TemplateSummary.error`, `TemplateSummary.path`, and the active package id.
- Consumes the injectable `ExportManagerSource`.
- Produces no new backend command.

- [ ] **Step 1: Extend the probe with broken and missing states**

Create an unassigned broken package under the app's template directory by writing a directory with
an invalid `template.json`. Build the path from the PDF defaults file's parent:

```js
const pdfConfig = await templates.exportConfigPath('pdf');
const templateRoot = `${pdfConfig.replace(/[\\/][^\\/]+$/, '')}/templates`;
const brokenId = `manager-broken-${Date.now().toString(36)}`;
await files.createEntry(templateRoot, brokenId, false);
await files.writeTextAtomically(
  `${templateRoot}/${brokenId}/template.json`,
  '{"schema":99}'
);
```

Extend the final probe cleanup with:

```js
try {
  await files.deleteEntry(`${templateRoot}/${brokenId}`);
} catch {
  // Already removed.
}
```

Add checks:

```js
await openManager();
check(
  'an unreadable package appears once in Unassigned',
  document.querySelector('[data-export-manager-kind="unassigned"]') !== null &&
    document.querySelector(
      `[data-template-package="${CSS.escape(brokenId)}"]`
    ) !== null,
  { brokenId }
);
document.querySelector('[data-export-manager-kind="unassigned"]')?.click();
await t.sleep(120);
check(
  'a broken package can be inspected and removed but not used',
  document.querySelector(
    `[data-template-package="${CSS.escape(brokenId)}"]`
  ) !== null &&
    document.querySelector('[data-template-primary]') === null &&
    document.querySelector('[data-template-details-button]') !== null &&
    document.querySelector('[data-template-remove]') !== null,
  {
    primary: document.querySelector('[data-template-primary]') !== null,
    details: document.querySelector('[data-template-details-button]') !== null,
    remove: document.querySelector('[data-template-remove]') !== null
  }
);
document.querySelector('[data-template-details-button]')?.click();
await t.sleep(120);
check(
  'broken details show the id, path and reason without an editable form',
  document.querySelector('[data-broken-template-details]')?.textContent?.includes(brokenId) === true &&
    document.querySelector('[data-broken-template-details]')?.textContent?.includes('schema') === true,
  {
    details: document.querySelector('[data-broken-template-details]')?.textContent?.slice(0, 200) ?? null
  }
);
```

Close and reopen the manager after writing config for `docx` pointing to a missing id:

```js
await configManager.update({
  export_templates: {
    ...(configManager.get()?.export_templates ?? {}),
    docx: 'missing-manager-package'
  }
});
document.querySelector('[data-export-manager-close]')?.click();
await t.sleep(120);
await openManager();
```

Refresh the manager and assert:

```js
check(
  'a missing active package is named and can be cleared',
  text().includes('Missing package') &&
    text().includes('missing-manager-package'),
  { text: text().slice(0, 240) }
);
```

Add an active-package removal check using the second HTML package:

```js
await openManager();
document.querySelector('[data-export-manager-kind="html"]')?.click();
await t.sleep(120);
document.querySelector(
  `[data-template-package="${CSS.escape(beta.id)}"]`
)?.click();
document.querySelector('[data-template-primary]')?.click();
await t.sleep(200);
document.querySelector('[data-template-remove]')?.click();
await t.sleep(100);
document.querySelector('[data-prompt-yes]')?.click();
await t.sleep(250);
const afterRemoval = await invoke('get_config');
check(
  'removing the active package clears its selection',
  afterRemoval.export_templates?.html === undefined &&
    document.querySelector(
      `[data-template-package="${CSS.escape(beta.id)}"]`
    ) === null,
  {
    configured: afterRemoval.export_templates?.html ?? null,
    remains: document.querySelector(
      `[data-template-package="${CSS.escape(beta.id)}"]`
    ) !== null
  }
);
```

Add an injected failure check for the package-library load and config write. Instantiate a second
manager with a source whose `load` rejects, and another whose `updateTemplates` rejects:

```js
const { ExportManager } = await t.app('/src/ui/export/manager/export_manager.ts');
const failedLoad = new ExportManager({
  load: async () => {
    throw new Error('probe library failure');
  },
  updateTemplates: async () => {},
  restoreDefaults: async () => ''
});
failedLoad.open(() => {});
await t.sleep(120);
check(
  'a package-library read failure is shown with a retry action',
  failedLoad.element.textContent?.includes('probe library failure') === true &&
    failedLoad.element.querySelector('[data-export-manager-retry]') !== null,
  { text: failedLoad.element.textContent?.slice(0, 200) ?? null }
);
failedLoad.requestClose();
```

For the write failure, create a source whose `load` returns a valid snapshot and whose
`updateTemplates` rejects:

```js
const { kinds } = await exportApi.exportKinds();
const packages = await templates.exportTemplates();
const snapshot = {
  pandoc: '/bin/pandoc',
  kinds,
  packages,
  exportTemplates: {}
};
const failedSave = new ExportManager({
  load: async () => structuredClone(snapshot),
  updateTemplates: async () => {
    throw new Error('probe config failure');
  },
  restoreDefaults: async () => ''
});
await failedSave.open(() => {});
failedSave.element
  .querySelector('[data-export-manager-kind="html"]')
  ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
await t.sleep(120);
failedSave.element
  .querySelector(`[data-template-package="${CSS.escape(alpha.id)}"]`)
  ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
failedSave.element
  .querySelector('[data-template-primary]')
  ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
await t.sleep(150);
check(
  'a failed config write leaves the active selection unchanged and reports the error',
  snapshot.exportTemplates.html === undefined &&
    failedSave.element.textContent?.includes('probe config failure') === true &&
    failedSave.element
      .querySelector(`[data-template-package="${CSS.escape(alpha.id)}"]`)
      ?.getAttribute('data-template-active') === 'false',
  {
    configured: snapshot.exportTemplates.html ?? null,
    text: failedSave.element.textContent?.slice(0, 200) ?? null
  }
);
await failedSave.requestClose();
```

- [ ] **Step 2: Run the probe and verify it fails**

Run:

```bash
npm run probe -- --with-workspace test/probes/export-manager.js
```

Expected: FAIL because Unassigned, broken details, missing-active handling and injected failure
states are not implemented.

- [ ] **Step 3: Add the conditional Unassigned row**

When `unassignedPackages(kinds, packages)` is non-empty, append a sidebar button:

```ts
button.dataset.exportManagerKind = 'unassigned';
button.textContent = t('exportManager.group.unassigned');
```

Its page renders only package identity, path, error and Remove. It has no defaults section and no
primary activation button.

- [ ] **Step 4: Add read-only broken details**

In `details.ts`, export:

```ts
export function showBrokenTemplateDetails(summary: TemplateSummary): void
```

It displays:

```ts
summary.id
summary.path
summary.error
```

and a Close action. It never calls `updateTemplate`.

The package browser chooses this surface whenever `summary.manifest === null`; readable packages
continue to use the existing editable details dialog.

- [ ] **Step 5: Render missing active packages**

When `activeId` does not resolve to a package summary, show:

```ts
missing.dataset.templateMissing = activeId;
missing.textContent = t('exportManager.missingPackage', { id: activeId });
```

Keep Pandoc's default row available as the way to clear the missing config value.

- [ ] **Step 6: Add retry and write-failure status**

When `source.load()` rejects:

- render `p[data-export-manager-error]` with the error's sentence;
- render `button[data-export-manager-retry]`;
- do not leave stale kind controls enabled.

Retry calls `this.load()` again.

When `source.updateTemplates()` rejects:

- keep `this.config` as it was before the attempted change;
- render the error in `[data-export-manager-status]`;
- leave the previous active marker intact.

When `packagesChanged` no longer contains the active id, first persist removal of that kind's
selection through `source.updateTemplates`, then reload the package summaries. If clearing the
selection fails, keep the old active id and report the write error.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npx tsc --noEmit
node test/checks/check-export-manager-rules.mjs
npm run probe -- --with-workspace test/probes/export-manager.js
```

Expected: all exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/ui/export/manager/export_manager.ts \
  src/ui/export/manager/kind_page.ts src/ui/export/templates/package_browser.ts \
  src/ui/export/templates/details.ts test/probes/export-manager.js
git commit -m "feat(export): handle broken packages in the export manager"
```

---

### Task 7: Finish defaults, keyboard layering and focus behavior

**Files:**
- Modify: `src/ui/export/manager/export_manager.ts`
- Modify: `src/ui/export/manager/kind_page.ts`
- Modify: `src/ui/export/templates/editor.ts`
- Modify: `test/probes/export-manager.js`

**Interfaces:**
- Produces `TemplateEditorPanel.requestClose(): Promise<void>`.
- Produces manager close callback stored as `onClose: (() => void) | null`.

- [ ] **Step 1: Add failing probe checks for defaults and Escape**

Close and reopen the manager, then add to `export-manager.js`:

```js
await openManager();
kindButton('docx')?.click();
await t.sleep(120);
document.querySelector('[data-export-manager-edit-defaults]')?.click();
await t.sleep(250);
check(
  'Edit opens the defaults YAML in the code editor',
  document.querySelector('[data-template-editor]')?.classList.contains('hidden') === false &&
    document
      .querySelector('[data-template-editor-title]')
      ?.textContent?.includes(words('export.kind.docx')),
  {
    open: document.querySelector('[data-template-editor]')?.classList.contains('hidden') === false,
    title: document.querySelector('[data-template-editor-title]')?.textContent ?? null
  }
);

t.scroller().dispatchEvent(
  new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
);
await t.sleep(180);
check(
  'Escape closes the editor first and leaves the manager open',
  document.querySelector('[data-template-editor]')?.classList.contains('hidden') === true &&
    visible(manager()),
  {
    editorOpen: document.querySelector('[data-template-editor]')?.classList.contains('hidden') === false,
    managerOpen: visible(manager())
  }
);

t.scroller().dispatchEvent(
  new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
);
await t.sleep(180);
check(
  'the next Escape closes the manager',
  visible(manager()) === false &&
    document.activeElement?.classList.contains('markdown-composition-input') === true,
  {
    managerOpen: visible(manager()),
    active: document.activeElement?.className ?? null
  }
);
```

Add the same layering check for a package file editor:

```js
await openManager();
document.querySelector('[data-export-manager-kind="html"]')?.click();
await t.sleep(120);
document.querySelector(
  `[data-template-package="${CSS.escape(alpha.id)}"]`
)?.click();
document.querySelector('[data-template-edit]')?.click();
await t.sleep(200);
t.scroller().dispatchEvent(
  new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
);
await t.sleep(180);
check(
  'a package editor closes before its manager',
  document.querySelector('[data-template-editor]')?.classList.contains('hidden') === true &&
    visible(manager()),
  {
    editorOpen: document.querySelector('[data-template-editor]')?.classList.contains('hidden') === false,
    managerOpen: visible(manager())
  }
);
```

Restore a customized defaults copy and add a Restore check:

```js
const original = await templates.exportConfigText('docx');
const configPath = await templates.exportConfigPath('docx');
await templates.saveExportConfigText('docx', `${original}\n# manager probe\n`);
await invoke('plugin:event|emit', { event: 'manage_export_templates' });
await t.sleep(250);
document.querySelector('[data-export-manager-restore-defaults]')?.click();
await t.sleep(100);
document.querySelector('[data-prompt-yes]')?.click();
await t.sleep(250);
check(
  'Restore Shipped File restores the app copy',
  (await templates.exportConfigText('docx')) === original,
  { restored: (await templates.exportConfigText('docx')) === original }
);
```

Wrap the original defaults text in `try/finally` and write it back before the probe reports.

- [ ] **Step 2: Run the probe and verify it fails**

Run:

```bash
npm run probe -- --with-workspace test/probes/export-manager.js
```

Expected: FAIL because editor layering, callback refresh and focus return are incomplete.

- [ ] **Step 3: Expose editor close and completion callback**

Make `TemplateEditorPanel` expose:

```ts
async requestClose(): Promise<void> {
  await this.close();
}
```

Refactor the existing `close()` so both its own Escape listener and `requestClose()` use the same
dirty-check path.

Task 4 already stores and invokes the `openDefaults` callback. This task only routes all close paths
through `requestClose()` so that callback still runs.

- [ ] **Step 4: Make Escape stack-aware**

Add a manager document keydown listener in capture phase:

```ts
document.addEventListener(
  'keydown',
  (event) => {
    if (
      event.key === 'Escape' &&
      this.isOpen() &&
      templateEditorPanel.isOpen()
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void templateEditorPanel.requestClose();
    }
  },
  true
);
```

The editor's existing Escape still handles the case where no manager is open. The manager's own
`FloatingSurface` Escape closes it only after the editor is closed.

- [ ] **Step 5: Restore focus on close**

The manager stores the callback passed to `open(onClose)`. Its `requestClose()`:

```ts
async requestClose(): Promise<void> {
  if (templateEditorPanel.isOpen()) {
    await templateEditorPanel.requestClose();
    return;
  }
  this.close();
  const callback = this.onClose;
  this.onClose = null;
  callback?.();
}
```

`FloatingSurface` Escape must call `requestClose()` for this surface. Override `close()` so direct
Close-button use also performs the callback exactly once.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx tsc --noEmit
npm run probe -- --with-workspace test/probes/export-manager.js
npm run probe -- test/probes/documentation.js
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/ui/export/manager/export_manager.ts \
  src/ui/export/manager/kind_page.ts src/ui/export/templates/editor.ts \
  test/probes/export-manager.js
git commit -m "fix(export): layer editor and manager escape behavior"
```

---

### Task 8: Document and demonstrate the Export Manager

**Files:**
- Modify: all eight `src/ui/documentation/documentation.*.md`
- Modify: `test/fixtures/workspace/default-document.md`
- Modify: `test/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/ai-context.md`

**Interfaces:**
- No code interface changes.

- [ ] **Step 1: Write the English guide section**

Add after the existing export-template package introduction:

```markdown
### Managing export templates

Choose **File → Manage Export Templates…** to manage every export kind in one place.
For each kind, the manager shows the conversion settings file (`export.{kind}.yaml`), the
template package selected for exports, and the compatible packages in your library.

The conversion settings are the base for every export of that kind. A selected package may
provide its own `export.yaml` or `defaults.yaml`; package settings apply after the app settings.
Choices made in the export card, such as page size or citation-list suppression, apply only to
that export.

Selecting a package row inspects it without changing your export. Choose **Use This Template** to
make it the active package, or choose **Pandoc’s default** to use no package. You can import,
create, duplicate, inspect, edit, validate, test and remove packages from the same window.

**Restore Shipped File** replaces the kind’s conversion settings with the copy shipped by this
build. It is offered only when your copy differs. Reveal.js and Beamer have conversion settings
but do not accept template packages. Processed Markdown has neither.
```

- [ ] **Step 2: Translate the same section into the other seven guides**

Keep the same commands, file names, kind names and package/default distinction. Translate the
explanatory prose; do not invent different behavior for a locale.

- [ ] **Step 3: Add the default fixture pointer**

Add near the top of `test/fixtures/workspace/default-document.md`:

```markdown
## Export setup

Choose **File → Manage Export Templates…** to manage each export kind's conversion settings and
template packages together. Selecting a package inspects it; **Use This Template** makes it the
package exports of that kind will use.
```

- [ ] **Step 4: Update test and architecture maps**

In `test/README.md`, add `export-manager` beside the export probes and state exactly what it covers:
menu event, sidebar, defaults, package inspection/activation, broken/unassigned packages,
unsupported kinds, Escape layering and focus return.

In `docs/architecture.md`, add the manager's row or extend the export row with:

- manager surface and kind page;
- shared package browser;
- defaults/package/selection ownership;
- export-card transient boundary.

In `docs/ai-context.md`, record:

- the File-menu entry and command event;
- the package browser as one implementation used by chooser and manager;
- the persistent/transient split.

- [ ] **Step 5: Run documentation and locale checks**

Run:

```bash
npm run check
npx tsc --noEmit
cargo test
```

Expected: all exit 0; locale catalogues have identical keys.

- [ ] **Step 6: Commit**

```bash
git add src/ui/documentation test/fixtures/workspace/default-document.md test/README.md \
  docs/architecture.md docs/ai-context.md
git commit -m "docs(export): explain the export manager"
```

---

### Task 9: Prove the complete feature

**Files:**
- No planned source edits.
- Fix affected files only if the verification finds a real regression.

**Interfaces:**
- Consumes every interface produced by Tasks 1–8.

- [ ] **Step 1: Run the focused pure and compile checks**

Run:

```bash
npx tsc --noEmit
cargo test
npm run check
node test/checks/check-export-manager-rules.mjs
```

Expected: all exit 0.

- [ ] **Step 2: Run the complete Export Manager probe**

Run:

```bash
npm run probe -- --with-workspace test/probes/export-manager.js
```

Expected:

- all checks pass;
- config, export settings and session are restored;
- no probe-created packages remain;
- the manager is closed at the end.

- [ ] **Step 3: Run affected existing probes**

Run each separately:

```bash
npm run probe -- --with-workspace test/probes/export-template-ui.js
npm run probe -- --with-workspace test/probes/export-template-import.js
npm run probe -- test/probes/export-docx.js
npm run probe -- test/probes/export-pdf.js
npm run probe -- test/probes/export-pandoc-arguments.js
npm run probe -- test/probes/documentation.js
```

Expected: all exit 0.

- [ ] **Step 4: Run the full probe suite**

Run:

```bash
npm run probe:all
```

Expected: every non-skipped probe passes. Investigate any failure instead of assuming it is unrelated.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --check
git status --short --branch
git diff --stat main
```

Expected: no whitespace errors, no unexpected files, and every changed file belongs to the Export
Manager feature.

- [ ] **Step 6: Commit verification fixes if needed**

Only if Step 4 required a source or test correction:

```bash
git diff --name-only -z | xargs -0 git add
git commit -m "fix(export): finish export manager verification"
```

If no correction was needed, do not create an empty commit.
