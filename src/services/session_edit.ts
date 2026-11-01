/**
 * Recording document text, views, saved paths, and adopted version text.
 *
 * Example: an edit updates content immediately while a caret capture later records the view;
 * restoring a version replaces both content and saved text and resets the view to the top.
 *
 * May import: document identity and the session model. Upholds: text and saved text change only
 * through the named transitions here, and an unseen caret keeps the previously known selection.
 */

import { documentTitle } from './document_identity';
import {
  openDocument,
  type DocumentView,
  type SeenView,
  type SessionState
} from './session_model';

/** Records the current document's authoritative text while preserving its last view. */
export function recordContent(state: SessionState, content: string): SessionState {
  return {
    ...state,
    documents: state.documents.map((document) =>
      document.id === state.current
        ? {
            ...document,
            content,
            title: documentTitle(content, document.path)
          }
        : document
    )
  };
}

/**
 * Captures the editor's current text and view into the current document.
 *
 * Example: recording `Body.` with caret offset 5 keeps the text and caret together; a capture
 * whose caret is null preserves the prior caret and selection while accepting a fresh scroll.
 */
export function capture(
  state: SessionState,
  content: string,
  view: SeenView
): SessionState {
  const recorded = recordContent(state, content);
  return {
    ...recorded,
    documents: recorded.documents.map((document) =>
      document.id === recorded.current
        ? { ...document, view: mergeView(document.view, view) }
        : document
    )
  };
}

/** Merges a seen view without turning an unseen caret into the start of the document. */
export function mergeView(had: DocumentView, seen: SeenView): DocumentView {
  return seen.caret === null
    ? { caret: had.caret, to: had.to, scroll: seen.scroll ?? had.scroll }
    : { caret: seen.caret, to: seen.to, scroll: seen.scroll ?? had.scroll };
}

/** Marks one document as written to disk with the text that was written. */
export function markSaved(state: SessionState, id: string, written: string): SessionState {
  return {
    ...state,
    documents: state.documents.map((document) =>
      document.id === id ? { ...document, saved: written } : document
    )
  };
}

/** Gives a document the path it has just been saved to. */
export function setPath(state: SessionState, id: string, path: string): SessionState {
  return {
    ...state,
    documents: state.documents.map((document) =>
      document.id === id ? { ...document, path } : document
    )
  };
}

/**
 * Adopts text already written over a file as the current document.
 *
 * Example: restoring revision 3 of `note.md` replaces that document's text, marks it saved,
 * resets its view to the top, and makes it current; an unopened path appends a fresh document.
 */
export function adoptVersion(
  state: SessionState,
  path: string,
  content: string,
  id: string
): SessionState {
  const documents = [...state.documents];
  const held = documents.some((document) => document.id === id);
  return held
    ? {
        ...state,
        current: id,
        documents: documents.map((document) =>
          document.id === id
            ? {
                ...document,
                content,
                saved: content,
                title: documentTitle(content, document.path),
                view: { caret: 0, to: null, scroll: null }
              }
            : document
        )
      }
    : {
        ...state,
        current: id,
        documents: [...documents, openDocument({ path, content }, id)]
      };
}
