/**
 * File and folder answers the export workflow needs outside the card.
 *
 * Example: `/notes/draft.md` starts in `/notes` with the output stem `draft`; an unsaved note
 * called `A/B` becomes `A-B`, because prose separators cannot become path separators.
 *
 * May import: the file plugin, config and settings paths, and workspace path rules. Upholds: a
 * generated target name cannot add a path separator.
 */

import { exists } from '@tauri-apps/plugin-fs';
import { configManager } from '../../services/config_manager';
import { homeFolderPath, imageFolderPath } from '../../services/settings_paths';
import { fileName, parentFolder } from '../../services/workspace_folders';

/**
 * Where an output goes when nothing else says: the note's folder, the workspace, the home folder.
 *
 * Example: `targetFolder('/notes/draft.md')` returns `/notes`; a pathless note falls back to the
 * configured workspace and then to the home folder.
 */
export async function targetFolder(path: string | null): Promise<string> {
  const beside = path ? parentFolder(path) : null;
  return beside ?? configManager.get()?.workspace ?? (await homeFolderPath()) ?? '';
}

/** The name the output starts from: the note's own file name, or what an unsaved one is called. */
export function noteName(path: string | null, title: string | null): string {
  if (path) {
    return fileName(path).replace(/\.(md|markdown)$/i, '');
  }
  return (title ?? 'untitled').replace(/[/\\:\n\r]/g, '-').trim() || 'untitled';
}

/**
 * The folders a relative destination in the note is resolved against, in the order they are tried.
 *
 * Example: `resourcePaths('/notes')` returns `['/notes', '/notes/images']` when the image folder is
 * `/notes/images`, and only one `/notes` when the image folder is the same folder.
 */
export async function resourcePaths(folder: string): Promise<string[]> {
  const images = await imageFolderPath();
  return [...new Set([folder, images ?? ''].filter((path) => path !== ''))];
}

/**
 * Whether a path names a file that is there.
 *
 * Example: a path outside the plugin's `$HOME/**` scope answers false after its refusal, so the
 * note keeps the destination the author wrote for Pandoc to try.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}
