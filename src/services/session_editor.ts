/**
 * Adapting the session's document snapshots to the editor that presents them.
 *
 * Example: showing `/notes/a.md` sets that folder before the text, then restores caret and scroll;
 * capturing it reads the editor's current text and view back into the session model.
 *
 * May import: the pure session capture rule, document/view types and workspace path rules.
 * Upholds: a document's folder is installed before its text, so relative images resolve correctly.
 */

import { parentFolder } from './workspace_folders';
import {
  capture,
  type DocumentView,
  type SeenView,
  type SessionDocument,
  type SessionState
} from './session_rules';

/**
 * What the session needs from the editor: its text, which document it is showing, and where the
 * reader is in it.
 */
export interface SessionEditor {
  /** Shows a reference document without accepting an edit. */
  setReadOnly(readOnly: boolean): void;
  getContent(): string;
  setContent(content: string): void;
  /** The folder the incoming document lives in, installed before its text is painted. */
  setDocumentFolder(folder: string | null): void;
  /** Where the reader is, with null for what the editor cannot currently see (a dropped block). */
  captureView(): SeenView;
  restoreView(view: DocumentView): void;
}

/**
 * Captures the editor's current text and view into the current session document.
 *
 * Example: if the block holding the caret was virtualised away, the previous caret and selection
 * are kept while a newly visible scroll anchor is recorded.
 */
export function captureEditorDocument(
  state: SessionState,
  editor: SessionEditor | null
): SessionState {
  if (editor === null) {
    return state;
  }
  const content = editor.getContent();
  const view = editor.captureView();
  return capture(state, content, view);
}

/**
 * Presents one session document in the editor.
 *
 * Example: restoring a read-only tutorial sets read-only mode before painting its content, so no
 * input handler can accept a write during the swap.
 */
export function showDocumentInEditor(
  editor: SessionEditor | null,
  document: SessionDocument
): void {
  if (editor === null) {
    return;
  }
  editor.setDocumentFolder(
    document.path === null ? null : parentFolder(document.path)
  );
  editor.setReadOnly(document.readOnly);
  editor.setContent(document.content);
  editor.restoreView(document.view);
}
