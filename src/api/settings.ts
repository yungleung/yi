/**
 * The app config: its shape, and the calls that read and write it.
 *
 * May import: the app's own command seam (`invoke`). Upholds: one declaration of what a config
 * holds, which the settings window, the workspace tree and the session all read rather than each
 * naming a field of their own.
 */

import { invoke } from "@tauri-apps/api/core";

export type AppConfig = {
  workspace: string | null;
  /** Whether the reader has been asked for their workspace, and answered. Written by
   * `ui/workspace_setup/workspace_setup_flow.ts`; false — the default, and what a config written
   * before the field existed reads as — means a config with no workspace is asked exactly once. */
  workspace_asked: boolean;
  /** Whether the reader has asked for versions of this workspace, kept with git. A version happens
   * only when they ask for one, so nothing else turns this on (`src/services/versioning.ts`). */
  versioning: boolean;
  /** The workspace that answer belongs to: a different folder is asked again. */
  versioning_workspace: string | null;
  bibliography_file: string;
  csl_style: string;
  /** How the editor is laid out: a page of A4, or the column at the pane's width. */
  editor_layout?: 'page' | 'auto';
  /** The frontmatter a new note opens with as the reader wrote it, or null for the app's own
   * (`src/services/new_document.ts`). Its four required keys are the app's either way. */
  new_file_frontmatter: string | null;
  /** Where an image the reader saves goes; empty means beside the note (see
   * `src/services/settings_paths.ts`). */
  image_folder: string;
  /** The language the app speaks (`src/services/i18n.ts: LANGUAGES`); empty means the reader's
   * own system locale. */
  language: string;
  /** Whether opening a file pushes the document on screen into the stack instead of asking about
   * it (`src/services/session_rules.ts: openDecision`); false — the default — keeps the
   * question, which is asked only when replacing that document would lose the reader's words. */
  push_unstacked_on_open: boolean;
  config_version: number;
};

export async function loadConfig(): Promise<AppConfig> {
  return await invoke<AppConfig>("get_config");
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await invoke("set_config", { cfg });
}

export async function getCurrentConfigVersion(): Promise<number> {
  return await invoke<number>("get_current_config_version");
}
