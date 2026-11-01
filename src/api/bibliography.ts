/**
 * The bibliography file's text, as the backend reads it.
 *
 * May import: the app's own command seam (`invoke`). Upholds: one call for the file's contents, so
 * what they mean stays with the loader above it (`services/bibliography/index.ts`).
 */

import { invoke } from "@tauri-apps/api/core";

/** Returns the raw contents of the configured bibliography file (CSL-JSON or BibTeX). */
export async function readBibliography(): Promise<string> {
  return await invoke<string>("read_bibliography");
}
