import { invoke } from "@tauri-apps/api/core";

/**
 * The session file's text, or null when the app has never written one.
 *
 * The file is read and written as text on purpose: the shape of a session belongs to the
 * model that defines it (`src/services/session_rules.ts`), so there is one reader of the
 * format and the backend only holds it.
 */
export async function loadSessionText(): Promise<string | null> {
  return await invoke<string | null>("load_session");
}

export async function saveSessionText(session: string): Promise<void> {
  await invoke("save_session", { session });
}
