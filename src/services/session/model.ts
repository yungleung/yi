/**
 * The session's plain data model and its standing state invariants.
 *
 * Example: opening a saved note creates one `SessionDocument` with `saved === content`; the
 * `reachable` rule then keeps only stacked documents and the one currently shown.
 *
 * May import: document identity rules. Upholds: one current document, and one document per id in
 * the stack, with no second copy of a document's text.
 */

import { documentId, documentTitle } from '../documents';

/** This build's session format. A file from another one is discarded, not guessed at. */
export const SESSION_VERSION = 1;

/** Where the reader was in a document. */
export interface DocumentView {
  /**
   * The caret's document offset, or null when the editor cannot say where it is — the block
   * holding it has been unmounted since — in which case the last offset that *was* known stands.
   */
  caret: number | null;
  /** The far end of a selection, or null for a plain caret. */
  to: number | null;
  /** The top of the viewport: the block there, and how far into it the view is scrolled. */
  scroll: { offset: number; within: number } | null;
}

/** What the editor can see of where the reader is, for `capture`. */
export interface SeenView {
  /** Null when the caret is in a block the window has since dropped. */
  caret: number | null;
  /** The far end of the selection, or null when it is a plain caret or cannot be seen. */
  to: number | null;
  scroll: DocumentView['scroll'];
}

export interface SessionDocument {
  /** The id it answers to (`documents/identity.ts`), which is what the stack is keyed by. */
  id: string;
  path: string | null;
  title: string;
  /**
   * Whether the document is a reference the reader is not writing — the tutorial. It is still
   * captured and serialized like any other document, but it is never unsaved work.
   */
  readOnly: boolean;
  /** Its text as it stands. */
  content: string;
  /** Its text as last read or written: equal to `content` means saved. */
  saved: string;
  /** Whether it is in the stack. The current document may be stacked or not. */
  stacked: boolean;
  view: DocumentView;
}

export interface SessionState {
  version: number;
  /** The id of the document on screen, or null when the editor shows nothing. */
  current: string | null;
  documents: SessionDocument[];
}

/** A range of a document, for a view that starts on one. */
export interface DocumentRange {
  start: number;
  end: number;
}

/** What a click in the tree brings: the file it read, and where it came from. */
export interface IncomingDocument {
  path: string | null;
  content: string;
  /** A reference document: shown in the editor, not written to. */
  readOnly?: boolean;
  /**
   * Where the reader should land when this document is opened, or nothing for its beginning.
   */
  select?: DocumentRange | null;
}

/**
 * The id a document is opened under, or a key it can be keyed by when nothing names it.
 *
 * Example: frontmatter `id: 20240707122715` wins; otherwise a pathless note uses `made()`.
 */
export function keyFor(path: string | null, content: string, made: () => string): string {
  return documentId(content, path) ?? made();
}

/** A document as it is opened: not stacked, saved, and with no view to restore yet. */
export function openDocument(incoming: IncomingDocument, id: string): SessionDocument {
  return {
    id,
    path: incoming.path,
    title: documentTitle(incoming.content, incoming.path),
    readOnly: incoming.readOnly === true,
    content: incoming.content,
    saved: incoming.content,
    stacked: false,
    view: incoming.select
      ? { caret: incoming.select.start, to: incoming.select.end, scroll: null }
      : { caret: null, to: null, scroll: null }
  };
}

/** The document the editor is showing, or null. */
export function currentDocument(state: SessionState): SessionDocument | null {
  return state.documents.find((document) => document.id === state.current) ?? null;
}

/** The stack, in the order it was built. */
export function stackedDocuments(state: SessionState): SessionDocument[] {
  return state.documents.filter((document) => document.stacked);
}

/** Whether what is on screen is what the file holds. */
export function isSaved(document: SessionDocument): boolean {
  return document.content === document.saved;
}

/** A session with nothing open. */
export function emptySession(): SessionState {
  return { version: SESSION_VERSION, current: null, documents: [] };
}

/**
 * Keeps only documents the reader can reach: every stacked document and the current one.
 *
 * Example: after opening a file from an unstacked current document and answering "no", the old
 * document leaves while the new current document and every existing stack member remain.
 */
export function reachable(state: SessionState): SessionState {
  return {
    ...state,
    documents: state.documents.filter(
      (document) => document.stacked || document.id === state.current
    )
  };
}
