/**
 * The first start's answer, turned into a workspace: make one under the reader's documents folder,
 * or open the folder they chose, and then take the very path the File menu's *Open Folder…* takes.
 *
 * That path is `workspaceManager.openWorkspace`: it announces `WORKSPACE_CHANGED`, so the tree
 * loads, and it persists the config, so the next start comes up where this one left off. Nothing
 * here re-implements it — the last thing the flow does is remember that the question was answered.
 *
 * `documents` is a parameter, not a constant, so a probe can point the whole flow at a folder of
 * its own: no test writes into the reader's Documents.
 *
 * May import: the app's path and file commands, the config, the workspace manager, the notice
 * service, the card and the rule. Upholds: one flow for "the reader has a workspace now", whether
 * the folder was made or chosen.
 */

import { documentDir, join } from '@tauri-apps/api/path';
import { createEntry } from '../../api/files';
import { configManager } from '../../services/config_manager';
import { DEFAULT_WORKSPACE_NAME } from '../../services/workspace';
import { notify } from '../../services/messages';
import { t } from '../../services/i18n';
import { workspaceManager } from '../../services/workspace';
import { workspaceSetupDialog, type WorkspaceChooser } from './workspace_setup_dialog';

/**
 * Asks the reader where their workspace is and opens it. Nothing is written when they decline —
 * not even the fact that they were asked, so the next start asks again.
 */
export async function runWorkspaceSetup(
  chooser: WorkspaceChooser = workspaceSetupDialog,
  documents: string | null = null
): Promise<void> {
  const folder = documents ?? (await documentDir().catch(() => null));
  if (folder === null) {
    notify('Setting up a workspace', new Error(t('workspace.setup.noDocuments')));
    return;
  }
  const defaultFolder = await join(folder, DEFAULT_WORKSPACE_NAME);
  const answer = await chooser.choose({ defaultFolder });
  if (answer === null) {
    return;
  }
  let path = defaultFolder;
  if ('create' in answer) {
    try {
      path = await createEntry(folder, DEFAULT_WORKSPACE_NAME, false);
    } catch (error) {
      // A folder that is already there is the workspace the reader is being offered; anything else
      // is the backend saying no, and they hear it.
      if (!String(error).includes('already exists')) {
        notify('Setting up a workspace', error);
        return;
      }
    }
  } else {
    path = answer.path;
  }
  await workspaceManager.openWorkspace(path);
  await configManager.update({ workspace_asked: true });
}
