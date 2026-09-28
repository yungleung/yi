/**
 * The folders of the workspace, in the order the tree shows them: the root first, then each
 * folder's own folders, depth-first.
 *
 * A new note has to be given a place, and the places are the workspace's folders — a list
 * nothing in the app had built before, since the tree only ever reads the folder a reader
 * unfolded. The walk is the backend's own listing (`api/files.ts: listFolderFiles`), so what
 * this offers is what the tree would show: hidden entries are already out of that listing, and
 * a folder that cannot be read is a folder that contributes nothing rather than a failure of
 * the whole list.
 *
 * May import: the backend's listing. Upholds: one walk of the workspace — the new-note card's
 * list of places — and it is the *listing* that decides what is a folder, never a guess from
 * the path.
 */

import { listFolderFiles, type FileInfo } from '../api/files';

/**
 * How many folders are offered before the walk stops.
 *
 * A guard, not a policy: a folder that leads back into itself — a symbolic link to an
 * ancestor — would otherwise walk forever, and a dialog that never opens is worse than a list
 * that stops. No notes workspace has come close.
 */
export const FOLDER_LIMIT = 1000;

/** One folder a new note may be made in. */
export interface FolderOption {
  /** The folder's absolute path, which is what the file calls take. */
  path: string;
  /** Its own name, for the list to show. */
  name: string;
  /** How deep it sits under the root, for the list to indent by. */
  depth: number;
}

/** How one folder's entries are read — the backend, or a stand-in in a check. */
export type FolderLister = (folder: string) => Promise<FileInfo[]>;

/** Every folder under `root`, the root itself first. */
export async function workspaceFolders(
  root: string,
  list: FolderLister = listFolderFiles
): Promise<FolderOption[]> {
  const folders: FolderOption[] = [];
  const walk = async (path: string, name: string, depth: number): Promise<void> => {
    if (folders.length >= FOLDER_LIMIT) {
      return;
    }
    folders.push({ path, name, depth });
    let entries: FileInfo[];
    try {
      entries = await list(path);
    } catch {
      // A folder the reader cannot read holds nothing this list can offer, and saying so
      // folder by folder would drown the list it is trying to build.
      return;
    }
    for (const entry of entries) {
      if (!entry.is_file) {
        await walk(entry.path, entry.basename, depth + 1);
      }
    }
  };
  await walk(root, fileName(root), 0);
  return folders;
}

/** The last piece of a path — a file's name or a folder's, with its extension — or the path. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/**
 * The folder a path lives in, whichever separator the platform writes — `null` for a path with
 * no folder above it. The tree asks it of an entry whose folder it has to reload, and the
 * new-note card asks it of the document on screen, to start on the folder the reader is in.
 */
export function parentFolder(path: string): string | null {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut > 0 ? path.slice(0, cut) : null;
}

/**
 * The folder and the file name a path names — `null` for a path with no folder above it.
 *
 * This is what an answer from the system's own sheet means (`ui/new_document/`): the sheet
 * answers with one path, and a new note needs a place and a name, which are the two halves of it.
 * A rule rather than a line in the dialog, so it is checked in Node with the rest of this module
 * — a native sheet is the one surface a probe cannot drive.
 */
export function placementOfPath(path: string): { folder: string; name: string } | null {
  const folder = parentFolder(path);
  return folder === null ? null : { folder, name: fileName(path) };
}
