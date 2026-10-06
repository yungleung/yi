/**
 * The image command: what pressing the image button at the titlebar's centre does.
 *
 * The clipboard decides, in the order the ask names. A *destination* it is offering — a web URL, a
 * `file://` URL, a path to an image on this disk — is written into the text where the caret is, the
 * way the link button writes one, and a path is made relative first so the note does not carry the
 * machine's own layout. An *image* on the clipboard is a different question: the app asks on its
 * card (`image_dialog.ts`) what to call it, draws it for the reader to look at, and then *saves* it
 * — into the folder the settings name for images, or beside the note when they name none. A
 * clipboard holding neither leaves an empty `![]()` at the caret, which is the courtesy the link
 * button pays a clipboard it cannot use.
 *
 * The file is written through the file plugin, so it lands wherever the reader's own *Save* can
 * write; the pixels come off the clipboard as RGBA and are drawn on a canvas, which is what turns
 * them into a PNG (or a JPEG or a WebP, when the name asks for one). The text that goes into the
 * note is a path *relative* to where the image is read from — the note's own folder or the image
 * folder — which is what `image_urls.ts` resolves again when the image is painted.
 *
 * May import: the clipboard's reads, the app's paths and settings, the image rules, the card, and
 * the editing context. Upholds: the document text is the only source of truth — one `applyEdit`
 * writes the image, and the caret is placed by offset from the text that edit leaves behind.
 */

import { mkdir, writeFile } from '@tauri-apps/plugin-fs';
import { readClipboardImage, readClipboardText, type ClipboardImage } from '../../api/clipboard';
import { newDocumentId } from '../../services/new_document';
import { t } from '../../services/i18n';
import { notify } from '../../services/messages';
import { documentSession } from '../../services/session';
import { imageFolderPath } from '../../services/settings_paths';
import { destinationForFile, joinPath, parentFolder } from '../../services/workspace_folders';
import {
  applyEdit,
  editorSelection,
  rangeOffsets,
  type EditorContext
} from '../markdown/editing/context';
import {
  clipboardImageDestination,
  imageInsertion,
  imageKindFor
} from '../markdown/syntax/image_edits';
import { selectionTitle } from '../markdown/syntax/link_edits';
import { imageDialog, type ImageChooser } from './image_dialog';

/**
 * Writes an image at the caret — or around the selection, whose words become its alt text — or
 * asks, saves and writes one. Returns false when there is no caret to write at.
 */
export async function insertImage(
  context: EditorContext,
  chooser: ImageChooser = imageDialog
): Promise<boolean> {
  // The selection is read before anything is awaited: a slow answer from the clipboard or the
  // reader cannot leave the insertion at an offset the document has moved out from under it, the
  // same care `editing/links.ts` takes.
  const range = editorSelection(context, true);
  const offsets = range ? rangeOffsets(context, range) : null;
  if (!offsets) {
    return false;
  }
  const selected = selectionTitle(context.state.getText().slice(offsets.from, offsets.to));

  const clipboardText = await readClipboardText();
  const offered = clipboardText === null ? null : clipboardImageDestination(clipboardText);
  if (offered !== null) {
    write(context, offsets, selected.text, await readableDestination(offered));
    return true;
  }

  const image = await readClipboardImage();
  if (image === null) {
    write(context, offsets, selected.text, '');
    return true;
  }
  return await saveAndWrite(context, offsets, selected.text, image, chooser);
}

/** Asks where the image is to be called, saves it, and writes the text that shows it. */
async function saveAndWrite(
  context: EditorContext,
  offsets: { from: number; to: number },
  alt: string,
  image: ClipboardImage,
  chooser: ImageChooser
): Promise<boolean> {
  const inTheNote = documentFolder();
  const base = (await imageFolderPath()) ?? inTheNote;
  if (base === null) {
    // Nowhere to put it: the note has never been saved and the settings name no folder.
    notify('Inserting an image', new Error(t('image.noFolder')));
    return false;
  }
  const preview = await previewUrl(image);
  let name: string | null;
  try {
    name = await chooser.choose({ preview, stamp: newDocumentId(), folder: base });
  } catch (error) {
    notify('Inserting an image', error);
    return false;
  } finally {
    URL.revokeObjectURL(preview);
  }
  if (name === null) {
    return false;
  }
  const file = joinPath(base, name);
  if (file === null) {
    notify('Inserting an image', new Error(t('image.badFolder', { folder: base })));
    return false;
  }
  try {
    const bytes = await encode(image, imageKindFor(name));
    await mkdir(base, { recursive: true });
    await writeFile(file, new Uint8Array(bytes));
  } catch (error) {
    notify('Saving the image', error);
    return false;
  }
  write(context, offsets, alt, destinationForFile(file, await imageFolderPath(), inTheNote));
  return true;
}

/** The one edit: an image at the offsets the reader had, caret at the end of its alt text. */
function write(
  context: EditorContext,
  offsets: { from: number; to: number },
  alt: string,
  destination: string
): void {
  const insertion = imageInsertion(alt, destination);
  applyEdit(context, offsets.from, offsets.to, insertion.markdown, offsets.from + insertion.caret);
}

/**
 * What the text should say about a destination the clipboard offered. A web URL is kept as it is
 * — it names no file of this machine's — while a `file://` URL is turned back into the path it
 * wraps and a path is made relative to the folder it is read from, so a note written on one
 * machine is not a note about that machine.
 */
async function readableDestination(offered: string): Promise<string> {
  if (/^https?:/i.test(offered)) {
    return offered;
  }
  const path = /^file:/i.test(offered) ? fileUrlPath(offered) : offered;
  if (path === null) {
    return offered;
  }
  return destinationForFile(path, await imageFolderPath(), documentFolder());
}

/** The folder of the document on screen, or null when it has never been saved. */
function documentFolder(): string | null {
  const path = documentSession.current()?.path;
  return path === undefined || path === null ? null : parentFolder(path);
}

/** The path a `file://` URL wraps, or null when it wraps nothing this app can read. */
function fileUrlPath(url: string): string | null {
  try {
    const path = decodeURIComponent(url.replace(/^file:\/\/+/, ''));
    return path === '' ? null : `/${path.replace(/^\//, '')}`;
  } catch {
    return null;
  }
}

/** The clipboard's pixels, drawn on a canvas and read back as the kind of file asked for. */
async function encode(image: ClipboardImage, kind: string): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error(t('image.cannotDraw'));
  }
  context.putImageData(
    new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height),
    0,
    0
  );
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, kind));
  if (blob === null) {
    throw new Error(t('image.cannotWrite', { kind }));
  }
  return await blob.arrayBuffer();
}

/** A URL the card can draw: the image's pixels, encoded once, for as long as the card is up. */
async function previewUrl(image: ClipboardImage): Promise<string> {
  const png = await encode(image, 'image/png');
  return URL.createObjectURL(new Blob([png], { type: 'image/png' }));
}
