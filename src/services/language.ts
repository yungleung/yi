/**
 * Which language the app is speaking, and where that answer comes from.
 *
 * The rule is the same one Rust reads for the menu (`src-tauri/src/i18n.rs`): the config's
 * `language` when it names one this app has, otherwise the reader's own system locale mapped by
 * `matchLocale` — which is what an empty setting means, so a first launch speaks the language the
 * rest of the machine does. Two readers of one config, and the check holds them to the same
 * expectations.
 *
 * May import: the config manager, the locale plugin, and the catalogue's own reader. Upholds: one
 * answer to "which language is this window in", so the shell, the settings window and the editor
 * cannot disagree about it.
 */

import { locale } from '@tauri-apps/plugin-os';
import type { AppConfig } from '../api/settings';
import { configManager } from './config_manager';
import { isLanguage, matchLocale, setLanguage, type Language } from './i18n';

/**
 * The language a config asks for: its own choice, or the system's, or English. The system's locale
 * is asked over the plugin's own command — the one asynchronous step in this file, and the reason
 * this answers a promise.
 */
export async function languageFor(config: AppConfig | null): Promise<Language> {
  const chosen = config?.language?.trim() ?? '';
  if (isLanguage(chosen)) {
    return chosen;
  }
  try {
    const system = await locale();
    return system === null ? 'en' : matchLocale(system);
  } catch {
    return 'en';
  }
}

/** Reads the config and puts the app in the language it names. Answers what it chose. */
export async function applyLanguage(config?: AppConfig): Promise<Language> {
  const source = config ?? (await configManager.load());
  const chosen = await languageFor(source);
  setLanguage(chosen);
  document.documentElement.lang = chosen;
  return chosen;
}
