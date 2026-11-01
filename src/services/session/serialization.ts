/**
 * Serializing and validating the session's plain state.
 *
 * Example: an unknown version or malformed document produces an empty session rather than a
 * partially restored stack; a legacy view without `to` reads as a plain caret.
 *
 * May import: the session model. Upholds: only complete, recognized documents cross the file
 * boundary, and unreachable ones are removed on read.
 */

import {
  emptySession,
  reachable,
  SESSION_VERSION,
  type SessionDocument,
  type SessionState
} from './model';

/** The session as JSON. */
export function serializeSession(state: SessionState): string {
  return JSON.stringify(state);
}

/** The session a file holds, or an empty one when any part cannot be trusted. */
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

/** Reads an old view without a far end as the plain caret it meant. */
function readView(document: SessionDocument): SessionDocument {
  return {
    ...document,
    readOnly: document.readOnly === true,
    view:
      typeof document.view.to === 'number'
        ? document.view
        : { ...document.view, to: null }
  };
}
