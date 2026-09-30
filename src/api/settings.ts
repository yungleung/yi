import { invoke } from "@tauri-apps/api/core";

export type AppConfig = {
  workspace: string | null;
  /** Whether the reader has been asked for their workspace, and answered. Written by
   * `ui/workspace_setup/workspace_setup_flow.ts`; false — the default, and what a config written
   * before the field existed reads as — means a config with no workspace is asked exactly once. */
  workspace_asked: boolean;
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
   * it (`src/services/document_session.ts: openDecision`); false — the default — keeps the
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
