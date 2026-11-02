/**
 * The image text edit owned by the Markdown editor.
 *
 * Example: the shell resolves a clipboard picture to `pictures/a.png`; this
 * module captures the selected alt text and writes `![alt](pictures/a.png)` as
 * one undoable document edit.
 *
 * May import: the edit context, selection mapping and image syntax rule.
 * Upholds: dialog, clipboard image and file IO stay outside Markdown, while the
 * Markdown mutation and caret placement remain one source-derived edit.
 */

import type { EditorContext } from './editing/context';
import { applyEdit } from './editing/context';
import { editorSelection, rangeOffsets } from './editing/selection';
import { imageInsertion } from './syntax/image_edits';
import { selectionTitle } from './syntax/link_edits';

/** The selection an asynchronous image flow must later replace. */
export interface ImageInsertionTarget {
  readonly from: number;
  readonly to: number;
  readonly alt: string;
}

/**
 * Captures where an image will be written before clipboard or dialog work awaits.
 *
 * Example: a selected `Diagram` captures its two offsets and alt text; the
 * dialog can stay open without the insertion drifting to a later caret.
 */
export function captureImageInsertion(context: EditorContext): ImageInsertionTarget | null {
  const range = editorSelection(context, true);
  const offsets = range ? rangeOffsets(context, range) : null;
  if (!offsets) {
    return null;
  }
  const selected = selectionTitle(
    context.state.getText().slice(offsets.from, offsets.to)
  );
  return { from: offsets.from, to: offsets.to, alt: selected.text };
}

/**
 * Writes an already-captured image target into the document.
 *
 * Example: target offsets for `Diagram` and destination `a.png` apply
 * `![Diagram](a.png)` and leave the caret after the alt text.
 */
export function insertImageMarkdown(
  context: EditorContext,
  target: ImageInsertionTarget,
  destination: string
): boolean {
  if (context.state.getText().length < target.to) {
    return false;
  }
  const insertion = imageInsertion(target.alt, destination);
  applyEdit(
    context,
    target.from,
    target.to,
    insertion.markdown,
    target.from + insertion.caret
  );
  return true;
}

/** The public editor-side image API used by the shell's image flow. */
export interface MarkdownImageApi {
  captureImageInsertion(): ImageInsertionTarget | null;
  insertImageMarkdown(target: ImageInsertionTarget, destination: string): boolean;
}
