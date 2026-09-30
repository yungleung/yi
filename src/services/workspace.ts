import {
  getCurrentConfigVersion,
} from '../api/settings';
import { configManager } from './config_manager';
import { eventManager } from './event_manager';
import { t } from './i18n';
import { MESSAGE_EVENT } from './messages';

const VERSION_MISMATCH_PATTERN = /config\s+version\s+mismatch/i;

/** Emitted with the workspace path so the UI (workspace tree) can react. */
export const WORKSPACE_CHANGED = 'workspace_changed';

/**
 * Keeps the workspace in sync with the persisted app config:
 * - when a different folder is opened, updates the UI and saves the config,
 *   recovering from config version mismatches by refreshing the version.
 *
 * The manager keeps no config state of its own: the ConfigService singleton is
 * the single source of truth and merges updates so other config fields are
 * preserved instead of being replaced on every save.
 */
export class WorkspaceManager {
  async openWorkspace(path: string): Promise<void> {
    if (!path || path === configManager.get()?.workspace) {
      return;
    }

    void eventManager.emit(WORKSPACE_CHANGED, path);
    await this.persistWorkspace(path);
  }

  private async persistWorkspace(path: string): Promise<void> {
    try {
      await configManager.update({ workspace: path });
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
      const config = configManager.get();
      if (!config) {
        return;
      }
      await configManager.save({ ...config, config_version: currentVersion });
      console.log(`Workspace config saved with updated version: ${currentVersion}`);
    } catch (error) {
      this.notifySaveFailure(error);
    }
  }

  private notifySaveFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to save the workspace config:', error);
    // The workspace file has no row in the tree, so the message names no place: the corner.
    void eventManager.emit(MESSAGE_EVENT, { text: t('workspace.failedToSave', { message }) });
  }
}

/** The app-wide workspace manager singleton. */
export const workspaceManager = new WorkspaceManager();
