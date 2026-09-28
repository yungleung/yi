/**
 * What the tree's menu items and drops actually do: one function per action, run against
 * the tree that has registered itself as the host.
 *
 * The host is a module-level registration rather than an argument so that the whole app
 * runs one of each (`tree.ts` registers on construction) and a probe can run the same
 * actions by importing this module — the probe helper `t.app` hands back the instance the
 * page is running, not a second copy.
 *
 * A write that fails is not an exception the reader sees: the backend's sentence goes to
 * the toast and the tree stays as it was. A write that succeeds reloads the tree, so what
 * the reader is looking at is what the disk holds.
 *
 * May import: the backend's file calls (`api/files`), the identifier reader
 * (`services/document_manager`), the toast event (`services/workspace`) and the opener.
 * Upholds: the tree is a view of the folder — every change goes through the app's own
 * commands, and the view is reloaded from them rather than patched by hand.
 */

import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { createEntry, deleteEntry, moveEntry, renameEntry } from '../../api/files';
import { readDocumentId } from '../../services/document_manager';
import { eventManager } from '../../services/event_manager';
import { TOAST_EVENT } from '../../services/workspace';
import { prompt } from '../prompt';
import type { TreeMenuAction } from './tree_menu_model';
import { nameWithoutExtension, type TreeEntry } from './tree_rules';

/** What an action needs from the tree that is on screen. */
export interface TreeHost {
  /** The workspace folder, and the row that is not renamed or deleted. */
  readonly root: string;
  /**
   * Re-reads the folders a change touched — and only those — leaving the rest of the
   * tree alone: a change on the disk must not re-write rows it never reached.
   */
  refreshFolders(paths: string[]): Promise<void>;
  /** Makes `path` visible, opening its folder, and changes nothing else. */
  reveal(path: string): Promise<void>;
  /** Whether a folder is open now — a folder that was open stays open across a change. */
  isOpen(path: string): boolean;
  /** Makes `path`'s row visible and starts renaming it. */
  renameAt(path: string): Promise<void>;
}

let host: TreeHost | null = null;

/** The tree on screen. Called by `tree.ts` when it is built. */
export function setTreeHost(next: TreeHost): void {
  host = next;
}

/** Runs one menu action for `entry`, or a drop of `entry` into `targetDir`. */
export async function runTreeAction(action: TreeMenuAction, entry: TreeEntry): Promise<void> {
  const tree = host;
  if (!tree) {
    return;
  }
  switch (action) {
    case 'rename':
      await tree.renameAt(entry.path);
      return;
    case 'delete':
      await deleteWithQuestion(entry, tree);
      return;
    case 'new-file':
      await createAndRename(tree, entry.path, 'Untitled', true);
      return;
    case 'new-folder':
      await createAndRename(tree, entry.path, 'New folder', false);
      return;
    case 'reveal':
      await reveal(entry);
      return;
    case 'copy-path':
      await copy(entry.path, 'Path copied.');
      return;
    case 'copy-name':
      await copy(nameWithoutExtension(entry.basename, entry.isFile), 'Name copied.');
      return;
    case 'copy-id':
      await copyId(entry);
      return;
  }
}

/** Moves an entry into a folder, and reloads the tree when it worked. */
export async function dropEntry(entry: TreeEntry, targetDir: string): Promise<boolean> {
  const tree = host;
  if (!tree) {
    return false;
  }
  let moved: string;
  try {
    moved = await moveEntry(entry.path, targetDir);
  } catch (error) {
    notify(error);
    return false;
  }
  await tree.refreshFolders([parentOf(entry.path), targetDir]);
  // The folder that took the entry is opened on it, so the reader sees where it went —
  // dropping onto a folded folder would otherwise look like the entry vanished.
  await tree.reveal(moved);
  return true;
}

/** Returns the name a rename left behind, or null when it failed; the reader is told why. */
export async function renameEntryTo(entry: TreeEntry, name: string): Promise<boolean> {
  const tree = host;
  if (!tree) {
    return false;
  }
  // A folder that was open stays open through its own rename: the entry is the same
  // folder, under a new name.
  const wasOpen = tree.isOpen(entry.path);
  let renamed: string;
  try {
    renamed = await renameEntry(entry.path, name);
  } catch (error) {
    notify(error);
    return false;
  }
  await tree.refreshFolders([parentOf(renamed)]);
  if (wasOpen) {
    await tree.reveal(renamed);
  }
  return true;
}

/** The folder an entry lives in, whichever separator the platform writes paths with. */
function parentOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut > 0 ? path.slice(0, cut) : path;
}

/**
 * A delete is asked about first: it takes a folder's contents with it.
 *
 * The question comes from the app's prompt (`ui/prompt.ts`), so a reader is asked by the system
 * dialog and a probe by a card in the page it can press — the question itself is testable, which
 * it was not while it was a native dialog reached for here. A probe that wants the delete
 * without the question drives `deleteNow`, which is what a yes leaves to do.
 */
export async function deleteWithQuestion(
  entry: TreeEntry,
  tree: TreeHost | null = host
): Promise<void> {
  if (!tree) {
    return;
  }
  const what = entry.isFile ? `“${entry.basename}”` : `the folder “${entry.basename}” and everything in it`;
  const answer = await prompt.ask({
    title: 'Delete',
    message: `Delete ${what}? This cannot be undone.`,
    yes: 'Delete',
    no: 'Keep it'
  });
  if (!answer) {
    return;
  }
  await deleteNow(entry, tree);
}

/** Deletes an entry and reloads the tree: the half of it a yes leaves. */
export async function deleteNow(entry: TreeEntry, tree: TreeHost | null = host): Promise<void> {
  if (!tree) {
    return;
  }
  try {
    await deleteEntry(entry.path);
  } catch (error) {
    notify(error);
    return;
  }
  await tree.refreshFolders([parentOf(entry.path)]);
}

/** Creates inside `folder`, trying `base`, `base 2`, … until the backend accepts one. */
async function createAndRename(
  tree: TreeHost,
  folder: string,
  base: string,
  isFile: boolean
): Promise<void> {
  for (let ordinal = 1; ordinal <= 20; ordinal += 1) {
    const name = ordinal === 1 ? base : `${base} ${ordinal}`;
    try {
      const path = await createEntry(folder, name, isFile);
      await tree.refreshFolders([folder]);
      await tree.renameAt(path);
      return;
    } catch (error) {
      // A name that is taken is the one reason to try the next; anything else is the
      // backend saying no, and the reader should hear it.
      if (!String(error).includes('already exists')) {
        notify(error);
        return;
      }
    }
  }
  notify(new Error(`Could not find a free name for ${base}.`));
}

/** Opens the system file manager on the entry. */
async function reveal(entry: TreeEntry): Promise<void> {
  try {
    await revealItemInDir(entry.path);
  } catch (error) {
    notify(error);
  }
}

/** Puts `text` on the clipboard, and says so. */
async function copy(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    void eventManager.emit(TOAST_EVENT, message);
  } catch (error) {
    notify(error);
  }
}

/** Puts the file's frontmatter `id` on the clipboard. */
async function copyId(entry: TreeEntry): Promise<void> {
  const id = await readDocumentId(entry.path);
  if (!id) {
    void eventManager.emit(TOAST_EVENT, `“${entry.basename}” has no id in its frontmatter.`);
    return;
  }
  await copy(id, 'Id copied.');
}

/** One sentence about a failure, in the toast the app already has. */
function notify(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Workspace action failed:', error);
  void eventManager.emit(TOAST_EVENT, message);
}
