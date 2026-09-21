# Markdown editor clean-up, P0 (safety net, fixtures, docs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repository safe to open-source: tests a stranger can run, a committed fixture workspace that looks like a real notes folder, CI, a licence, and an AI-readable context pack — with no change to what the editor does.

**Architecture:** Move the existing test harness into `test/` (checks, probes, fixtures), point the app and the probes at the fixture workspace, extract the demo document into a fixture, then add the contributor docs and CI. Every task preserves behaviour and ends with `npx tsc --noEmit`, `npm run check`, and the probes it names.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, rolldown (the checks bundle modules with it), Node 20+, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-21-markdown-editor-architecture-design.md`

## Global Constraints

- Node 20 or newer; `npm ci` must give CI everything it needs.
- No new runtime dependencies; dev-only tooling is allowed.
- Tests live under `test/`; `test/fixtures/workspace/` is the committed notes folder.
- Licence: MIT for code; the fixture notes' content licence (CC BY 4.0) is recorded in the fixtures README.
- Behaviour is preserved: no task changes what the editor does.
- Commit style is `type(scope): subject`, lower case, subject in the imperative (`refactor(editor): …`, `test: …`, `docs: …`, `chore: …`).
- Verification, in this order: `npx tsc --noEmit`, `npm run check`, and for DOM work `npm run tauri dev` then `npm run probe -- <name>`.
- Probe harness rule: editing a probe reloads the page, so wait ~10 s after editing before running it; a bridge timeout that still leaves `{ checks, failed }` in `window.__probeSteps` is a result, not a failure.

## File structure

| Path | Purpose |
| --- | --- |
| `test/checks/*.mjs` | Pure Node checks (moved from `scripts/`) |
| `test/probes/*.js` | DOM probes through the Tauri MCP bridge (moved from `scripts/probes/`) |
| `test/tauri-probe.mjs` | The bridge harness (moved from `scripts/`, gains `--fixture` and `--with-workspace`) |
| `test/probes/lib.js` | Probe helpers installed into the page (moved) |
| `test/run-checks.mjs` | Runs every check, exits non-zero on the first failure |
| `test/run-probes.mjs` | Runs the probes that need no fixture workspace |
| `test/README.md` | Methodology plus an index of every check and probe |
| `test/fixtures/workspace/` | The committed test workspace (demo document, bibliography, notes) |
| `test/fixtures/refresh.mjs` | Re-copies the fixtures from the maintainer's own workspace |
| `src/vite-env.d.ts` | Declares Vite's `?raw` imports |
| `.github/workflows/ci.yml` | `npm ci`, `tsc --noEmit`, `npm run check` |
| `LICENSE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `AGENTS.md` | Repository front door |
| `docs/architecture.md`, `docs/ai-context.md`, `docs/testing.md`, `docs/adding-a-node.md` | Contributor and AI orientation |

---

### Task 1: Move the test suite into `test/`

**Files:**
- Move: `scripts/check-*.mjs` → `test/checks/`, `scripts/probes/` → `test/probes/`, `scripts/tauri-probe.mjs` → `test/tauri-probe.mjs`
- Create: `test/run-checks.mjs`, `test/run-probes.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run check` (all pure checks), `npm run probe -- <probe.js> [--reload] [--install] [--with-doc FILE]`, `npm run probe:all` (probes that need no workspace).

- [ ] **Step 1: Move the files with git so history follows**

```bash
mkdir -p test/checks && git mv scripts/check-blocks.mjs scripts/check-code-edits.mjs \
  scripts/check-enter.mjs scripts/check-footnotes.mjs scripts/check-list-edits.mjs \
  scripts/check-math-source.mjs scripts/check-table-edits.mjs scripts/check-table-menu.mjs \
  scripts/check-table-source.mjs test/checks/
git mv scripts/probes test/probes
git mv scripts/tauri-probe.mjs test/tauri-probe.mjs
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 2: Fix the paths the harness prints and reads**

In `test/tauri-probe.mjs` replace every `scripts/probes/lib.js` with `test/probes/lib.js` and every `scripts/probes/<name>.js` with `test/probes/<name>.js` in the usage banner; the `new URL('./probes/lib.js', import.meta.url)` call is already correct once both files move together.

- [ ] **Step 3: Write `test/run-checks.mjs`**

```js
/**
 * Runs every Node-only check and fails when any of them does.
 *
 * The checks bundle one module each and assert on it in Node: no browser, no
 * Tauri app. Anything rule-shaped belongs there (see `test/README.md`).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory = fileURLToPath(new URL('./checks/', import.meta.url));
const checks = readdirSync(directory).filter((name) => name.endsWith('.mjs')).sort();

const failed = [];
for (const name of checks) {
  const run = spawnSync(process.execPath, [join(directory, name)], { stdio: 'inherit' });
  if (run.status !== 0) {
    failed.push(name);
  }
}

console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
```

- [ ] **Step 4: Write `test/run-probes.mjs`**

```js
/**
 * Runs every probe that needs no fixture workspace (`@needs-workspace` in the
 * probe's header marks the ones that do). Requires `npm run tauri dev`.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory = fileURLToPath(new URL('./probes/', import.meta.url));
const harness = fileURLToPath(new URL('./tauri-probe.mjs', import.meta.url));
const probes = readdirSync(directory)
  .filter((name) => name.endsWith('.js') && name !== 'lib.js')
  .filter((name) => !readFileSync(join(directory, name), 'utf8').includes('@needs-workspace'))
  .sort();

const failed = [];
for (const name of probes) {
  const run = spawnSync(process.execPath, [harness, join(directory, name)], { stdio: 'inherit' });
  if (run.status !== 0) {
    failed.push(name);
  }
}

console.log(`\n${probes.length - failed.length}/${probes.length} probes passed`);
if (failed.length > 0) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
```

- [ ] **Step 5: Add the npm scripts**

In `package.json`, next to `"dev"`:

```json
    "check": "node test/run-checks.mjs",
    "probe": "node test/tauri-probe.mjs",
    "probe:all": "node test/run-probes.mjs",
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
npm run check
npm run tauri dev    # in another terminal
npm run probe -- --install
npm run probe -- test/probes/boundary-caret.js
```

Expected: `npx tsc --noEmit` silent; `npm run check` ends `8/9 checks passed` with `check-enter.mjs` failing (Task 6 repairs it); the probe prints its `{ afterTyping, blockText, caret, revealed }` object.

- [ ] **Step 7: Commit**

```bash
git add -A test package.json
git commit -m "test: move the checks, probes and harness into test/"
```

---

### Task 2: Extract the demo document into a fixture

**Files:**
- Create: `test/fixtures/workspace/default-document.md`, `src/vite-env.d.ts`
- Modify: `src/ui/markdown/markdown_editor.ts` (lines 48–140 hold `DEFAULT_MARKDOWN`)
- Create: `test/probes/default-document.js`

**Interfaces:**
- Produces: `src/ui/markdown/markdown_editor.ts` imports the demo document as `defaultDocument` (a string) and no longer carries it inline.

- [ ] **Step 1: Write the fixture from the current constant**

Copy the 92 strings of the `DEFAULT_MARKDOWN` array (lines 48–140 of `src/ui/markdown/markdown_editor.ts`) verbatim, in order, into `test/fixtures/workspace/default-document.md`, joined by `\n` — the file must end with a trailing newline, matching what `join('\n')` produced.

- [ ] **Step 2: Declare Vite's raw imports**

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 3: Load the document from the fixture**

At the top of `src/ui/markdown/markdown_editor.ts`:

```ts
// The document the editor starts on: the fixture workspace's demo note, so the
// demo can be edited as markdown instead of as a string array in code.
import defaultDocument from '../../../test/fixtures/workspace/default-document.md?raw';
```

then replace `new MarkdownEditorState(DEFAULT_MARKDOWN)` with `new MarkdownEditorState(defaultDocument)` and delete the `DEFAULT_MARKDOWN` constant.

- [ ] **Step 4: Write the probe that pins the fixture**

Create `test/probes/default-document.js`:

```js
/**
 * The editor's demo document is the fixture file, byte for byte.
 *
 * Run with: npm run probe -- test/probes/default-document.js
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const document = await t.raw();
  check('the editor holds the fixture document', document, window.__probeDoc ?? null);
  check('and it is not empty', document.length > 500, true);
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
npm run check
npm run probe -- --with-doc test/fixtures/workspace/default-document.md test/probes/default-document.js
```

Expected: tsc silent; `8/9 checks passed` (Task 6 is still open); the probe reports `failed: []` once the app reloads with the new document (the demo is loaded at startup, so `document` equals the fixture).

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/markdown_editor.ts src/vite-env.d.ts test/fixtures test/probes/default-document.js
git commit -m "test: keep the demo document as a fixture instead of a string array"
```

---

### Task 3: Add the fixture workspace

**Files:**
- Create: `test/fixtures/workspace/{zotero.bib,README.md}`, `test/fixtures/workspace/notes/**`
- Create: `test/fixtures/refresh.mjs`
- Modify: `test/tauri-probe.mjs` (add `--fixture` and `--with-workspace`)
- Create: `test/probes/fixture-workspace.js`, `test/probes/fixture-large-document.js`

- [ ] **Step 1: Copy the notes the tests need**

```bash
SRC="${YI_FIXTURE_SOURCE:-$HOME/Documents/ZettlrNotes}"
DEST=test/fixtures/workspace/notes
mkdir -p "$DEST/Unfiled" "$DEST/Game Theory" "$DEST/Essays" \
  "$DEST/Physics/Theoretic Mechanics" "$DEST/Western Philosophy/Hannah Arendt"
cp "$SRC/Unfiled/虚无与生发.md" "$DEST/Unfiled/"
cp "$SRC/Game Theory/6 Bayesian Game.md" "$DEST/Game Theory/"
cp "$SRC/Essays/Language and Thought.md" "$DEST/Essays/"
cp "$SRC/Physics/Theoretic Mechanics/Geometric and Kinematic Foundations of Lagrangian Mechanics.md" \
  "$DEST/Physics/Theoretic Mechanics/"
cp "$SRC/Western Philosophy/Hannah Arendt/The Human Condition.md" "$DEST/Western Philosophy/Hannah Arendt/"
cp "$SRC/zotero.bib" test/fixtures/workspace/
```

- [ ] **Step 2: Add the note the demo document resolves by id**

Create `test/fixtures/workspace/notes/Unfiled/20221031105857.md`:

```markdown
---
id: 20221031105857
title: Bayesian game notes
---

A note the demo document reaches through `[[20221031105857]]`, which resolves by
frontmatter id.

See also [[6 Bayesian Game]] and [[Language and Thought]].
```

- [ ] **Step 3: Write the fixtures README**

Create `test/fixtures/workspace/README.md` with: one line per file saying what it is for; the provenance of the notes (the maintainer's own writing, copied from a private Zettlr workspace); the licence of the code (MIT) and of this folder's content (CC BY 4.0); how to refresh with `npm run fixtures`; and a note that nothing in here is loaded unless a test asks for it.

- [ ] **Step 4: Write the refresh script**

Create `test/fixtures/refresh.mjs` that re-copies exactly the files listed in Step 1 from `process.env.YI_FIXTURE_SOURCE ?? join(homedir(), 'Documents/ZettlrNotes')`, printing each copied path, and fails loudly when a source file is missing. Add `"fixtures": "node test/fixtures/refresh.mjs"` to `package.json`.

- [ ] **Step 5: Teach the harness about the fixtures**

In `test/tauri-probe.mjs`: treat `--fixture <relative path>` exactly like `--with-doc`, resolving the path inside `test/fixtures/workspace/`; treat `--with-workspace` as a flag that, before the probe runs, points the app's config at the fixture workspace:

```js
if (withWorkspace) {
  const workspace = fileURLToPath(new URL('./fixtures/workspace/', import.meta.url));
  await call(
    `(async () => {
       const cfg = {
         workspace: ${JSON.stringify(workspace)},
         bibliography_file: ${JSON.stringify(join(workspace, 'zotero.bib'))},
         csl_style: '',
         config_version: await window.__TAURI_INTERNALS__.invoke('get_current_config_version')
       };
       await window.__TAURI_INTERNALS__.invoke('set_config', { cfg });
       await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'workspace_changed', payload: cfg.workspace });
       return 'workspace set';
     })()`,
    15000
  );
  await sleep(1500);
}
```

- [ ] **Step 6: Write the two fixture probes**

`test/probes/fixture-workspace.js` (header comment: `@needs-workspace`) loads the Lagrangian note with `--fixture` and asserts: the document is longer than 15 000 characters, at least one `.katex` element renders, at least one `.markdown-wikilink` shows a resolved title (its text differs from the raw `[[…]]`), and `window.onerror` stayed empty. `test/probes/fixture-large-document.js` (also `@needs-workspace`) loads `notes/Western Philosophy/Hannah Arendt/The Human Condition.md`, asserts the raw document is longer than 300 000 characters, that the block count is above 200, and that scrolling to the end and back leaves no errors.

- [ ] **Step 7: Verify**

```bash
npm run check
npm run probe -- --with-workspace --fixture "notes/Physics/Theoretic Mechanics/Geometric and Kinematic Foundations of Lagrangian Mechanics.md" test/probes/fixture-workspace.js
npm run probe -- --with-workspace --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" test/probes/fixture-large-document.js
```

Expected: both probes report `failed: []`; `npm run probe:all` skips both of them.

- [ ] **Step 8: Commit**

```bash
git add test/fixtures test/probes/fixture-workspace.js test/probes/fixture-large-document.js test/tauri-probe.mjs package.json
git commit -m "test: add a committed fixture workspace with the notes the tests need"
```

---

### Task 4: Continuous integration

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: ci

on:
  push:
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run check
```

- [ ] **Step 2: Verify locally in a clean clone**

```bash
git clone . /tmp/yi-ci && cd /tmp/yi-ci && npm ci && npx tsc --noEmit && npm run check
```

Expected: `9/9 checks passed` after Task 6; before it, `8/9` with `check-enter.mjs` named.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: run the type check and the Node checks in CI"
```

---

### Task 5: Delete the dead exports

**Files:** Modify `src/ui/markdown/blocks.ts`, `src/ui/markdown/caret/caret.ts`, `src/ui/markdown/caret/dom.ts`

- [ ] **Step 1: Confirm each symbol is unused before deleting**

```bash
for s in sliceBlockTree buildBlockTree refreshCaretPosition nextNodeAfter nextNodeBefore elementBoundarySide; do
  printf '%s: ' "$s"; rg -l "\b$s\b" src test || echo "(only its definition)"
done
```

Expected: each name appears in exactly one file, its definition.

- [ ] **Step 2: Delete the six definitions**

`sliceBlockTree` and `buildBlockTree` in `src/ui/markdown/blocks.ts`; `refreshCaretPosition` in `src/ui/markdown/caret/caret.ts`; `nextNodeAfter`, `nextNodeBefore`, `elementBoundarySide` in `src/ui/markdown/caret/dom.ts`. Remove any now-unused imports they pulled in (`noUnusedLocals` will name them).

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run check
npm run probe -- test/probes/boundary-caret.js
npm run probe -- test/probes/display-math-source.js
```

Expected: tsc silent, checks at their pre-task count, both probes `failed: []`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/markdown
git commit -m "refactor(editor): drop the exports the block renderer left behind"
```

---

### Task 6: Repair `check-enter.mjs`

**Files:** Modify `test/checks/check-enter.mjs`

**Interfaces:** Consumes `itemSubtreeEnd` from `src/ui/markdown/list_lines.ts` (it moved there in commit `473ecf2`), and `paragraphSplit`, `paragraphStart`, `itemContinuation`, `emptyLineInsertion`, `characterRemoval` from `src/ui/markdown/editing/blank_lines.ts`.

- [ ] **Step 1: Run it and see the failure**

```bash
node test/checks/check-enter.mjs
```

Expected: `TypeError: itemSubtreeEnd is not a function` after the first eleven checks pass.

- [ ] **Step 2: Bundle the module that defines it**

In the check, bundle both entry points and import from the right one:

```js
const listLines = await bundleModule('src/ui/markdown/list_lines.ts');
const blankLines = await bundleModule('src/ui/markdown/editing/blank_lines.ts');
const { itemSubtreeEnd } = listLines;
const { paragraphSplit, paragraphStart, itemContinuation, emptyLineInsertion, characterRemoval } = blankLines;
```

where `bundleModule(input)` is the existing rolldown-and-import dance factored into one helper inside the check file.

- [ ] **Step 3: Verify**

```bash
node test/checks/check-enter.mjs
npm run check
```

Expected: after the fix both end green, `npm run check` reports `9/9 checks passed`.

- [ ] **Step 4: Commit**

```bash
git add test/checks/check-enter.mjs
git commit -m "test: bundle the module that actually exports itemSubtreeEnd"
```

---

### Task 7: The repository front door

**Files:** Create `LICENSE`, `README.md` (replace), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`

- [ ] **Step 1: `LICENSE`** — the MIT licence text, `Copyright (c) 2026 urshanabi`.
- [ ] **Step 2: `README.md`** — replace the Tauri template with: what Yi is (a local-first markdown notes app: WYSIWYG editing over a notes folder, wikilinks, footnotes, tables, math, citations); a screenshot placeholder line; requirements (Node 20+, Rust stable, Tauri prerequisites); `npm install`, `npm run tauri dev`, `npm run check`, `npm run probe -- <name>`; the layout table from the spec's section 5 (short version); links to `docs/architecture.md`, `docs/ai-context.md`, `CONTRIBUTING.md`; the licence.
- [ ] **Step 3: `CONTRIBUTING.md`** — how to set up; the verification commands; the commit style; the rule that behaviour changes need a probe; how to add a check or a probe; what the fixture workspace is and how to refresh it; a pointer to `docs/adding-a-node.md`; the PR checklist (`tsc`, `npm run check`, the probes you touched).
- [ ] **Step 4: `CODE_OF_CONDUCT.md`** — Contributor Covenant 2.1, with the maintainer's contact as the enforcement address.
- [ ] **Step 5: Verify** — read every command in `README.md` and `CONTRIBUTING.md` and run it; each must work as written.
- [ ] **Step 6: Commit**

```bash
git add LICENSE README.md CONTRIBUTING.md CODE_OF_CONDUCT.md
git commit -m "docs: give the repository a licence, a readme and a contributor guide"
```

---

### Task 8: `docs/architecture.md`

**Files:** Create `docs/architecture.md`

- [ ] **Step 1: Write it with these sections** — (1) What the editor is: document, blocks, viewport window, node components; (2) The layer table from the spec's section 5, with the import rules; (3) The five invariants from the spec's section 4, each with the test that protects it; (4) The four offset flavours, one example each, and when each mapping is re-derived; (5) The block/caret/source-mode data flow as a short numbered walk-through of one keystroke; (6) "Where does this change go?", a table mapping common changes to files; (7) The extension points (`registry.ts` `showsSource`, `sourceViewFor`, `source_mode.ts`) with a pointer to `docs/adding-a-node.md`.
- [ ] **Step 2: Verify** — every `path:line` claim in the doc still resolves (`rg` the symbol names); the doc's commands run.
- [ ] **Step 3: Commit** — `git add docs/architecture.md && git commit -m "docs: describe the editor's layers, invariants and extension points"`.

---

### Task 9: `docs/ai-context.md` and `AGENTS.md`

**Files:** Create `docs/ai-context.md`; create or update `AGENTS.md`

- [ ] **Step 1: Write `docs/ai-context.md`** — the context pack: a one-paragraph what-this-is; the layer map; the invariants; the four offset flavours; the commands (`npm run check`, `npm run probe -- <name>`, `npm run probe:all`, `npm run tauri dev`, `npm run fixtures`); the house rules (one fact one home; module headers; behaviour changes need a probe; tests live in `test/`); the three recipes (link to `docs/adding-a-node.md`; `docs/adding-a-command.md` lands in P2); and an "If you are an AI agent" section listing exactly what to run before claiming a change works.
- [ ] **Step 2: Write `AGENTS.md`** — the repository's own agent instructions: always drive the app through the Tauri MCP server; the verification commands above; the layer rules; the commit style; a link to `docs/ai-context.md` as the first read. Keep the maintainer's existing global rules (design principles, feature isolation, meticulous UI testing) and add the repository-specific ones.
- [ ] **Step 3: Verify** — follow `docs/ai-context.md` as if new: run each command it lists, in order, and fix anything that does not work as written.
- [ ] **Step 4: Commit** — `git add docs/ai-context.md AGENTS.md && git commit -m "docs: add the AI context pack and repository agent rules"`.

---

### Task 10: `docs/testing.md` and `test/README.md`

**Files:** Create `docs/testing.md`, `test/README.md`

- [ ] **Step 1: `docs/testing.md`** — the three layers (pure checks, DOM probes, manual UI review), when to use which, the harness flags (`--install`, `--reload`, `--with-doc`, `--fixture`, `--with-workspace`), the probe contract (a single expression returning `{ checks, failed }`, progress through `t.report`), the flakiness rules (an edit reloads the page; a timeout with a stash is a result), and how the fixture workspace is wired to the app config.
- [ ] **Step 2: `test/README.md`** — the index. One row per check and per probe: name, one line on what it covers, and the fixture it needs. Generate the list with `ls test/checks test/probes`, then write a line for each by reading its header comment; add a `@covers` line to each probe's header comment as you go, and note the convention in this file.
- [ ] **Step 3: Verify** — the index names every file (`diff <(ls test/checks test/probes | grep -E '\.(mjs|js)$' | sort) <(rg -o '`[a-z-]+\.(mjs|js)`' test/README.md | tr -d '`' | sort -u)` must be empty).
- [ ] **Step 4: Commit** — `git add docs/testing.md test/README.md test/probes test/checks && git commit -m "docs: write down the testing methodology and index every test"`.

---

### Task 11: `docs/adding-a-node.md`

**Files:** Create `docs/adding-a-node.md`

- [ ] **Step 1: Write the recipe** — numbered steps, each with the file and the code: (1) add the node type to the mdast augmentation (`src/ui/markdown/mdast.d.ts`) and the AST aliases (`src/ui/markdown/ast.ts`); (2) write the component in `src/ui/markdown/nodes/<type>.ts` extending `EditableNodeComponent`; (3) register it in `src/ui/markdown/create_node.ts`, passing `true` as the third argument when the node has a markdown source that can stand in for its rendering; (4) if it has a source, decide the click entry with `sourceContentRange` and (for a language) a `fill` callback through `sourceViewFor`; (5) add a probe under `test/probes/` that clicks the node, types a character, and asserts the raw document; (6) run `npx tsc --noEmit`, `npm run check`, and the new probe.
- [ ] **Step 2: Prove the recipe by following it** — on a scratch branch, add a `kbd` node (`` `x` ``-style inline span rendered as a `<kbd>`), following only the doc; run the probe; then delete the branch. Record in the doc's final section what the recipe forgot, if anything, and fix the doc.
- [ ] **Step 3: Commit** — `git add docs/adding-a-node.md && git commit -m "docs: write the recipe for adding a node type"`.

---

### Task 12: Publication checklist

**Files:** Create `docs/release-checklist.md`

- [ ] **Step 1: Write the checklist** — clean clone builds (`git clone . /tmp/yi-publish && cd /tmp/yi-publish && npm ci && npx tsc --noEmit && npm run check`); `git grep -n "/Users/urshanabi"` returns nothing outside `test/fixtures/workspace/README.md`'s provenance note; no secrets in `src-tauri/` (`git grep -nE "api[_-]?key|token|secret" src-tauri src | grep -v node_modules`); the fixtures README states the content licence; `README.md` links resolve; the app runs from the fixture workspace; the CI badge is green on `main`.
- [ ] **Step 2: Run the checklist** and fix anything it turns up.
- [ ] **Step 3: Commit** — `git add docs/release-checklist.md && git commit -m "docs: add the checklist for publishing the repository"`.

---

## Notes for the implementer

- The behaviour of the editor must not change. If a task seems to require a behaviour change, stop and say so — that belongs to a later phase's spec.
- Probes need the dev app and the bridge: `npm run tauri dev` in one terminal, `npm run probe …` in another. The first probe run after a reload needs `npm run probe -- --install`.
- `AGENTS.md` (root) and this plan's Global Constraints are the rules of the road for every task; when they disagree, the plan's constraints win for this phase and `AGENTS.md` should be corrected in Task 9.
