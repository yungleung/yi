/**
 * The folders the settings name, as the file system means them.
 *
 * A setting is written the way a reader writes a path — `~/Pictures/Yi`, most of the time — while
 * the file calls and the asset protocol want one with the home folder spelled out. Two callers
 * need that answer and they must not disagree about it: the flow that *writes* an image into the
 * image folder, and the app shell that tells the renderer which folder a relative destination is
 * read from. So it is one function here, and the home folder is asked for once.
 *
 * May import: the app config and the path plugin. Upholds: one reading of "the folder the settings
 * name", so a note cannot write an image somewhere the same note cannot show it.
 */

import { homeDir } from '@tauri-apps/api/path';
import { expandHome } from './workspace_folders';
import { configManager } from './config_manager';

/** The reader's home folder, or null when the platform will not say. */
let home: Promise<string | null> | null = null;

function homeFolder(): Promise<string | null> {
  home ??= homeDir().catch(() => null);
  return home;
}

/**
 * The folder an image the reader saves goes in, or null when the settings name none — in which
 * case it goes beside the note, which is the answer every caller already has.
 */
export async function imageFolderPath(): Promise<string | null> {
  const named = configManager.get()?.image_folder.trim() ?? '';
  if (named === '') {
    return null;
  }
  return expandHome(named, await homeFolder());
}
