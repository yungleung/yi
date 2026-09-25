import { invoke } from "@tauri-apps/api/core";

/**
 * The system clipboard's text, or null when it holds none.
 *
 * This is the app's own read (AppKit's general pasteboard on macOS, see
 * `src-tauri/src/clipboard.rs`), not the webview's: WebKit answers a scripted clipboard
 * read with its own paste confirmation, and the link button is not asking the reader to
 * paste anything — it is filling in a URL for them. A platform the app does not read
 * natively answers null, which the callers treat as an empty clipboard.
 */
export async function readClipboardText(): Promise<string | null> {
  return await invoke<string | null>("read_clipboard_text");
}
