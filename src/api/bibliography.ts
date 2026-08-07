import { invoke } from "@tauri-apps/api/core";

/** Returns the raw contents of the configured bibliography file (CSL-JSON or BibTeX). */
export async function readBibliography(): Promise<string> {
  return await invoke<string>("read_bibliography");
}
