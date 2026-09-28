/**
 * The documents a reader has open: the one on screen, and the stack behind it.
 *
 * A document is a path (or nothing, for a document that has never been a file), its own text
 * as it stands — edits included — the text it was last read from or written to disk, and where
 * the reader was in it. The stack holds documents themselves, so a *stacked* document is never
 * a stale copy of the one on screen: pushing keeps it, and switching away captures its text and
 * its view. That is what lets a stacked document be replaced on screen without a question —
 * nothing is lost — while an unstacked one has to be asked about.
 *
 * Everything here is a rule over a plain object, with no DOM and no backend, so the whole of
 * the behaviour above is asserted in Node (`test/checks/check-document-session.mjs`). The
 * living session — which document is on screen, when the view is captured, when the file is
 * written — is `session.ts`, and the file itself is `session_store.ts`.
 *
 * May import: the id and title rules (`document_identity.ts`). Upholds: one document per id, so
 * the same document cannot be in the stack twice, and one current document, which may or may
 * not be in that stack.
 */

import { documentId, documentTitle } from './document_identity';

/** This build's session format. A file from another one is discarded, not guessed at. */
export const SESSION_VERSION = 1;

/** Where the reader was in a document. */
export interface DocumentView {
  /** The caret's document offset. */
  caret: number;
  /** The top of the viewport: the block there, and how far into it the view is scrolled. */
  scroll: { offset: number; within: number } | null;
}

export interface SessionDocument {
  /** The id it answers to (`document_identity.ts`), which is what the stack is keyed by. */
  id: string;
  path: string | null;
  title: string;
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

/** What a click in the tree brings: the file it read, and where it came from. */
export interface IncomingDocument {
  path: string | null;
  content: string;
}

/** The id a document is opened under, or a key it can be keyed by when nothing names it. */
export function keyFor(path: string | null, content: string, made: () => string): string {
  return documentId(content, path) ?? made();
}

/** A document as it is opened: not stacked, saved, and with no view to restore yet. */
export function openDocument(incoming: IncomingDocument, id: string): SessionDocument {
  return {
    id,
    path: incoming.path,
    title: documentTitle(incoming.content, incoming.path),
    content: incoming.content,
    saved: incoming.content,
    stacked: false,
    view: { caret: 0, scroll: null }
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

/**
 * What opening `incoming` means while `state` is on screen.
 *
 * - `alreadyOpen` — it *is* the document on screen: nothing to do, and nothing to ask.
 * - `bringForward` — it is in the stack: bring that copy forward rather than reading the file
 *   again, because the copy in the session is the newer one.
 * - `open` — it takes the screen without a question: either nothing is on screen to lose, or
 *   the document there is stacked, so its latest version is safe.
 * - `ask` — the document on screen is not stacked: nothing of it would survive, so the reader
 *   is asked whether to push it first.
 */
export type OpenAction = 'alreadyOpen' | 'bringForward' | 'open' | 'ask';

export function openDecision(state: SessionState, incoming: { id: string }): OpenAction {
  const existing = state.documents.find((document) => document.id === incoming.id);
  if (existing?.id === state.current) {
    return 'alreadyOpen';
  }
  if (existing) {
    return 'bringForward';
  }
  const current = currentDocument(state);
  return !current || current.stacked ? 'open' : 'ask';
}

/**
 * Opens a document in place of the current one.
 *
 * `pushCurrent` is the reader's answer to the ask: with it, the document on screen stays in
 * the stack — its text and its view as they are now — and without it that document is dropped.
 * A document that is already here is never opened twice: opening it means bringing it forward.
 */
export function openInto(
  state: SessionState,
  incoming: IncomingDocument,
  id: string,
  pushCurrent: boolean
): SessionState {
  const existing = state.documents.find((document) => document.id === id);
  if (existing) {
    return { ...state, current: existing.id };
  }
  // What the reader answered: keep the document on screen (in the stack), or let it go. One
  // that is already stacked is kept whatever the answer, since there is nothing to decide.
  const kept = state.documents.filter(
    (document) => pushCurrent || document.id !== state.current || document.stacked
  );
  const documents = kept.map((document) =>
    pushCurrent && document.id === state.current ? { ...document, stacked: true } : document
  );
  const opened = openDocument(incoming, id);
  return { ...state, current: opened.id, documents: [...documents, opened] };
}

/** Puts a document into the stack, or takes it out again. */
export function setStacked(state: SessionState, id: string, stacked: boolean): SessionState {
  return {
    ...state,
    documents: state.documents.map((document) =>
      document.id === id ? { ...document, stacked } : document
    )
  };
}

/** Brings a document from the stack to the screen. */
export function restore(state: SessionState, id: string): SessionState {
  if (!state.documents.some((document) => document.id === id)) {
    return state;
  }
  return { ...state, current: id };
}

/**
 * Drops a document from the stack. The one on screen stays as the current document — dropping
 * it from the stack is not closing it — and only a document that is *not* on screen leaves.
 */
export function dropFromStack(state: SessionState, id: string): SessionState {
  const document = state.documents.find((candidate) => candidate.id === id);
  if (!document) {
    return state;
  }
  if (document.id === state.current) {
    return setStacked(state, id, false);
  }
  return { ...state, documents: state.documents.filter((candidate) => candidate.id !== id) };
}

/**
 * Writes what the editor knows into the document it is showing: its text, and where the reader
 * is. Called as the reader types and when they switch away, which is what makes a stacked
 * document always its own latest version.
 */
export function capture(
  state: SessionState,
  content: string,
  view: DocumentView
): SessionState {
  return {
    ...state,
    documents: state.documents.map((document) =>
      document.id === state.current
        ? { ...document, content, title: documentTitle(content, document.path), view }
        : document
    )
  };
}

/** Marks the document on screen as written to disk, with the text that was written. */
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

/** A session with nothing open. */
export function emptySession(): SessionState {
  return { version: SESSION_VERSION, current: null, documents: [] };
}

/** The session as JSON, for `session_store.ts` to write. */
export function serializeSession(state: SessionState): string {
  return JSON.stringify(state);
}

/**
 * The session a file holds, or an empty one.
 *
 * A file this build cannot read — a version it does not know, a shape it does not recognise —
 * is discarded rather than repaired: a session is the reader's work, and half-reading it is
 * worse than starting from nothing.
 */
export function parseSession(text: string | null): SessionState {
  if (!text) {
    return emptySession();
  }
  try {
    const parsed = JSON.parse(text) as Partial<SessionState>;
    if (parsed.version !== SESSION_VERSION || !Array.isArray(parsed.documents)) {
      return emptySession();
    }
    const documents = parsed.documents.filter(isDocument);
    const current =
      typeof parsed.current === 'string' &&
      documents.some((document) => document.id === parsed.current)
        ? parsed.current
        : null;
    return { version: SESSION_VERSION, current, documents };
  } catch {
    return emptySession();
  }
}

/** Whether a value out of a session file is a document this build can use. */
function isDocument(value: unknown): value is SessionDocument {
  const document = value as Partial<SessionDocument> | null;
  return (
    typeof document?.id === 'string' &&
    (document.path === null || typeof document.path === 'string') &&
    typeof document.title === 'string' &&
    typeof document.content === 'string' &&
    typeof document.saved === 'string' &&
    typeof document.stacked === 'boolean' &&
    typeof document.view === 'object' &&
    document.view !== null &&
    typeof document.view.caret === 'number'
  );
}
