/**
 * The stable facade over the session's pure rules and plain state model.
 *
 * Example: callers keep importing `openDecision`, `capture`, and `parseSession` from this file;
 * their implementations now live in focused modules with one-way dependencies.
 *
 * May import: the focused session rule modules. Upholds: one public rule surface, while model,
 * opening/stack, edit/view, and serialization rules keep separate reasons to change.
 */

export {
  SESSION_VERSION,
  emptySession,
  currentDocument,
  isSaved,
  keyFor,
  openDocument,
  reachable,
  stackedDocuments
} from './model';
export type {
  DocumentRange,
  DocumentView,
  IncomingDocument,
  SeenView,
  SessionDocument,
  SessionState
} from './model';

export {
  dropFromStack,
  openDecision,
  openInto,
  replaceReference,
  restore,
  setStacked,
  stackNavigation
} from './open';
export type { OpenAction, StackNavigation } from './open';

export {
  adoptVersion,
  capture,
  markSaved,
  mergeView,
  recordContent,
  setPath
} from './edit';

export { parseSession, serializeSession } from './serialization';
