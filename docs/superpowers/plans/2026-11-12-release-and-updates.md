# Release Pipeline and Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Yi from version tags and let installed desktop builds securely check for, install and relaunch into GitHub-hosted updates.

**Architecture:** A DOM-free updater controller depends on injected backend and presenter ports. A Tauri backend adapts the official updater and process plugins, while the Help UI owns prompts, hints and messages and registers one typed command. A tag-triggered matrix workflow validates version agreement, builds signed updater artifacts and publishes them through `tauri-action`.

**Tech Stack:** Tauri 2, Rust, TypeScript, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, Node checks, GitHub Actions, `tauri-apps/tauri-action@v1`.

**Spec:** `docs/superpowers/specs/2026-11-12-release-and-updates-design.md`

## Global Constraints

- The updater private key lives at `/Users/urshanabi/.tauri/yi-updater.key` and must never enter the repository.
- The release tag must be `v` plus one exact SemVer shared by `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- The first release is `v0.1.0`.
- Updater signatures are mandatory; do not disable them.
- macOS uses ad-hoc signing identity `-` until Apple Developer signing credentials are supplied.
- Startup network failures are silent; manual failures are visible.
- No update installs without reader confirmation.
- Never commit directly to `main`; merge only after every required check passes.

---

### Task 1: Generate and register updater keys

**Files:**
- Create outside repository: `/Users/urshanabi/.tauri/yi-updater.key`
- Create outside repository: `/Users/urshanabi/.tauri/yi-updater.key.pub`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: Tauri CLI `signer generate`.
- Produces: the updater public key copied verbatim into `plugins.updater.pubkey`.

- [ ] **Step 1: Create the standard key directory outside the repository**

Run:

```bash
mkdir -p /Users/urshanabi/.tauri
```

Expected: the directory exists and is not under the Yi checkout.

- [ ] **Step 2: Generate the key without printing its private contents**

Run:

```bash
npm run tauri -- signer generate --ci -w /Users/urshanabi/.tauri/yi-updater.key
```

Expected: the two files above exist and the summary prints only the secret-key path and public-key path.

- [ ] **Step 3: Verify both files exist and the private key is not in git**

Run:

```bash
test -s /Users/urshanabi/.tauri/yi-updater.key
test -s /Users/urshanabi/.tauri/yi-updater.key.pub
git check-ignore -q /Users/urshanabi/.tauri/yi-updater.key || true
git status --short
```

Expected: both `test` commands succeed and `git status` names no key file.

- [ ] **Step 4: Add the updater configuration with the generated public key**

Modify `src-tauri/tauri.conf.json` so `bundle` includes:

```json
"createUpdaterArtifacts": true,
"macOS": {
  "signingIdentity": "-"
}
```

Add a top-level `plugins` object:

```json
"plugins": {
  "updater": {
    "pubkey": "<contents of /Users/urshanabi/.tauri/yi-updater.key.pub>",
    "endpoints": [
      "https://github.com/yungleung/yi/releases/latest/download/latest.json"
    ],
    "windows": {
      "installMode": "passive"
    }
  }
}
```

Expected: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'))"` exits 0.

- [ ] **Step 5: Commit the public configuration**

```bash
git add src-tauri/tauri.conf.json
git commit -m "build(app): configure signed updates"
```

Expected: the commit contains no private key.

### Task 2: Add desktop updater plugins and permissions

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Test: `test/checks/check-updater-config.mjs`

**Interfaces:**
- Consumes: the key and endpoint configuration from Task 1.
- Produces: registered Tauri updater/process plugins and frontend packages available to later tasks.

- [ ] **Step 1: Write a failing configuration check**

Create `test/checks/check-updater-config.mjs`:

