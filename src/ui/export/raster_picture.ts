/**
 * A vector picture drawn as a PNG, for the kinds of export whose output cannot hold a vector.
 *
 * Whether a vector survives is a fact about the *kind*, which is the reader's choice and the kind's own
 * row (`src-tauri/src/export.rs: carries_vectors`): a page of HTML and a book hold an SVG as an SVG,
 * and the app's own hand leaves the note's destinations as written — while a Word file, an
 * OpenDocument file, a page XeTeX lays out and the `.tex` it is compiled from cannot. Measured with
 * pandoc 3.12: a docx gets a converted PNG *beside* the raw `.svg` where the machine happens to have a
 * rasteriser, and the raw vector alone where it has none (`[WARNING] Could not convert image …`), so
 * the picture is the app's to draw — the webview has a canvas, and `ui/image/image_flow.ts` already
 * turns pixels into a file with it.
 *
 * What is drawn is the note's own destination: a local `.svg` file, or a `data:` URL of one. A picture
 * **on the web** is left alone — the app's own fetch takes the five types a Word file holds
 * (`export.rs: image_extension`), and a web vector is one of the things the roadmap still leaves open.
 * A destination whose file is not there, or whose drawing fails, is answered as nothing: pandoc's own
 * warning about a picture it cannot find is the reader's, and a half-drawn one would be worse.
 *
 * May import: the destination rules (`services/workspace_folders.ts`), the app's data folder and the
 * file plugin (the same seam an inserted picture is written with). Upholds: the note is never edited —
 * a destination this export must draw is answered as the PNG it was drawn to, under a folder of the
 * app's own that the run removes, and the note's own text still says which picture it is.
 */
import { appDataDir } from '@tauri-apps/api/path';
import { mkdir, remove, writeFile } from '@tauri-apps/plugin-fs';
import { destinationPaths } from '../../services/workspace_folders';
import type { ImageBases } from './preprocess';

/** What drawing a note's pictures has to ask the app: the folders, and whether a file is there. */
export interface PictureLookup {
  bases: ImageBases;
  exists: (path: string) => Promise<boolean>;
}

/**
 * Whether a destination names a vector picture: a `.svg` file, or a `data:` URL of one. A destination
 * with another scheme is not the app's to open — a URL is the fetch's business, and that takes the five
 * types a Word file holds.
 */
export function isVector(destination: string): boolean {
  const path = destination.trim();
  if (/^data:/i.test(path)) {
    return /^data:\s*image\/svg\+xml/i.test(path);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return false;
  }
  return /\.svg$/i.test(path.split(/[?#]/)[0] ?? '');
}

/** The SVG's own text: the file the destination names, or the URL's bytes, or null. */
async function svgSource(destination: string, lookup: PictureLookup): Promise<string | null> {
  if (/^data:/i.test(destination.trim())) {
    const comma = destination.indexOf(',');
    if (comma < 0) {
      return null;
    }
    const header = destination.slice(0, comma);
    const body = destination.slice(comma + 1);
    try {
      if (/;base64$/i.test(header) || /;base64;/i.test(header)) {
        return new TextDecoder().decode(
          Uint8Array.from(atob(body), (character) => character.charCodeAt(0))
        );
      }
      return decodeURIComponent(body);
    } catch {
      return null;
    }
  }
  for (const candidate of destinationPaths(destination, lookup.bases.images, lookup.bases.document)) {
    if (await lookup.exists(candidate)) {
      try {
        return await (await import('@tauri-apps/plugin-fs')).readTextFile(candidate);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Draws one SVG as a PNG at twice its own size — a diagram's hairlines and text are drawn for a vector,
 * and a PNG at the vector's own size is the one that loses them — or null when the webview cannot draw
 * it (no size, a broken file, a canvas the page is not allowed).
 */
async function drawPng(svg: string): Promise<Uint8Array | null> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = 2;
    const width = Math.max(1, Math.round((image.naturalWidth || 300) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 150) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
      return null;
    }
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob === null ? null : new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Where this run's drawn pictures live, and the folder a finished run takes away again. */
export async function rasterFolder(): Promise<string> {
  return `${await appDataDir()}/export/rasters`;
}

/**
 * Draws every vector picture in `destinations` — each once, in the order they are written — and answers
 * destination → the PNG's path. A picture that cannot be drawn is left out, which leaves pandoc to say
 * what it makes of the destination.
 */
export async function rasterPictures(
  destinations: readonly string[],
  lookup: PictureLookup
): Promise<Map<string, string>> {
  const drawn = new Map<string, string>();
  const folder = await rasterFolder();
  let index = 0;
  for (const destination of new Set(destinations)) {
    if (!isVector(destination)) {
      continue;
    }
    const source = await svgSource(destination, lookup);
    if (source === null) {
      continue;
    }
    const png = await drawPng(source);
    if (png === null) {
      continue;
    }
    try {
      await mkdir(folder, { recursive: true });
      const path = `${folder}/raster-${index}.png`;
      await writeFile(path, png);
      drawn.set(destination, path);
      index += 1;
    } catch {
      // A folder the app cannot write is a picture pandoc is left to complain about.
    }
  }
  return drawn;
}

/** Takes a finished run's drawn pictures away: they are that run's files and nothing else's. */
export async function forgetRasters(): Promise<void> {
  try {
    await remove(await rasterFolder(), { recursive: true });
  } catch {
    // Nothing drawn, or nothing to take away.
  }
}
