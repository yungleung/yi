import { invoke } from "@tauri-apps/api/core";

export interface FileInfo {
  path: string;
  basename: string;
  is_file: boolean;
}

/**
 * Lists files and directories inside a folder.
 */
export async function listFolderFiles(folderPath: string): Promise<FileInfo[]> {
  return await invoke<FileInfo[]>("list_folder_files", { folderPath });
}
