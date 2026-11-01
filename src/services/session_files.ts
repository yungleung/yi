/**
 * The file and system-sheet seams used by the living document session.
 *
 * Example: opening `/notes/a.md` grants its folder before reading it; Save As asks the system sheet
 * for a Markdown path and returns null when the reader cancels.
 *
 * May import: the app's file commands and Tauri's dialog/file plugins. Upholds: every session write
 * is atomic, and every direct read is preceded by a scope grant for its path.
 */

import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { grantFolder, writeTextAtomically } from '../api/files';

/** Reads a document after granting the webview access to its folder. */
export async function readDocumentFile(path: string): Promise<string> {
  await grantFolder(path);
  return await readTextFile(path);
}

/** Writes one document through the app's atomic replacement path. */
export async function writeDocumentFile(path: string, content: string): Promise<void> {
  await writeTextAtomically(path, content);
}

/**
 * Asks for a Markdown destination, or returns null when the reader cancels.
 *
 * Example: `chooseDocumentPath('A note')` opens the system save sheet with `A note.md` selected.
 */
export async function chooseDocumentPath(title: string): Promise<string | null> {
  return await saveDialog({
    defaultPath: `${title}.md`,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
  });
}
