/**
 * The word count, asked of the backend.
 *
 * May import: the app's own command seam (`invoke`). Upholds: one counting rule — Rust's — so the
 * status bar's numbers and any other reader's cannot drift apart.
 */

import { invoke } from "@tauri-apps/api/core";

export interface WordsCount {
  words: number;
  characters: number;
  whitespaces: number;
  cjk: number;
}

/**
 * Gets the word count for a given markdown string.
 */
export async function getWordsCount(markdown: string): Promise<WordsCount> {
  return await invoke<WordsCount>("get_word_count", { markdown });
}