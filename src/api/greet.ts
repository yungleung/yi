import { invoke } from "@tauri-apps/api/tauri";
/**
 * Greets the user with a message.
 */
export async function greet(name: string): Promise<string> {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  return await invoke("greet", { name });
}