/**
 * Asking for a version of the note on screen, and keeping it.
 *
 * This is the only action that runs git, and it runs it only because the reader asked for it by
 * name (`version:save`, the *File → Save a Version* item): no timer, no quit hook, no on-save
 * commit (`docs/superpowers/specs/2026-10-01-workspace-versioning-design.md`). The order is the
 * spec's, and each step is here because it is observable on its own:
 *
 * 1. what is true of the machine and the folder (`api/versioning.ts`), and the reader's answer for
 *    *this* workspace out of the config — an answer given for another folder is no answer;
 * 2. the plan the two make (`services/versioning/rules.ts`), including the questions it says to ask
 *    first — consent, and the risk a folder a cloud drive could reach earns — remembered with the
 *    path they were asked about;
 * 3. a note with no file is refused in one sentence rather than met with a save sheet in the middle
 *    of asking for a version;
 * 4. the editor's text is captured into the session and written (atomically, `src-tauri/src/files.rs`),
 *    because the session's copy can be a keystroke behind and a commit before the write would
 *    version the previous text;
 * 5. `git add -- <path>` then `git commit -m <message> -- <path>` — the pathspec is the point: a
 *    version of ours holds the file we wrote and never sweeps up the reader's staged work.
 *
 * May import: the versioning commands, the config, the session, the messages the reader sees, the
 * command registry's registration, and the pure rules. Upholds: a version exists only when the
 * reader asked, and only the file this app just wrote is ever committed.
 */

import { commitPaths, initWorkspaceRepository, versioningFacts } from '../../api/versioning';
import { configManager } from '../../services/config_manager';
import { t } from '../../services/i18n';
import { notify } from '../../services/messages';
import { documentSession } from '../../services/session';
import { versionsOfDocument } from '../../services/versioning';
import {
  APP_IDENTITY,
  consentFrom,
  versionLocation,
  versionMessage,
  versioningPlan
} from '../../services/versioning';
import { registerCommand } from '../../commands/runtime';
import { versionCommentDialog, type VersionCommentDialog } from './version_comment_dialog';
import { versioningDialog, type VersioningChooser } from './versioning_dialog';

/** Registers the command the File menu's *Save a Version* item names. */
export function registerVersionCommand(chooser: VersioningChooser = versioningDialog): void {
  registerCommand({
    id: 'version:save',
    run: async () => {
      await saveVersion(chooser);
      return null;
    }
  });
}

/** Asks what the facts and the reader's answer call for, and does exactly that. */
export async function saveVersion(
  chooser: VersioningChooser = versioningDialog,
  comments: VersionCommentDialog = versionCommentDialog
): Promise<void> {
  const config = configManager.get() ?? (await configManager.load());
  const workspace = config.workspace ?? null;
  if (!workspace) {
    notify('Saving a version', new Error(t('version.noWorkspace')));
    return;
  }

  const facts = await versioningFacts(workspace);
  let plan = versioningPlan(facts, consentFrom(config, workspace));
  if (plan.ask === 'consent') {
    const question = {
      ask: 'consent' as const,
      location: versionLocation(facts, plan),
      separated: plan.separateGitDir
    };
    const agreed = await chooser.ask(question);
    // Remembered with the folder it was asked about, whichever way it went: declining is an answer
    // too, and it is what keeps the next ask from being a nag.
    await configManager.update({ versioning: agreed, versioning_workspace: workspace });
    if (!agreed) {
      return;
    }
    plan = versioningPlan(facts, 'yes');
  }
  if (plan.ask === 'cloud-risk') {
    const goes = await chooser.ask({
      ask: 'cloud-risk',
      location: versionLocation(facts, plan),
      separated: plan.separateGitDir
    });
    if (!goes) {
      return;
    }
  }
  if (plan.blocked !== null) {
    notify('Saving a version', new Error(t('version.noGit')));
    return;
  }
  if (plan.use === 'none') {
    // The reader has said no to versions in this workspace before. They asked again, so they are
    // told where that answer lives rather than left with an action that silently does nothing.
    notify('Saving a version', new Error(t('version.declined')));
    return;
  }

  const document = documentSession.current();
  if (!document?.path) {
    notify('Saving a version', new Error(t('version.noFile')));
    return;
  }
  // What to call it, asked last of all the questions and only once the version can be written: a
  // comment typed for a version that could not be made would be worse than no card at all.
  const comment = await comments.ask();
  if (comment === null) {
    return;
  }
  if (!(await documentSession.writeCurrent())) {
    // The write itself says what went wrong (`services/session/index.ts`).
    return;
  }
  const saved = documentSession.current();
  if (!saved?.path) {
    return;
  }
  try {
    if (plan.use === 'init') {
      await initWorkspaceRepository(workspace, plan.separateGitDir);
    }
    const message = versionMessage(saved.title, new Date(), comment);
    await commitPaths(
      workspace,
      [saved.path],
      message.subject,
      // Ours carries our name; theirs carries theirs, and a repository with no name configured
      // says so in git's own words (`src-tauri/src/versioning.rs: commit_paths`).
      plan.use === 'theirs' ? null : APP_IDENTITY,
      message.body
    );
    // The commit is the fact the status bar and history modal draw from. Read it before this action
    // returns, so the reader sees the version they just made without waiting for another event.
    await versionsOfDocument.reread();
  } catch (error) {
    notify('Saving a version', error);
  }
}
