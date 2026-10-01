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
