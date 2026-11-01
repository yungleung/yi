/**
 * Reading and writing the session file, including the file permissions a restored session needs.
 *
 * Example: a restored note outside the workspace is granted before its picture or next save is
 * used; an unreadable session file becomes an empty session rather than half-restored state.
 *
 * May import: the session backend and file commands, plus the pure session model. Upholds: a read
 * failure never invents documents, and a write failure never changes in-memory session state.
 */

import { grantFolder } from '../../api/files';
import { loadSessionText, saveSessionText } from '../../api/session';
import {
  emptySession,
  type SessionState
} from './model';
import { parseSession, serializeSession } from './serialization';

/** Reads the last session and grants every restored document's folder to the webview. */
export async function loadPersistedSession(): Promise<SessionState> {
  let state: SessionState;
  try {
    state = parseSession(await loadSessionText());
  } catch (error) {
    console.error('Failed to read the session:', error);
    state = emptySession();
  }
  for (const document of state.documents) {
    if (document.path !== null) {
      await grantFolder(document.path);
    }
  }
  return state;
}

/**
 * Writes one session snapshot.
 *
 * Example: failing to write `/session.json` is logged but leaves the current documents and stack
 * untouched, so the reader can continue and a later debounce can retry.
 */
export async function persistSession(state: SessionState): Promise<void> {
  try {
    await saveSessionText(serializeSession(state));
  } catch (error) {
    console.error('Failed to write the session:', error);
  }
}
