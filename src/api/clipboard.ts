/**
 * The system clipboard, through the app: its text, and an image as raw pixels.
 *
 * May import: the clipboard plugin's two reads. Upholds: one way in from the pasteboard, so the
 * link command and the image command cannot disagree about what the clipboard is holding.
 */

import { readImage, readText } from "@tauri-apps/plugin-clipboard-manager";

/** An image off the clipboard: how big it is, and its pixels, RGBA, row-major from the top. */
export interface ClipboardImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

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

/**
 * The system clipboard's image, or null when the read found none.
 *
 * The same plugin, and the same answer for everything it cannot offer: a clipboard holding no
 * image, one holding something this platform will not hand over, and a build without the
 * permission to ask are one fact to a caller — there is no image to insert. The plugin's image is
 * a *resource* on the Rust side, so its pixels are read here and the resource given back before
 * this answers; nothing above this file has to know that an image was ever a handle.
 */
export async function readClipboardImage(): Promise<ClipboardImage | null> {
  let image: Awaited<ReturnType<typeof readImage>> | null = null;
  try {
    image = await readImage();
    const size = await image.size();
    const rgba = await image.rgba();
    return { width: size.width, height: size.height, rgba };
  } catch {
    return null;
  } finally {
    try {
      await image?.close();
    } catch {
      // A resource that is already gone is not a failure worth reporting: the pixels, or the
      // absence of them, are what this answers.
    }
  }
}
