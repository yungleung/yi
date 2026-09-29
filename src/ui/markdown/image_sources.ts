/**
 * What an image's destination is to the webview: a URL it may load.
 *
 * A destination in the text is whatever the author wrote — a web URL, a path to a file beside the
 * note, a path into the folder the settings name for images — and the webview can load only the
 * first and last of those directly. A file is not a URL: the page is served from its own origin,
 * so `pic.png` is a request to that origin and `/Users/…` is a request it cannot make at all.
 * `asset:` is Tauri's protocol for exactly this, and `convertFileSrc` is how a path becomes one
 * (`tauri.conf.json` enables it, scoped the way the file plugin is).
 *
 * Which folders a relative destination is read from is the path rule's business
 * (`services/workspace_folders.ts: imagePathCandidates`); this module holds the two folders it is
 * read with, which the app shell sets — the document's own when the session shows one, and the
 * image folder whenever the config is read or changes — and turns the rule's answer into URLs.
 *
 * May import: the path rules and the Tauri core's `convertFileSrc`. Upholds: one answer to "what
 * may this destination name", so the image a note shows is the image the app wrote.
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { imagePathCandidates } from '../../services/workspace_folders';

/** The folder of the document on screen — what a relative destination is read from first. */
let documentFolder: string | null = null;

/** The folder the settings name for images, or null when the reader named none. */
let imageFolder: string | null = null;

/** The folder of the document on screen, set by the session as it shows one. */
export function setDocumentFolder(folder: string | null): void {
  documentFolder = folder;
}

/** The image folder the settings name, set by the app shell when the config is read. */
export function setImageFolder(folder: string | null): void {
  imageFolder = folder;
}

/** The folders a relative destination is read from, for the app shell to set. */
export function imageBases(): { document: string | null; images: string | null } {
  return { document: documentFolder, images: imageFolder };
}

/**
 * The URLs a destination may be, in the order they are tried: one for an author who wrote the
 * path by hand from the note, and the next for the app's own, which is relative to the image
 * folder. A destination with a scheme, and so no file to resolve, answers itself.
 */
export function imageSourceCandidates(destination: string): string[] {
  const url = destination.trim();
  if (url === '') {
    return [];
  }
  if (/^file:/i.test(url)) {
    const path = decodeFileUrl(url);
    return path === null ? [url] : [convertFileSrc(path)];
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return [url];
  }
  return imagePathCandidates(url, imageFolder, documentFolder).map((path) => convertFileSrc(path));
}

/** The path a `file://` URL names, or null when it is not one this app can read. */
function decodeFileUrl(url: string): string | null {
  try {
    const path = decodeURIComponent(url.replace(/^file:\/\/+/, ''));
    return path.startsWith('/') ? path : `/${path}`;
  } catch {
    return null;
  }
}
