import { readText } from "@tauri-apps/plugin-clipboard-manager";

/**
 * The system clipboard's text, or null when the read found none.
 *
 * This is the app's own read — `tauri-plugin-clipboard-manager`, which reads the
 * platform's pasteboard natively on every desktop platform the app ships on — and not
 * the webview's `navigator.clipboard.readText`: WebKit answers a scripted clipboard read
 * with its own paste confirmation, and the link button is not asking the reader to paste
 * anything, it is filling a URL in for them.
 *
 * The plugin reports a clipboard that holds no text, and one it is not allowed to read,
 * as the same error; to a caller those are one fact — there is no text to offer — so both
 * answer null, and the link is written without a destination for its author to fill in.
 */
export async function readClipboardText(): Promise<string | null> {
  try {
    return await readText();
  } catch {
    return null;
  }
}
