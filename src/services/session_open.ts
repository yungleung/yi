/**
 * Opening documents, bringing them forward, and maintaining stack membership.
 *
 * Example: opening an unsaved unstacked document returns `ask`; opening an already stacked
 * document returns `bringForward` and does not reread or duplicate it.
 *
 * May import: the session model. Upholds: opening never creates a second copy of an id, and an
 * unreachable document is removed at the transition that would otherwise strand it.
 */

import {
  currentDocument,
  isSaved,
  openDocument,
  reachable,
  stackedDocuments,
  type IncomingDocument,
  type SessionState
} from './session_model';

/**
 * What opening an id means while `state` is on screen.
 *
 * - `alreadyOpen`: it is already the document on screen.
 * - `bringForward`: its newer copy is in the stack.
 * - `open`: replacing the screen loses nothing.
 * - `ask`: the current document has unsaved, unstacked text.
 * - `pushAndOpen`: keep that text in the stack, then open.
 */
export type OpenAction = 'alreadyOpen' | 'bringForward' | 'open' | 'ask' | 'pushAndOpen';

/**
 * Decides whether opening needs to preserve the current document first.
 *
 * Example: a saved note is replaced with `open`; a pathless note with typed text returns `ask`,
 * or `pushAndOpen` when the reader selected the standing push preference.
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
  if (!current || current.stacked || current.readOnly) {
    return 'open';
  }
  if (current.path !== null && isSaved(current)) {
    return 'open';
  }
  return pushUnstacked ? 'pushAndOpen' : 'ask';
}

/**
 * Opens a document in place of the current one.
 *
 * Example: `pushCurrent: true` marks the outgoing document stacked before appending the incoming
 * one; `false` drops it when it was neither current nor already stacked.
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
  const kept = state.documents.filter(
    (document) => pushCurrent || document.id !== state.current || document.stacked
  );
  const documents = kept.map((document) =>
    pushCurrent && document.id === state.current ? { ...document, stacked: true } : document
  );
  const opened = openDocument(incoming, id);
  return reachable({ ...state, current: opened.id, documents: [...documents, opened] });
}

/** Replaces a restored read-only reference with this run's bundled copy. */
export function replaceReference(
  state: SessionState,
  incoming: IncomingDocument,
  id: string
): SessionState {
  const existing = state.documents.find((document) => document.id === id);
  if (!existing) {
    return openInto(state, incoming, id, false);
  }
  if (!existing.readOnly) {
    return state;
  }
  const fresh = openDocument(incoming, id);
  return {
    ...state,
    current: id,
    documents: state.documents.map((document) =>
      document.id === id ? { ...fresh, stacked: document.stacked } : document
    )
  };
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

/** The state and document a stack-navigation command moves to. */
export interface StackNavigation {
  state: SessionState;
  id: string | null;
}

/**
 * Moves to the next or previous document in stack order.
 *
 * Example: from an unstacked note, `+1` first adds that note to the stack and then selects the
 * following member; from a read-only reference it chooses the first existing member.
 */
export function stackNavigation(
  state: SessionState,
  direction: 1 | -1
): StackNavigation {
  const current = currentDocument(state);
  if (!current) {
    return { state, id: null };
  }
  const navigable =
    current.readOnly || current.stacked ? state : setStacked(state, current.id, true);
  const stack = stackedDocuments(navigable);
  if (stack.length === 0) {
    return { state: navigable, id: null };
  }
  const index = stack.findIndex((document) => document.id === current.id);
  const next =
    index === -1
      ? direction === 1
        ? 0
        : stack.length - 1
      : (index + direction + stack.length) % stack.length;
  return { state: navigable, id: stack[next].id };
}

/** Brings a document from the stack to the screen. */
export function restore(state: SessionState, id: string): SessionState {
  if (!state.documents.some((document) => document.id === id)) {
    return state;
  }
  return { ...state, current: id };
}

/** Drops a document from the stack; the current document only leaves stack membership. */
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