```js
/**
 * Holds release updater configuration to the signing, endpoint and capability contract.
 */
import { readFileSync } from 'node:fs';

const failures = [];
const check = (name, condition) => {
  if (!condition) failures.push(name);
};

const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const capability = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8'));
const rust = readFileSync('src-tauri/src/lib.rs', 'utf8');

check('updater artifacts are enabled', config.bundle.createUpdaterArtifacts === true);
check(
  'the latest GitHub release is the endpoint',
  config.plugins?.updater?.endpoints?.includes(
    'https://github.com/yungleung/yi/releases/latest/download/latest.json'
  )
);
check('the updater public key is configured', typeof config.plugins?.updater?.pubkey === 'string');
check(
  'the desktop capability grants updater access',
  capability.permissions.includes('updater:default')
);
check(
  'the desktop capability grants process restart access',
  capability.permissions.includes('process:default')
);
check('the updater plugin is initialized', rust.includes('tauri_plugin_updater::Builder::new()'));
check('the process plugin is initialized', rust.includes('tauri_plugin_process::init()'));

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('updater config: signed GitHub release updates are enabled');
```

- [ ] **Step 2: Run the check and verify it fails**

Run:

```bash
node test/checks/check-updater-config.mjs
```

Expected: FAIL on artifacts, endpoint, public key, permissions or plugin initialization.

- [ ] **Step 3: Install the frontend packages**

Run:

```bash
npm install @tauri-apps/plugin-updater@2.14.1 @tauri-apps/plugin-process@2.4.0
```

Expected: both packages appear in `dependencies` and `package-lock.json` changes.

- [ ] **Step 4: Add the Rust plugins**

Add to `src-tauri/Cargo.toml`:

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

Initialize both before `run()` in `src-tauri/src/lib.rs`:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```

- [ ] **Step 5: Grant desktop permissions**

Add these strings to `src-tauri/capabilities/default.json`:

```json
"updater:default",
"process:default"
```

Expected: both are direct members of the main window's `permissions` array.

- [ ] **Step 6: Run the check**

Run:

```bash
node test/checks/check-updater-config.mjs
```

Expected: `updater config: signed GitHub release updates are enabled`.

- [ ] **Step 7: Compile the Rust plugin integration**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: exit 0 with no warnings.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock \
  src-tauri/src/lib.rs src-tauri/capabilities/default.json test/checks/check-updater-config.mjs
git commit -m "build(app): add desktop updater plugins"
```

### Task 3: Implement the update flow as a tested domain service

**Files:**
- Create: `src/services/updates/contracts.ts`
- Create: `src/services/updates/flow.ts`
- Create: `src/services/updates/index.ts`
- Test: `test/checks/check-update-flow.mjs`

**Interfaces:**
- Consumes: no Tauri or DOM APIs.
- Produces:
  - `UpdateSummary { version: string; currentVersion: string; notes: string | null; date: string | null }`
  - `RemoteUpdate extends UpdateSummary { install(): Promise<void> }`
  - `UpdateBackend { check(): Promise<RemoteUpdate | null>; relaunch(): Promise<void> }`
  - `UpdatePresenter { confirm(update: UpdateSummary): Promise<boolean>; current(): void; failed(message: string): void }`
  - `UpdateController.check(mode: 'startup' | 'manual'): Promise<'available' | 'current' | 'declined' | 'installed' | 'failed'>`

- [ ] **Step 1: Write the failing flow check**

Create `test/checks/check-update-flow.mjs` that bundles `src/services/updates/flow.ts`, then uses fake ports. Include these exact scenarios:

```js
const startupCurrent = await controller({ update: null, fail: null }).check('startup');
check('startup-current-is-quiet', startupCurrent, 'current');
check('startup-current-says-nothing', presenter.events, []);

const startupFailed = await controller({ update: null, fail: 'offline' }).check('startup');
check('startup-failure-is-quiet', startupFailed, 'failed');
check('startup-failure-says-nothing', presenter.events, []);

const manualCurrent = await controller({ update: null, fail: null }).check('manual');
check('manual-current-says-current', manualCurrent, 'current');
check('manual-current-shows-a-hint', presenter.events, ['current']);

const manualFailed = await controller({ update: null, fail: 'offline' }).check('manual');
check('manual-failure-says-failed', manualFailed, 'failed');
check('manual-failure-shows-the-reason', presenter.events, ['failed:offline']);

const declined = await controller({ update: remote(), confirm: false }).check('manual');
check('declined-update-stops-before-install', declined, 'declined');
check('declined-update-does-not-install', calls, ['check', 'confirm:1.1.0']);

const accepted = await controller({ update: remote(), confirm: true }).check('manual');
check('accepted-update-installs', accepted, 'installed');
check('accepted-update-installs-then-relaunches', calls, [
  'check',
  'confirm:1.1.0',
  'install:1.1.0',
  'relaunch'
]);

const shared = controller({ update: remote(), confirm: true, installDelay: 30 });
const results = await Promise.all([shared.check('manual'), shared.check('manual')]);
check('parallel-checks-share-one-result', results, ['installed', 'installed']);
check('parallel-checks-run-one-request', calls, [
  'check',
  'confirm:1.1.0',
  'install:1.1.0',
  'relaunch'
]);
```

