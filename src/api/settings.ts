import { invoke } from "@tauri-apps/api/core";

export type AppConfig = {
  workspace: string | null;
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
