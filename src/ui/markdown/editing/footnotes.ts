/**
 * The footnote commands: put a new footnote marker at the caret with its
 * definition line at the end of the document, and jump between a marker and
 * its definition.
 *
 * The text rules live in `footnotes.ts`; this module knows the caret, the
 * renderer and the scroll position.
 *
 * May import: the pure footnote rules (`syntax/footnotes.ts`) and the editing
 * context. Upholds: the document text is the only source of truth — the marker
 * and its definition are one edit, so one undo takes the whole footnote away.
 */

import { footnoteInsertEdit, footnoteOffsets, nextFootnoteNumber } from '../syntax/footnotes';
import { applyEdit, caretOffset, restoreCaret, type EditorContext } from './context';

/** Which end of a footnote pair a click came from. */
export type FootnoteEnd = 'reference' | 'definition';

/**
 * Writes a footnote at the caret: the marker where the author is writing, and
 * an empty definition line at the end of the document to fill in. Both are one
 * edit, so one undo takes the whole footnote away again.
 */
export function insertFootnote(context: EditorContext): boolean {
  const caret = caretOffset(context);
  if (caret === null) {
    return false;
  }
  const text = context.state.getText();
  const label = String(nextFootnoteNumber(text));
  const edit = footnoteInsertEdit(text, caret, label);
  applyEdit(context, edit.from, edit.to, edit.replacement, caret + `[^${label}]`.length);
  return true;
}

/**
 * Jumps between a footnote's marker and its definition.
 *
 * A click on the marker lands at the start of the definition's text, ready to
 * be written; a click on the definition's label lands just after the marker it
 * belongs to. The target block is revealed first, because the definition is
 * usually far below the marker and may not be mounted.
 */
export function jumpToFootnote(context: EditorContext, label: string, from: FootnoteEnd): boolean {
  const offsets = footnoteOffsets(context.state.getText(), label);
  const target = from === 'reference' ? offsets.definitionBody : offsets.referenceEnd;
  if (target === null) {
    return false;
  }
  context.renderer.revealOffset(target);
  return restoreCaret(context, target);
}
