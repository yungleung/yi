/**
 * Opens Yi's guided GitHub issue chooser from the native Help menu.
 *
 * Example: Help → Report Issue emits `report_issue`, the native-menu adapter
 * dispatches `help:reportIssue`, and this module hands the issue URL to the
 * system opener without navigating the editor webview.
 *
 * May import: the opener plugin and the command registry. Upholds: the URL is
 * owned here, and the menu reaches it through the same command path as every
 * other native action.
 */

import { openUrl } from '@tauri-apps/plugin-opener';
import { registerCommand } from '../../commands/runtime';

export const REPORT_ISSUE_URL = 'https://github.com/yungleung/yi/issues/new/choose';

export async function openIssueTracker(): Promise<void> {
  await openUrl(REPORT_ISSUE_URL);
}

export function registerIssueCommand(): void {
  registerCommand({
    id: 'help:reportIssue',
    run: async () => {
      await openIssueTracker();
      return null;
    }
  });
}
