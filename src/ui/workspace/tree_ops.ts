/**
 * What the tree's menu items and drops actually do: one function per action, run against
 * the tree that has registered itself as the host.
 *
 * The host is a module-level registration rather than an argument so that the whole app
 * runs one of each (`tree.ts` registers on construction) and a probe can run the same
 * actions by importing this module — the probe helper `t.app` hands back the instance the
 * page is running, not a second copy.
 *
 * A write that fails is not an exception the reader sees: the backend's sentence becomes a
 * message beside the entry it is about and the tree stays as it was. A write that succeeds reloads
 * the tree, so what
 * the reader is looking at is what the disk holds.
 *
 * May import: the backend's file calls (`api/files`), the identifier reader
 * (`services/document_manager`), the message service (`services/messages`) and the opener.
 * Upholds: the tree is a view of the folder — every change goes through the app's own
 * commands, and the view is reloaded from them rather than patched by hand.
 */

import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { createEntry, deleteEntry, moveEntry, renameEntry } from '../../api/files';
import { readDocumentId } from '../../services/document_manager';
import { eventManager } from '../../services/event_manager';
import { showHint, type HintPlace } from '../../services/hints';
import { MESSAGE_EVENT, notify } from '../../services/messages';
import { parentFolder } from '../../services/workspace_folders';
import { runCommand } from '../markdown/commands/registry';
import { t } from '../../services/i18n';
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

/**
 * Re-reads these folders of the tree on screen, and nothing else.
 *
 * A change made by another module — a new note, whose file the app wrote itself — leaves the
 * tree showing what the disk held a moment ago, and this is how it is told. The host owns the
 * rule of *which* rows are touched (`tree.ts: refreshFolders`), so the caller names only the
 * folders it changed.
 */
export async function refreshTreeFolders(paths: string[]): Promise<void> {
  await host?.refreshFolders(paths);
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
      // A new note is the app's own command, not the tree's private business: the row's folder
      // is the place it goes, and everything else about it — the id it is named after, the
      // frontmatter it opens with, the title it selects — is `file:newMarkdown`'s.
      runCommand('file:newMarkdown', { folder: entry.path });
      return;
    case 'new-folder':
      await createAndRename(tree, entry.path, 'New folder');
      return;
    case 'reveal':
      await reveal(entry);
      return;
    case 'copy-path':
      await copy(entry.path, t('tree.copiedPath'), { path: entry.path });
      return;
    case 'copy-name':
      await copy(nameWithoutExtension(entry.basename, entry.isFile), t('tree.copiedName'), {
        path: entry.path
      });
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
    notify('The workspace tree', error);
    return false;
  }
  await tree.refreshFolders([folderOf(entry.path), targetDir]);
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
    notify('The workspace tree', error);
    return false;
  }
  await tree.refreshFolders([folderOf(renamed)]);
  if (wasOpen) {
    await tree.reveal(renamed);
  }
  return true;
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
  const answer = await prompt.ask({
    title: t('tree.delete.title'),
    message: entry.isFile
      ? t('tree.delete.file', { name: entry.basename })
      : t('tree.delete.folder', { name: entry.basename }),
    yes: t('tree.delete.yes'),
    no: t('tree.delete.no')
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
    notify('The workspace tree', error);
    return;
  }
  await tree.refreshFolders([folderOf(entry.path)]);
}

/** The folder whose rows a change to `path` was written under. */
function folderOf(path: string): string {
  return parentFolder(path) ?? path;
}

/**
 * Makes a folder inside `folder` and leaves its name ready to be edited, trying `base`,
 * `base 2`, … until the backend accepts one.
 *
 * A file is not made this way: a new *note* is the app's own command (see `new-file` above),
 * which names it after its id and writes its frontmatter, so there is nothing left for the tree
 * to name.
 */
async function createAndRename(tree: TreeHost, folder: string, base: string): Promise<void> {
  for (let ordinal = 1; ordinal <= 20; ordinal += 1) {
    const name = ordinal === 1 ? base : `${base} ${ordinal}`;
    try {
      const path = await createEntry(folder, name, false);
      await tree.refreshFolders([folder]);
      await tree.renameAt(path);
      return;
    } catch (error) {
      // A name that is taken is the one reason to try the next; anything else is the
      // backend saying no, and the reader should hear it.
      if (!String(error).includes('already exists')) {
        notify('The workspace tree', error);
        return;
      }
    }
  }
  notify('The workspace tree', new Error(`Could not find a free name for ${base}.`));
}

/** Opens the system file manager on the entry. */
async function reveal(entry: TreeEntry): Promise<void> {
  try {
    await revealItemInDir(entry.path);
  } catch (error) {
    notify('The workspace tree', error);
  }
}

/** Puts `text` on the clipboard, and says so beside the row it came from. */
async function copy(text: string, message: string, at: HintPlace): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showHint(message, at);
  } catch (error) {
    // A clipboard the app may not read is the reader's problem to fix: a message, not a hint.
    notify('The workspace tree', error);
  }
}

/** Puts the file's frontmatter `id` on the clipboard. */
async function copyId(entry: TreeEntry): Promise<void> {
  const id = await readDocumentId(entry.path);
  if (!id) {
    void eventManager.emit(MESSAGE_EVENT, {
      text: t('tree.noId', { name: entry.basename })
    });
    return;
  }
  await copy(id, t('tree.copiedId'), { path: entry.path });
}
