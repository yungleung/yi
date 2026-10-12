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

/**
 * The path of `path` seen from `folder` — `notes/a.png` from `/vault`, `../b/c.png` from
 * `/vault/notes` — or null when no relative path can say it: one of the two is not an absolute
 * path, they start on different roots (another volume, another drive letter), or `path` names the
 * folder itself.
 *
 * It is what lets the text a note carries name an image the way the reader would: the app writes
 * the file somewhere and the document says where, without the machine's own layout in it.
 */
export function relativePathFrom(folder: string, path: string): string | null {
  const from = segments(folder);
  const to = segments(path);
  if (from.root === null || to.root === null || from.root !== to.root) {
    return null;
  }
  let shared = 0;
  while (shared < from.parts.length && shared < to.parts.length && from.parts[shared] === to.parts[shared]) {
    shared += 1;
  }
  const up = from.parts.length - shared;
  const down = to.parts.slice(shared);
  if (up === 0 && down.length === 0) {
    return null;
  }
  return [...Array<string>(up).fill('..'), ...down].join('/') || '.';
}

/**
 * A relative path resolved against a folder, with `.` and `..` taken out — `/vault` + `../b/c.png`
 * is `/b/c.png` — or null when the folder is not absolute.
 */
export function joinPath(folder: string, path: string): string | null {
  const base = segments(folder);
  if (base.root === null) {
    return null;
  }
  const parts = [...base.parts];
  for (const piece of path.split(/[\\/]/)) {
    if (piece === '' || piece === '.') {
      continue;
    }
    if (piece === '..') {
      parts.pop();
      continue;
    }
    parts.push(piece);
  }
  return base.root + parts.join('/');
}

/**
 * What the text should say about a file: where it sits seen from `base` (the folder the settings
 * name for images) when it is *inside* it, else seen from the document's own folder when it is
 * inside that, else the path exactly as it came.
 *
 * Inside, and not merely reachable: `/pics` and a file under `/Volumes` share the root of this
 * platform, so `../Volumes/other/a.png` is a true relative path — and a useless one, because the
 * same string read from the document's folder names a different file. A destination the app
 * writes has to mean the same thing wherever it is read from, and an absolute path does.
 */
export function destinationForFile(
  file: string,
  base: string | null,
  documentFolder: string | null
): string {
  return inside(base, file) ?? inside(documentFolder, file) ?? file;
}

/** A file's path seen from a folder it is inside, or null when it is not inside it. */
function inside(folder: string | null, file: string): string | null {
  if (folder === null) {
    return null;
  }
  const relative = relativePathFrom(folder, file);
  return relative !== null && !relative.startsWith('..') ? relative : null;
}

/**
 * The files a destination in the text may name, in the order they are tried.
 *
 * A destination the app wrote is relative to *one* of two folders — the one the settings name for
 * images, or the document's own — and a destination an author typed by hand may be relative to
 * either, because that is how notes in the wild are written. So a relative destination is read
 * from the document's folder first and from the image folder after it, and an absolute one is
 * itself. Anything with a scheme of its own (a web URL, a `data:` URL) names no file at all and
 * answers nothing, so the caller leaves it to the webview.
 *
 * A path *copied* out of something else may spell what a file name holds the way a browser spells
 * it — `my%20shot.png` for a file called `my shot.png` — and that is the file it names. So the
 * escapes are resolved as a spelling of their own, and it is tried *first*: the resolved path is
 * the one the author meant, and the spelling as written is the rarer case (a file whose own name
 * holds the escape). Measured, that order is also the only one that works: the webview accepts the
 * 404 the asset protocol answers for a `%2520` URL as a *load*, so a chain that reached the
 * written spelling first would stop there and never try the file that is really there.
 */
export function imagePathCandidates(
  destination: string,
  base: string | null,
  documentFolder: string | null
): string[] {
  const path = destination.trim();
  if (path === '' || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return [];
  }
  const candidates: string[] = [];
  for (const spelling of spellingsOf(path)) {
    for (const path of pathsFor(spelling, base, documentFolder)) {
      if (!candidates.includes(path)) {
        candidates.push(path);
      }
    }
  }
  return candidates;
}

/** The path the destination resolves to, when it holds escapes, and then the destination itself. */
function spellingsOf(path: string): string[] {
  const resolved = resolveEscapes(path);
  return resolved === null ? [path] : [resolved, path];
}

/**
 * The path with its percent-escapes resolved (`my%20shot.png` → `my shot.png`), or null when it
 * holds none — or holds a `%` that is not one, which makes the path exactly what it says.
 */
function resolveEscapes(path: string): string | null {
  if (!/%[0-9A-Fa-f]{2}/.test(path)) {
    return null;
  }
  try {
    const resolved = decodeURIComponent(path);
    return resolved === path ? null : resolved;
  } catch {
    return null;
  }
}

/** One spelling of a destination: the files it names, in the order they are tried. */
function pathsFor(spelling: string, base: string | null, documentFolder: string | null): string[] {
  if (spelling.startsWith('/') || spelling.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(spelling)) {
    return [spelling];
  }
  const paths: string[] = [];
  for (const folder of [documentFolder, base]) {
    if (folder === null) {
      continue;
    }
    const joined = joinPath(folder, spelling);
    if (joined !== null) {
      paths.push(joined);
    }
  }
  return paths;
}

/**
 * A path with a leading `~` spelled out — `~/pics` beside `/Users/me` is `/Users/me/pics` — or
 * the path itself when it does not start at a home folder, or when there is no home to put there.
 */
export function expandHome(path: string, home: string | null): string {
  if (home === null || (path !== '~' && !path.startsWith('~/') && !path.startsWith('~\\'))) {
    return path;
  }
  return joinPath(home, path.slice(1)) ?? path;
}

/** A path cut into its root and its pieces, for comparing two of them. */
function segments(path: string): { root: string | null; parts: string[] } {
  const pieces = path.split(/[\\/]/).filter((piece) => piece !== '');
  const rooted = path.startsWith('/') || path.startsWith('\\');
  if (rooted) {
    return { root: '/', parts: pieces };
  }
  const drive = /^[A-Za-z]:$/.exec(pieces[0] ?? '');
  if (drive) {
    return { root: `${drive[0]}/`, parts: pieces.slice(1) };
  }
  return { root: null, parts: pieces };
}
