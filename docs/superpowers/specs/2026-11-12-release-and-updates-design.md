# Release Pipeline and In-App Updates Design

## Goal

Ship Yi from version tags and let installed desktop builds discover, verify, confirm, install, and
relaunch into newer GitHub Releases.

## Release Contract

A tag matching `v<version>` is the release trigger. The first release is `v0.1.0`.

The workflow runs only when the tag names the version already committed in:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

The workflow builds these targets:

- macOS Apple Silicon: `aarch64-apple-darwin`
- macOS Intel: `x86_64-apple-darwin`
- Linux x64
- Windows x64

`tauri-apps/tauri-action` creates or updates the GitHub Release, uploads platform bundles, uploads
updater signatures, and generates `latest.json`. The workflow has `contents: write` permission and
only runs for version tags.

For the first release, macOS uses Tauri's documented ad-hoc signing identity (`-`). This keeps
Apple Silicon builds launchable, but it does not replace Apple Developer ID signing or notarization.
The signing identity is configuration, so it can later be replaced by a real certificate without
changing the updater contract.

## Updater Security

Tauri updater signatures are mandatory. The public key is committed in `tauri.conf.json`; the
private key is never committed.

The private key is generated outside the repository at:

```text
~/.tauri/yi-updater.key
```

The corresponding public key is written beside it:

```text
~/.tauri/yi-updater.key.pub
```

The user must back up `yi-updater.key` securely. Losing it prevents existing installations from
receiving future updates. Before a release can build, the private key must be stored in the
repository's `TAURI_SIGNING_PRIVATE_KEY` GitHub Actions secret. If the generated key uses a
password, that password belongs in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## Updater Architecture

The updater has one state owner and one command path.

`src/services/updates/` owns update metadata, the check/install/relaunch flow, and its backend
contract. It does not import the DOM, prompts, messages or hints.

`src/services/updates/backend.ts` adapts `@tauri-apps/plugin-updater` and
`@tauri-apps/plugin-process` to the domain contract.

`src/ui/help/updates.ts` supplies the reader-facing prompt, quiet hint and failure message, then
registers the single typed `help:checkForUpdates` command.

The existing Help menu event stays `check_for_updates`. The native-menu adapter maps it to
`help:checkForUpdates`.

The flow is:

1. Ask GitHub Releases for an update through the configured
   `https://github.com/yungleung/yi/releases/latest/download/latest.json` endpoint.
2. If none exists, do nothing for a startup check and show an "up to date" hint for a manual check.
3. If one exists, show its version and release notes and ask before downloading.
4. Install only after confirmation.
5. Relaunch after installation on macOS and Linux. Windows may terminate the app during install,
   as required by its installer.
6. Startup failures stay silent. Manual failures are shown as messages.

Only one update interaction may run at a time. Repeated menu presses join the running check rather
than starting parallel installs.

## Configuration and Permissions

`src-tauri/tauri.conf.json` enables updater artifacts and configures:

- the generated public key
- the GitHub `latest.json` endpoint
- the passive Windows installer mode
- ad-hoc macOS signing for this first release

The desktop capability grants only `updater:default` and `process:default`. The process permission
is required to relaunch after installing on macOS and Linux.

`src-tauri/src/lib.rs` initializes both plugins for desktop builds.

## Failure Handling

Network, malformed-response, signature, installation and relaunch failures use the existing app
message surface for manual checks. Startup checks report only to the developer console so a
temporarily offline machine is not interrupted on launch.

The updater does not silently install anything. Declining the prompt leaves the app untouched and
allows a later check.

## Testing

Pure checks cover the update flow with fake backend and presenter ports:

- startup finds no update: no reader-facing output
- startup check fails: no interruption
- manual check finds no update: up-to-date hint
- manual check fails: failure message
- available update declined: no install
- available update accepted: install then relaunch
- concurrent checks: one backend request and one shared result

Command and event checks cover the new command contract and native-menu route.

The release version script is checked directly for matching and mismatching tags.

The running Tauri app is tested through its MCP bridge for:

- the Help menu route reaches `help:checkForUpdates`
- the command is registered
- the updater configuration starts with the plugin initialized

A release workflow dry run is performed with `act` only if available; otherwise YAML parsing and the
same build commands are run locally. Final proof is the pushed tag's GitHub Actions run.

## Documentation

`docs/release-checklist.md` documents:

- the private-key path and backup requirement
- GitHub secret names
- Apple signing limitations for the first release
- the tag/version rule
- how to publish and how to verify `latest.json`

Documentation stays release-maintainer focused; end-user documentation only needs to say that Yi
checks for signed updates from GitHub Releases.
