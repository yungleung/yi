import {
  getCurrentConfigVersion,
  saveConfig,
  type AppConfig,
} from '../api/settings';

const VERSION_MISMATCH_PATTERN = /config\s+version\s+mismatch/i;

/**
 * Keeps the workspace in sync with the persisted app config:
 * - when a different folder is opened, updates the UI and saves the config,
 *   recovering from config version mismatches by refreshing the version.
 *
 * The manager keeps no config state of its own: the global window.UI.config
 * is the single source of truth and is mutated in place so that other/unspecified
 * config fields are preserved instead of being replaced on every save.
 */
export class WorkspaceManager {
  async openWorkspace(path: string): Promise<void> {
    if (!path || path === window.UI?.config?.workspace) {
      return;
    }

    window.UI?.workspaceTree?.setWorkspace(path);
    await this.persistWorkspace(path);
  }

  private async persistWorkspace(path: string): Promise<void> {
    let config: AppConfig | null | undefined = window.UI?.config;
    if (!config) {
      try {
        const version = await getCurrentConfigVersion();
        config = { workspace: path, config_version: version };
        window.UI.config = config;
      } catch (error) {
        this.notifySaveFailure(error);
        return;
      }
    } else {
      config.workspace = path;
    }

    try {
      await saveConfig(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (VERSION_MISMATCH_PATTERN.test(message)) {
        await this.retrySaveWithCurrentVersion();
        return;
      }
      this.notifySaveFailure(error);
    }
  }

  private async retrySaveWithCurrentVersion(): Promise<void> {
    try {
      const currentVersion = await getCurrentConfigVersion();
      const config = window.UI?.config;
      if (!config) {
        return;
      }
      config.config_version = currentVersion;
      await saveConfig(config);
      console.log(`Workspace config saved with updated version: ${currentVersion}`);
    } catch (error) {
      this.notifySaveFailure(error);
    }
  }

  private notifySaveFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to save the workspace config:', error);
    window.UI?.toast?.info(`Failed to save the workspace: ${message}`);
  }
}