- [ ] **Step 2: Run the check and verify it fails**

Run:

```bash
node test/checks/check-update-flow.mjs
```

Expected: FAIL because `src/services/updates/flow.ts` does not exist.

- [ ] **Step 3: Define the ports**

Create `src/services/updates/contracts.ts` with the interfaces from this task's **Produces** block and a module header explaining that it contains no Tauri or DOM dependency.

- [ ] **Step 4: Implement the controller**

Create `src/services/updates/flow.ts` with one `UpdateController` class. Cache the in-flight promise:

```ts
check(mode: UpdateMode): Promise<UpdateResult> {
  if (this.running) {
    return this.running;
  }
  this.running = this.runCheck(mode).finally(() => {
    this.running = null;
  });
  return this.running;
}
```

`runCheck` catches errors, calls `presenter.failed(message)` only for manual checks, returns `failed`, and never calls install after a declined confirmation.

- [ ] **Step 5: Add the public service facade**

Create `src/services/updates/index.ts` exporting only:

```ts
export { UpdateController } from './flow';
export type {
  RemoteUpdate,
  UpdateBackend,
  UpdateMode,
  UpdatePresenter,
  UpdateResult,
  UpdateSummary
} from './contracts';
```

- [ ] **Step 6: Run the flow check**

Run:

```bash
node test/checks/check-update-flow.mjs
```

Expected: every listed scenario passes.

- [ ] **Step 7: Commit**

```bash
git add src/services/updates test/checks/check-update-flow.mjs
git commit -m "feat(updates): add tested update flow"
```

### Task 4: Connect the Help command to Tauri and the reader surfaces

**Files:**
- Create: `src/services/updates/backend.ts`
- Create: `src/ui/help/updates.ts`
- Modify: `src/ui/help/index.ts`
- Modify: `src/commands/contracts.ts`
- Modify: `src/commands/triggers/native_menu.ts`
- Modify: `src/services/events/contracts.ts`
- Modify: `src/main.ts`
- Modify: `test/checks/check-command-contracts.mjs`
- Test: `test/probes/check-for-updates.js`

**Interfaces:**
- Consumes: `UpdateController` and ports from Task 3.
- Produces: `createUpdates(): { controller: UpdateController; register(): void }`; command id `help:checkForUpdates`.

- [ ] **Step 1: Extend the failing command-contract check**

In `test/checks/check-command-contracts.mjs`, add:

```js
check(
  'the Help menu has a typed update command',
  parseCommandInput('help:checkForUpdates', undefined),
  null
);
rejects('the update command refuses accidental data', 'help:checkForUpdates', { silent: true });
```

Run:

```bash
node test/checks/check-command-contracts.mjs
```

Expected: FAIL because `help:checkForUpdates` is not in the contract.

- [ ] **Step 2: Add the command contract and native-menu route**

Add `'help:checkForUpdates': CommandContract<null>` to `CommandContracts`, and:

```ts
'help:checkForUpdates': {
  ...noInput('check GitHub Releases for a newer Yi'),
  timing: 'async'
}
```

Add `check_for_updates: 'help:checkForUpdates'` to `MENU_COMMANDS`.

Expected: `node test/checks/check-command-contracts.mjs` passes.

- [ ] **Step 3: Implement the Tauri backend**

Create `src/services/updates/backend.ts`. Use:

```ts
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
```

`check()` returns `null` when the plugin finds no update; otherwise it returns an object whose `install` method calls `update.downloadAndInstall()` and whose metadata comes from the plugin's `version`, `currentVersion`, `body` and `date` fields.

- [ ] **Step 4: Implement the reader-facing presenter and command**

