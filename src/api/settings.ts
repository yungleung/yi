import { invoke } from "@tauri-apps/api/core";

export type AppConfig = {
  workspace: string | null;
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
