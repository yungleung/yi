/**
 * The workspace's files, through the app's own commands: listing, creating, moving, renaming,
 * deleting, and the atomic write a note is saved with.
 *
 * May import: the app's own command seam (`invoke`). Upholds: one call per file operation, and the
 * written shape (`writeTextAtomically`) for every save — temp file plus rename — so a cloud drive
 * or a git client never reads half a note.
 */

import { invoke } from "@tauri-apps/api/core";

export interface FileInfo {
  path: string;
  basename: string;
  is_file: boolean;
}

/**
 * Lists files and directories inside a folder.
 */
export async function listFolderFiles(folderPath: string): Promise<FileInfo[]> {
  return await invoke<FileInfo[]>("list_folder_files", { folderPath });
}

/**
 * Renames an entry inside the folder it is already in, and answers the path it now has.
 *
 * The rules are the backend's (`src-tauri/src/files.rs`): a name already taken, an empty
 * one, one with a path separator, one that starts a hidden file, or one that would not be
 * markdown, all come back as an error with a sentence to show the reader.
 */
export async function renameEntry(path: string, name: string): Promise<string> {
  return await invoke<string>("rename_entry", { path, name });
}

/** Writes an empty markdown file, or makes a folder, inside `parent`. */
export async function createEntry(parent: string, name: string, isFile: boolean): Promise<string> {
  return await invoke<string>("create_entry", { parent, name, isFile });
}

/**
 * Lets the webview work in the folder a path lives in — read a note, save it, paint its pictures.
 *
 * The file plugin and the asset protocol start scoped to the home folder, which is a scope about the
 * app's own files rather than the reader's: a workspace outside it can be listed and rearranged by the
 * app's own commands, which carry no scope, while a click on one of its notes cannot open it and *Save*
 * cannot write it (`src-tauri/src/access.rs` has the measurement). So the window grants the folders it
 * is about to work in: the config's own — the workspace and the pictures folder — are granted where the
 * config is read, and this is how a *document's* path is, before it is read or written.
 *
 * A path that is not on disk is not an error, and grants nothing: a restored note whose folder is gone
 * is a note that is gone, and the read that follows says so.
 */
export async function grantFolder(path: string): Promise<void> {
  await invoke("grant_folder", { path });
}

/** Removes a file, or a folder and everything under it. */
export async function deleteEntry(path: string): Promise<void> {
  await invoke<void>("delete_entry", { path });
}

/**
 * Writes a document's whole text in one step — a temporary file beside it, renamed over it —
 * so a cloud client or a git client reading while the app saves never sees half a note
 * (`src-tauri/src/files.rs: write_atomically`). The session and the new-note flow write through
 * this rather than the file plugin's truncate-and-write.
 */
export async function writeTextAtomically(path: string, contents: string): Promise<void> {
  await invoke<void>("write_text_atomically", { path, contents });
}

/** Moves an entry into another folder, keeping its name. */
export async function moveEntry(path: string, targetDir: string): Promise<string> {
  return await invoke<string>("move_entry", { path, targetDir });
}
