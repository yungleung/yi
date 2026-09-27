# The Clipboard Read Becomes a Plugin

**Goal:** the user's ask on reading it back — *"in the link insertion feature, you use
two rust crates to read the clipboard's content, couldn't we use tauri's clipboard
plugin?"* — so the hand-written macOS read is replaced by
`tauri-plugin-clipboard-manager`.

**Spec:** the user's message; the branch is `codex/clipboard-plugin` and the user
reviews before any merge.

## Why the plugin is the right call

`src-tauri/src/clipboard.rs` reads AppKit's general pasteboard directly, and does so on
macOS only: every other platform answers `None` and `editing/links.ts` falls back to
`navigator.clipboard.readText` — which, in WebKit, is the call that shows the paste
confirmation the native read was introduced to avoid. On Windows and Linux the app
therefore still shows that confirmation on a plain "fill the URL in" click.

The plugin closes that hole with the *same* read: `tauri-plugin-clipboard-manager` 2.4
depends on `arboard ^3`, and `arboard` 3.6 on macOS depends on `objc2-app-kit ^0.3` and
`objc2-foundation ^0.3` — the very crates the hand-written module uses, reading the same
`NSPasteboard`. What changes is that the read is also correct on Windows (`clipboard-win`)
and Linux (`x11rb`), and that the app no longer owns a `unsafe` pasteboard binding it has
to keep.

## Part 1 — where each piece goes

| Piece | Home |
| --- | --- |
| The plugin's Rust side | `src-tauri/Cargo.toml` (`tauri-plugin-clipboard-manager = "2"`), registered in `src-tauri/src/lib.rs` beside the other plugins |
| Permission to call it | `src-tauri/capabilities/default.json`: `clipboard-manager:allow-read-text` (the exact identifier is read from the crate's `permissions/` folder after it is fetched) |
| The app's clipboard seam | `src/api/clipboard.ts`, still one function (`readClipboardText(): Promise<string \| null>`) — now the plugin's JS call, with the "no text" error mapped to `null` |
| The command | `editing/links.ts: insertLink` keeps reading before the edit is computed; the webview fallback goes, because there is no platform left the app does not read |

The npm package (`@tauri-apps/plugin-clipboard-manager`) is used rather than a raw
`invoke`, for the reason every other plugin here uses its own package — the opener, fs, os
and dialog calls all go through `@tauri-apps/plugin-*` — so the clipboard read is not the
one command with a hand-typed method string.

## Part 2 — what goes away

- `src-tauri/src/clipboard.rs` (deleted) and the `clipboard::read_clipboard_text` entry in
  `lib.rs`'s `generate_handler!`.
- The macOS-only `objc2-app-kit` / `objc2-foundation` dependencies in `Cargo.toml`.
- The `navigator.clipboard.readText` fallback in `editing/links.ts`: the plugin reads
  every platform the app ships on, so the fallback is a second rule for one fact.

The behaviour the author sees is unchanged — the URL still fills from the clipboard on a
plain click, still only when it is one `http:`/`https:`/`mailto:` token, and an empty or
refused clipboard still writes `[]()`. What the probes hold is the *shape* of that read
(the plugin's command name now), not its content.

## Part 3 — tasks

- [ ] Task 1: the plugin in `Cargo.toml` and `lib.rs`, and the capability permission
      (read the crate's own `permissions/` folder for the exact identifier). Fetch the
      crate and confirm `read_text` errors — rather than answering empty — when the
      clipboard holds no text, since that is what `readClipboardText` maps to `null`.
- [ ] Task 2: `src/api/clipboard.ts` rewritten onto the plugin's `readText`; `links.ts`
      loses the fallback; `src-tauri/src/clipboard.rs` deleted.
- [ ] Task 3: the probes that stand in for the read (`insert-link.js`,
      `insert-link-clipboard.js`) answer the plugin's command; the "webview fallback"
      case becomes "the plugin's read refuses" — the link is still written, no error.
- [ ] Task 4: acceptance and docs — `npx tsc --noEmit`, `npm run check`, `cargo test`, a
      fresh `npm run tauri dev`, `insert-link`, `insert-link-clipboard`,
      `link-cmd-click` by name, a live native read measured in the app (reporting the
      answer's *shape*, never its content), and `docs/architecture.md`,
      `docs/roadmap.md`, `docs/ai-context.md`, `test/README.md`.

## Handoff

*(written when the work lands)*
