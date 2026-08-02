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