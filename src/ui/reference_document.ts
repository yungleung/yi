/**
 * Opening one of the app’s own bundled references as a read-only document.
 *
 * A reference has no workspace path and is not the reader’s note. It uses the session only as a
 * viewer, so opening a file replaces it without a question and no save command can reach it.
 *
 * May import: the document session. Upholds: the tutorial and Documentation have one definition of
 * what a pathless read-only reference is.
 */

import { documentSession } from '../services/session';

export async function openReferenceDocument(content: string): Promise<void> {
  await documentSession.openFile({ path: null, content, readOnly: true });
}
