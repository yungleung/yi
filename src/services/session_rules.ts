/**
 * The session's rules, over a plain object: which document is on screen, what the stack behind
 * it holds, and where the reader was in each — the model `session.ts` follows.
 *
 * A document is a path (or nothing, for a document that has never been a file), its own text
 * as it stands — edits included — the text it was last read from or written to disk, and where
 * the reader was in it: a caret, or the two ends of a selection, which is how a new note opens
 * with its title ready to be typed over. The stack holds documents themselves, so a *stacked*
 * document is never a stale copy of the one on screen: pushing keeps it, and switching away
 * captures its text and its view. That is what lets a stacked document be replaced on screen
 * without a question — nothing is lost — while an unstacked one has to be asked about.
 *
 * Everything here is a rule over a plain object, with no DOM and no backend, so the whole of
 * the behaviour above is asserted in Node (`test/checks/check-session-rules.mjs`). The living
 * session — when the view is captured, when the file is written — is `session.ts`, and the file
 * it is written to is `src/api/session.ts` over `src-tauri/src/session.rs`.
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
  /**
   * The caret's document offset, or null when the editor cannot say where it is — the block
   * holding it has been unmounted since — in which case the last offset that *was* known stands.
   */
  caret: number | null;
  /**
   * The far end of a selection the reader left, or null when they left a plain caret. It is
   * what a document opened with its title selected keeps between restarts, and it is read
   * with `caret`: a capture that cannot see the caret keeps the pair it already had.
   */
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

/** A range of a document, for a view that starts on one. */
export interface DocumentRange {
  start: number;
  end: number;
}

/** What a click in the tree brings: the file it read, and where it came from. */
export interface IncomingDocument {
  path: string | null;
  content: string;
  /**
   * Where the reader should land when this document is opened, or nothing for its beginning.
   * A new note opens on its title — the reader is about to write one — and everything else
   * opens where a document has always opened: at its start.
   */
  select?: DocumentRange | null;
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
    // Nothing is remembered about where the reader was, and nothing is invented either: a caret
    // placed here is a caret they never put anywhere, and it decides what the page shows (a node
    // the caret is in renders its own markdown, so a note opening on a picture opened on the
    // picture's markdown). The reader's first click or keystroke places one (`editing/text_commands`)
    // — and a document coming back *with* a view keeps it (`restoreView`).
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

/**
 * What opening `incoming` means while `state` is on screen.
 *
 * - `alreadyOpen` — it *is* the document on screen: nothing to do, and nothing to ask.
 * - `bringForward` — it is in the stack: bring that copy forward rather than reading the file
 *   again, because the copy in the session is the newer one.
 * - `open` — it takes the screen without a question: either nothing is on screen to lose, or the
 *   document there is stacked (its latest version is safe), or its text is what its file holds —
 *   the file is the copy, so replacing it loses nothing. Pushing a *saved* document into the
 *   stack is the reader's own choice, and the stack button is where they make it.
 * - `ask` — the document on screen is not stacked and has text no file holds: nothing of it would
 *   survive, so the reader is asked whether to push it first.
 * - `pushAndOpen` — the same document, with the reader's standing answer to that question
 *   (`push_unstacked_on_open`): it goes into the stack without being asked about.
 */
export type OpenAction = 'alreadyOpen' | 'bringForward' | 'open' | 'ask' | 'pushAndOpen';

/**
 * What opening a file should do, given what is on screen. `pushUnstacked` is the reader's own
 * answer (`push_unstacked_on_open`): whether a document that would otherwise be asked about is
 * pushed into the stack instead.
 */
export function openDecision(
  state: SessionState,
  incoming: { id: string },
  pushUnstacked = false
): OpenAction {
  const existing = state.documents.find((document) => document.id === incoming.id);
  if (existing?.id === state.current) {
    return 'alreadyOpen';
  }
  if (existing) {
    return 'bringForward';
  }
  const current = currentDocument(state);
  if (!current || current.stacked) {
    return 'open';
  }
  // What is on screen is not in the stack, so it is only worth asking about when replacing it
  // would lose the reader's words: a document whose text is still what its file holds is the
  // file's copy, while a note with no file at all is not — however little has been typed in it.
  if (current.path !== null && isSaved(current)) {
    return 'open';
  }
  return pushUnstacked ? 'pushAndOpen' : 'ask';
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
  return reachable({ ...state, current: opened.id, documents: [...documents, opened] });
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
  view: SeenView
): SessionState {
  return {
    ...state,
    documents: state.documents.map((document) =>
      document.id === state.current
        ? {
            ...document,
            content,
            title: documentTitle(content, document.path),
            view: mergeView(document.view, view)
          }
        : document
    )
  };
}

/**
 * What a capture leaves behind.
 *
 * What the editor could not see keeps what the document already had: a reader who scrolled
 * their caret's block out of the window before leaving the document is still in the paragraph
 * they were in, and a capture taken then must not read that as "the beginning". The caret and
 * the far end go together — a range with one end from here and the other from there names no
 * selection at all — so an unseen caret keeps both, and a seen one brings both.
 */
export function mergeView(had: DocumentView, seen: SeenView): DocumentView {
  return seen.caret === null
    ? { caret: had.caret, to: had.to, scroll: seen.scroll ?? had.scroll }
    : { caret: seen.caret, to: seen.to, scroll: seen.scroll ?? had.scroll };
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

/**
 * The documents worth keeping: the stack, and the one on screen.
 *
 * A document that is neither is unreachable — nothing on screen shows it and no row of the stack
 * names it — so keeping it would be keeping something the reader can never get back to, and it
 * would grow the session file with every file opened and left. Applied whenever the current
 * document changes, and to a file as it is read, since one written by an older build can carry
 * them.
 */
export function reachable(state: SessionState): SessionState {
  return {
    ...state,
    documents: state.documents.filter(
      (document) => document.stacked || document.id === state.current
    )
  };
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
    const documents = parsed.documents.filter(isDocument).map(readView);
    const current =
      typeof parsed.current === 'string' &&
      documents.some((document) => document.id === parsed.current)
        ? parsed.current
        : null;
    return reachable({ version: SESSION_VERSION, current, documents });
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
    (document.view.caret === null || typeof document.view.caret === 'number') &&
    (document.view.to === undefined ||
      document.view.to === null ||
      typeof document.view.to === 'number')
  );
}

/**
 * A document's view as this build reads it: a session written before a view had a far end is
 * a plain caret there, which is what it was. (A value of the wrong *kind* is not repaired —
 * `isDocument` refuses that document whole, the way it refuses any shape it cannot read.)
 */
function readView(document: SessionDocument): SessionDocument {
  if (typeof document.view.to === 'number') {
    return document;
  }
  return { ...document, view: { ...document.view, to: null } };
}
