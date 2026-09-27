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

- [x] Task 1: the plugin in `Cargo.toml` and `lib.rs`, and the capability permission
      (read the crate's own `permissions/` folder for the exact identifier). Fetch the
      crate and confirm `read_text` errors — rather than answering empty — when the
      clipboard holds no text, since that is what `readClipboardText` maps to `null`.
- [x] Task 2: `src/api/clipboard.ts` rewritten onto the plugin's `readText`; `links.ts`
      loses the fallback; `src-tauri/src/clipboard.rs` deleted.
- [x] Task 3: the probes that stand in for the read (`insert-link.js`,
      `insert-link-clipboard.js`) answer the plugin's command; the "webview fallback"
      case becomes "the plugin's read refuses" — the link is still written, no error.
- [x] Task 4: acceptance and docs — `npx tsc --noEmit`, `npm run check`, `cargo test`, a
      fresh `npm run tauri dev`, `insert-link`, `insert-link-clipboard`,
      `link-cmd-click` by name, a live native read measured in the app (reporting the
      answer's *shape*, never its content), and `docs/architecture.md`,
      `docs/roadmap.md`, `docs/ai-context.md`, `test/README.md`.

## Handoff

**Waiting on the user's review — nothing is merged.** `codex/clipboard-plugin` holds two
commits: this plan, and the switch.

**What changed.** `src-tauri/src/clipboard.rs` is gone (with its `read_clipboard_text`
command and the macOS-only `objc2-app-kit` / `objc2-foundation` dependencies), and
`tauri-plugin-clipboard-manager` is initialised beside the other plugins with
`clipboard-manager:allow-read-text` in `src-tauri/capabilities/default.json`. The crate
resolves to **2.3.3**: 2.4.0 requires a newer `tauri`, and adding it upgraded `tauri`
2.11.5 → 2.12.0 and `wry` 0.55.1 → 0.57.0, which is a webview change well beyond this
ask. The npm side is pinned the same way (`@tauri-apps/plugin-clipboard-manager` is
`~2.3.3`, whose `@tauri-apps/api` requirement `^2.11.0` leaves the api at its locked
2.11.1) — `^2` resolved to the JS 2.4.0, which asks for `@tauri-apps/api ^2.12.0` and
made `tauri dev` print its "NPM package and Rust crate versions" warning on every start.
The two versions are read by hand, so the pair is deliberate.

**Why it is the same read.** `tauri-plugin-clipboard-manager` 2.3.3 depends on `arboard`
3, and `arboard` 3.6 on macOS depends on `objc2-app-kit` 0.3 and `objc2-foundation` 0.3
— the crates the deleted module used — so macOS gets the same `NSPasteboard` read, minus
the `unsafe` binding the app owned. Windows and Linux get a real read too (`clipboard-win`,
`x11rb`/`wl-clipboard-rs`), where the app used to answer `None` and fall back to the
webview's API — the very call that shows WebKit's paste confirmation.

**What a caller sees.** `src/api/clipboard.ts` keeps its one function and its
`Promise<string | null>`; the plugin's error (no text, or not allowed) is mapped to
`null`, and `editing/links.ts` lost its `navigator.clipboard.readText` fallback, which is
now a second rule for one fact. Both probes stand in for the plugin's
`plugin:clipboard-manager|read_text` command, and each now keeps a webview clipboard
holding a URL of its own and checks it is never asked — that check is what fails if the
fallback ever comes back.

**Acceptance.** `npx tsc --noEmit` clean; `npm run check` **26/26**; `cargo test` **9/9**;
`cargo check` clean (3m37s, `arboard 3.6.1` in the graph); a freshly started
`npm run tauri dev`; `insert-link`, `insert-link-clipboard` and `link-cmd-click` all pass
by name (`insert-link` 10/10, the clipboard probe 6/6, the cmd-click probe 12/12); and the
live read measured in that app — `ipc://localhost/plugin:clipboard-manager|read_text`
answering `tauri-response=ok` with a 30-character JSON string, which
`clipboardDestination` reads as a URL. The probe reported the reply's *shape*, never the
clipboard's content.

**One thing to know.** Verifying the live read meant putting a URL on the clipboard
(`printf … | pbcopy`), so whatever the clipboard held before that is gone. Nothing of it
was read or recorded: the first measurement run was answered by a probe's own leftover
stub, and the page was reloaded before the real read was taken.
