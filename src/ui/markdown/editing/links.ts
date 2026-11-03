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
 * A clipboard the app cannot read is not an error: the link is written without a
 * destination and its author types one.
 *
 * May import: the link's own shape (`syntax/link_edits.ts`), the host clipboard port and the
 * editing context. Upholds: the document text is the only source of truth — one
 * `applyEdit` writes the link, and the caret is placed by offset from the text the edit
 * leaves behind.
 */

import { clipboardDestination, linkInsertion, selectionTitle } from '../syntax/link_edits';
import { applyEdit, type EditorContext } from './context';
import { editorSelection, rangeOffsets } from './selection';

/**
 * Writes a link at the caret, or around the selection. Returns false when there is no
 * caret to write at (the document has no selection the editor can map).
 */
export async function insertLink(context: EditorContext): Promise<boolean> {
  // The app's own read. `null` is an answer — a clipboard holding no text, or one the app
  // may not read — and it is final: there is no webview fallback to ask, whose paste
  // confirmation the reader never asked for.
  const clipboard = await context.host.clipboard.readText();
  const url = clipboard === null ? null : clipboardDestination(clipboard);
  const range = editorSelection(context, true);
  const offsets = range ? rangeOffsets(context, range) : null;
  if (!offsets) {
    return false;
  }
  const text = context.state.getText();
  // Whitespace on either side of a selection is not part of the title — the same
  // courtesy the formatting commands pay a natural drag.
  const title = selectionTitle(text.slice(offsets.from, offsets.to));
  const from = offsets.from + title.from;
  const to = offsets.from + title.to;
  const insertion = linkInsertion(title.text, url);
  applyEdit(context, from, to, insertion.markdown, from + insertion.caret);
  return true;
}