Create `src/ui/help/updates.ts`. Use the existing `prompt`, `showHint` and `showMessage` surfaces. Prompt text comes from new locale keys:

```text
update.available.title
update.available.message
update.available.yes
update.available.no
update.current
update.failed
```

The presenter must:

- include version and notes in the confirmation
- say `You are using the latest version of Yi.` through a hint for manual current checks
- say `Could not check for updates: {message}` through a message for failures
- expose `registerUpdates(controller)` to register exactly one `help:checkForUpdates` command

Export `createUpdates()` from `src/ui/help/updates.ts`, and export it through `src/ui/help/index.ts`.

- [ ] **Step 5: Wire startup and native menu handling**

In `src/main.ts`:

```ts
const updates = createUpdates();
updates.register();
```

after the shell is constructed, and before or alongside `initializeConfig(editor)`, run:

```ts
void updates.controller.check('startup');
```

Do not await startup checks before loading the document.

- [ ] **Step 6: Add locale strings to every catalogue**

Add the six keys above to all eight files under `locales/`. English must match the strings in Step 4; translate the others using the app's existing terminology.

- [ ] **Step 7: Write the DOM probe**

Create `test/probes/check-for-updates.js` as one expression. Stub the updater backend check to return `null`, dispatch the native event through the installed event manager, and report that:

- `help:checkForUpdates` is registered
- menu event `check_for_updates` maps to it
- a manual current result creates a `[data-hint]` saying the app is current
- the page does not open a native dialog

Run after starting the Tauri app:

```bash
npm run probe -- test/probes/check-for-updates.js
```

Expected: zero failed checks.

- [ ] **Step 8: Commit**

```bash
git add src/services/updates/backend.ts src/ui/help/updates.ts src/ui/help/index.ts \
  src/commands/contracts.ts src/commands/triggers/native_menu.ts \
  src/services/events/contracts.ts src/main.ts locales \
  test/checks/check-command-contracts.mjs test/probes/check-for-updates.js
git commit -m "feat(updates): connect help menu updates"
```

### Task 5: Add tag-triggered release automation

**Files:**
- Create: `scripts/check-release-version.mjs`
- Create: `.github/workflows/release.yml`
- Create: `test/checks/check-release-version.mjs`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: a `v<version>` tag supplied as the first script argument.
- Produces: a GitHub Actions matrix that builds and publishes signed update artifacts.

- [ ] **Step 1: Write the failing version-check test**

Create `test/checks/check-release-version.mjs` that copies a minimal fixture tree to a temporary directory, imports `scripts/check-release-version.mjs`, and asserts:

```js
check('matching-tag-passes', await validateVersion('v0.1.0', fixture), true);
check('missing-v-prefix-fails', await validateVersion('0.1.0', fixture), false);
check('mismatched-package-version-fails', await validateVersion('v0.1.1', fixture), false);
```

Run:

```bash
node test/checks/check-release-version.mjs
```

Expected: FAIL because the release-version module does not exist.

- [ ] **Step 2: Implement the release-version guard**

Create `scripts/check-release-version.mjs` exporting `validateVersion(tag, root)` and invoking it when run directly. Read:

```text
package.json                         .version
src-tauri/Cargo.toml                 [package].version
src-tauri/tauri.conf.json            .version
```

Reject a missing `v` prefix, non-SemVer content and any disagreement. On success return true.

- [ ] **Step 3: Run the guard check**

Run:

```bash
node test/checks/check-release-version.mjs
```

Expected: all checks pass.

- [ ] **Step 4: Create the release workflow**

Create `.github/workflows/release.yml` with:

```yaml
name: release
on:
  push:
    tags:
      - 'v*'
permissions:
  contents: write
jobs:
  verify-version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 20
      - run: node scripts/check-release-version.mjs "${GITHUB_REF_NAME}"
  publish-tauri:
    needs: verify-version
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: '--target aarch64-apple-darwin'
          - platform: macos-latest
            args: '--target x86_64-apple-darwin'
          - platform: ubuntu-22.04
            args: ''
          - platform: windows-latest
            args: ''
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v5
      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get -o Acquire::Retries=5 update
          sudo apt-get -o Acquire::Retries=5 install -y build-essential curl file libgtk-3-dev \
            libssl-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev \
            libxdo-dev patchelf xdg-utils
      - uses: actions/setup-node@v5
        with:
          node-version: 20
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ startsWith(matrix.platform, 'macos') && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: npm ci
      - uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          APPLE_SIGNING_IDENTITY: '-'
        with:
          tagName: 'v__VERSION__'
          releaseName: 'Yi v__VERSION__'
          releaseBody: 'Yi v__VERSION__. See the release assets for platform builds.'
          releaseDraft: false
          prerelease: false
          args: ${{ matrix.args }}
```

