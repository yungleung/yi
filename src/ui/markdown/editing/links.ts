/**
 * The link command: write a link where the caret is — or around the selection, which
 * becomes its title — with the destination the clipboard offers when it offers one.
 *
 * The markdown itself is the syntax module's (`syntax/link_edits.ts`); what is left
 * here is where the edit goes and where the caret lands: in the title part, so the
 * next keystroke writes a title for a link whose destination is already filled in.
 *
 * The clipboard is read before the edit is computed rather than after it, so a
 * refusal or a slow answer cannot leave the insertion at an offset the document has
 * moved out from under: the author's selection is read at the moment the edit is made.
 * A clipboard the app cannot read — no permission, no user gesture, no API — is not an
 * error: the link is written without a destination and its author types one.
 *
 * May import: the link's own shape (`syntax/link_edits.ts`) and the editing context.
 * Upholds: the document text is the only source of truth — one `applyEdit` writes the
 * link, and the caret is placed by offset from the text the edit leaves behind.
 */

import { clipboardDestination, linkInsertion } from '../syntax/link_edits';
import { applyEdit, editorSelection, rangeOffsets, type EditorContext } from './context';

/** The destination the system clipboard offers, or null when it offers none. */
async function readClipboardDestination(): Promise<string | null> {
  try {
    const text = await navigator.clipboard?.readText();
    return typeof text === 'string' ? clipboardDestination(text) : null;
  } catch {
    // Refused: a permission the webview did not get, or a clipboard the platform
    // keeps to itself. The link is still made; its destination is left to the author.
    return null;
  }
}

/**
 * Writes a link at the caret, or around the selection. Returns false when there is no
 * caret to write at (the document has no selection the editor can map).
 */
export async function insertLink(context: EditorContext): Promise<boolean> {
  const url = await readClipboardDestination();
  const range = editorSelection(context, true);
  const offsets = range ? rangeOffsets(context, range) : null;
  if (!offsets) {
    return false;
  }
  const text = context.state.getText();
  let from = offsets.from;
  let to = offsets.to;
  // Whitespace on either side of a selection is not part of the title — the same
  // courtesy the formatting commands pay a natural drag.
  while (from < to && /\s/.test(text[from])) {
    from += 1;
  }
  while (to > from && /\s/.test(text[to - 1])) {
    to -= 1;
  }
  const insertion = linkInsertion(text.slice(from, to), url);
  applyEdit(context, from, to, insertion.markdown, from + insertion.caret);
  return true;
}
