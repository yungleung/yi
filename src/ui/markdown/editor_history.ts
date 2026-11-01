/**
 * Replaying undo and redo with the author's mark, source shape, scroll and keyboard intact.
 *
 * Example: undoing a replaced word restores it and selects the word again; undoing after focus
 * moved away also hands the keyboard back to the composition seam when the result is a caret.
 *
 * May import: history/document state through the editing context, caret/source placement and event
 * vocabulary. Upholds: undo and redo use the same render → caret → scroll sequence as an edit.
 */

import type { DocumentChangeReason } from '../../services/app_events';
import {
  caretOffset,
  keepScroll,
  restoreMark,
  showSourceAt,
  type EditorContext
} from './editing/context';

/** What history replay needs from the editor that owns the document. */
export interface EditorHistoryHost {
  readonly context: EditorContext;
  regainKeyboard(): void;
  announceDocumentChange(
    reason: DocumentChangeReason,
    previousRevision: number
  ): void;
}

/**
 * Applies one undo or redo step and restores the caret/selection the edit recorded.
 *
 * Example: if state reports no edit to undo, nothing moves and no document event is emitted.
 */
export function applyEditorHistory(
  host: EditorHistoryHost,
  direction: 'undo' | 'redo'
): void {
  const { context } = host;
  const current = caretOffset(context) ?? context.state.getText().length;
  const previousRevision = context.state.getRevision();
  const anchor = context.contentView.scrollTop;
  const edit =
    direction === 'undo' ? context.state.undo() : context.state.redo();
  if (!edit) {
    return;
  }

  const length = context.state.getText().length;
  const mark = edit.after ?? { from: current, to: current };
  const target = {
    from: Math.min(mark.from, length),
    to: Math.min(mark.to, length)
  };
  showSourceAt(context, target.to);
  context.renderer.renderChanged();
  restoreMark(context, target);
  keepScroll(context, anchor);
  if (target.from === target.to) {
    host.regainKeyboard();
  }
  host.announceDocumentChange(direction, previousRevision);
}