- [ ] **Step 5: Validate workflow syntax and version consistency**

Run:

```bash
node scripts/check-release-version.mjs v0.1.0
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/release.yml')"
```

Expected: version validation succeeds and YAML parses.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-release-version.mjs .github/workflows/release.yml \
  test/checks/check-release-version.mjs src-tauri/tauri.conf.json
git commit -m "build(release): publish signed builds from tags"
```

### Task 6: Document release operation and backup contract

**Files:**
- Modify: `docs/release-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: key paths and workflow behavior from Tasks 1 and 5.
- Produces: maintainer instructions that require no inference.

- [ ] **Step 1: Add the private-key and secret section**

Document:

```text
Private key: /Users/urshanabi/.tauri/yi-updater.key
Public key:  /Users/urshanabi/.tauri/yi-updater.key.pub
GitHub secret: TAURI_SIGNING_PRIVATE_KEY
Optional password secret: TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

State explicitly that the private key must be backed up outside the repository and that losing it
breaks updates for existing installations.

- [ ] **Step 2: Add the first-release procedure**

Document this exact sequence:

```bash
git push origin main
git tag v0.1.0
git push origin v0.1.0
```

Include how to watch the release workflow and how to verify that
`https://github.com/yungleung/yi/releases/latest/download/latest.json` contains signed platform
entries after publication.

- [ ] **Step 3: State the first-release signing limitation**

Explain that macOS is ad-hoc signed, may require Open Anyway on first launch, and does not have
notarization until Apple Developer credentials are configured.

- [ ] **Step 4: Add one user-facing update sentence**

In README's desktop feature prose, state that installed builds check signed GitHub Releases and ask
before installing an update.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/release-checklist.md
git commit -m "docs(release): document signed update operations"
```

### Task 7: Verify the complete tree and publish

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: every preceding task.
- Produces: a verified `main` and the `v0.1.0` release run.

- [ ] **Step 1: Run TypeScript and pure checks**

```bash
npx tsc --noEmit
npm run check
```

Expected: both exit 0.

- [ ] **Step 2: Run Rust checks and tests**

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: both exit 0 with no warnings.

- [ ] **Step 3: Start the Tauri app and run focused probes**

```bash
npm run tauri dev
npm run probe -- test/probes/check-for-updates.js
```

Expected: the new probe and existing Help/menu probes pass.

- [ ] **Step 4: Run the full probe suite**

```bash
npm run probe:all
```

Expected: every runnable probe passes; only documented environment-dependent probes are skipped.

- [ ] **Step 5: Merge the verified branch into `main`**

```bash
git switch main
git pull --ff-only
git merge --no-ff codex/reverse-github-identifier
```

Expected: the merge succeeds and the tree hash equals the verified branch tree because `main` has no
new commits.

- [ ] **Step 6: Push `main`**

```bash
git push origin main
```

Expected: GitHub accepts the push and CI starts on `main`.

- [ ] **Step 7: Confirm GitHub secrets before tagging**

The repository must contain `TAURI_SIGNING_PRIVATE_KEY`. The release build cannot produce updater
artifacts without it. Do not create the tag until this is confirmed in GitHub repository settings.

- [ ] **Step 8: Tag and push the first release**

```bash
git tag v0.1.0
git push origin v0.1.0
```

Expected: the `release` workflow starts.

- [ ] **Step 9: Watch the release workflow**

Since the GitHub CLI is not installed, use the repository Actions page:

```text
https://github.com/yungleung/yi/actions/workflows/release.yml
```

Wait for `verify-version`, macOS arm64, macOS x64, Linux x64 and Windows x64 to finish. Report the
run URL, artifact/release result and any exact failing step.
