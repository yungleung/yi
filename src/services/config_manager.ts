/**
 * The app config, in memory: one read, one write, and the news that it changed.
 *
 * May import: the config seam. Upholds: one copy of the config for this window, so every reader of
 * it sees the same values and a write is announced once.
 */

import { loadConfig, saveConfig, type AppConfig } from '../api/settings';

/** Tauri event emitted when the citation config (file/style) may have changed. */
export const CITATION_CONFIG_CHANGED = 'citation_config_changed';

/** The in-memory config, kept as the single source of truth for this window. */
let currentConfig: AppConfig | null = null;

/**
 * Central manager for reading and persisting the app config.
 *
 * The config lives in a module variable: every read goes through it and every
 * save updates it, so all components in this window stay in sync.
 */
export class ConfigManager {
  /** Loads the config from disk into the module variable and returns it. */
  async load(): Promise<AppConfig> {
    currentConfig = await loadConfig();
    return currentConfig;
  }

  /** Returns the current in-memory config, or null when not loaded yet. */
  get(): AppConfig | null {
    return currentConfig;
  }

  /** Persists the given config and makes it the current source of truth. */
  async save(cfg: AppConfig): Promise<void> {
    await saveConfig(cfg);
    currentConfig = cfg;
  }

  /** Merges a partial update into the current config and persists it. */
  async update(patch: Partial<AppConfig>): Promise<AppConfig> {
    const cfg = {
      ...(this.get() ?? (await loadConfig())),
      ...patch
    };
    await this.save(cfg);
    return cfg;
  }
}

/** The app-wide config manager singleton. */
export const configManager = new ConfigManager();
