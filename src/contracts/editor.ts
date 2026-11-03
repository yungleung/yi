/**
 * Cross-layer contracts for document facts and editor view state.
 *
 * Example: Markdown commits a range edit, the event layer announces the resulting
 * `EditorDocumentChanged`, and the session stores an `EditorDocumentView`; all three
 * share these types without any one layer importing another layer's implementation.
 *
 * May import: nothing. Upholds: shared editor vocabulary has one neutral home, and
 * services never reach upward into Markdown to name the facts they consume.
 */

/** Why the committed Markdown text or revision changed. */
export type EditorChangeReason = 'load' | 'edit' | 'undo' | 'redo';

/** One committed Markdown state announced after its owner has changed it. */
export interface EditorDocumentChanged {
  readonly documentKey: string;
  readonly previousRevision: number | null;
  readonly revision: number;
  readonly reason: EditorChangeReason;
  readonly text: string;
}

/** Where the reader was in one Markdown document. */
export interface EditorDocumentView {
  readonly caret: number | null;
  readonly to: number | null;
  readonly scroll: { readonly offset: number; readonly within: number } | null;
}

/** What the live editor can currently observe of the reader's view. */
export interface EditorSeenView {
  readonly caret: number | null;
  readonly to: number | null;
  readonly scroll: EditorDocumentView['scroll'];
}

/** The identity and revision an external edit plan was made against. */
export interface EditorDocumentPosition {
  readonly documentKey: string;
  readonly revision: number;
}

/** One revision-checked raw-text replacement requested from outside the editor. */
export interface EditorReplaceRange extends EditorDocumentPosition {
  readonly from: number;
  readonly to: number;
  readonly replacement: string;
}
