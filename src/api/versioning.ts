/**
 * The facts the versioning decision needs, asked of the backend.
 *
 * `src-tauri/src/versioning.rs` gathers them — which git may be run, whether the folder is in a
 * repository, whether a cloud drive could reach it — and this is the one way the frontend reads
 * them. Nothing here decides anything: the rule is `src/services/versioning/rules.ts`, and it is pure.
 *
 * May import: the app's own command seam (`invoke`) and the versioning types. Upholds: one way to
 * ask what git said, so the decision above it is made from one shape of facts.
 */

import { invoke } from '@tauri-apps/api/core';
import type { GitIdentity, Version, VersioningReport } from '../services/versioning';

/** What is true of the machine and `workspace` right now. */
export async function versioningFacts(workspace: string): Promise<VersioningReport> {
  return await invoke<VersioningReport>('versioning_facts', { workspace });
}

/**
 * Makes the workspace a repository, and answers where its git directory is.
 *
 * `separate` is the frontend plan's own answer (`services/versioning/rules.ts`) for a folder a cloud
 * drive could reach: the git directory is then kept in the app's data folder, where no cloud
 * client ever sees it, and the workspace gets only the one-line `.git` pointer file.
 */
export async function initWorkspaceRepository(
  workspace: string,
  separate: boolean
): Promise<string> {
  return await invoke<string>('init_workspace_repository', { workspace, separate });
}

/**
 * Commits exactly `paths` — the files the app wrote — under `message`.
 *
 * The identity is supplied only for a repository the app made itself; in the reader's own
 * repository git uses what they have configured, and if that is nothing, git's own sentence comes
 * back as the error.
 */
export async function commitPaths(
  workspace: string,
  paths: string[],
  message: string,
  identity: GitIdentity | null,
  body: string | null = null
): Promise<void> {
  await invoke('commit_paths', { workspace, paths, message, identity, body });
}

/**
 * Points the app at another git, or back at the one it finds itself (`null`) — the seam a probe
 * uses, since it cannot change the environment of the process it is driving
 * (`test/probes/versioning-fake-git.js`). A path that is not there means *no git*, which is how
 * `test/probes/versioning-no-git.js` asks for a machine without one.
 */
export async function pointAtGit(git: string | null): Promise<void> {
  await invoke('versioning_use_git', { git });
}

/**
 * The versions of one file, newest first — one read of the repository (`git log --follow`), or an
 * empty list when git has never seen the path.
 */
export async function versioningHistory(
  workspace: string,
  path: string,
  limit: number
): Promise<Version[]> {
  return await invoke<Version[]>('versioning_history', { workspace, path, limit });
}

/**
 * One version's own text, by the revision and the name the file had *at that commit*
 * (`git show <revision>:<path>`) — so a note renamed since then can still be read. Refuses a
 * version whose bytes are not text.
 */
export async function versioningVersionText(
  workspace: string,
  revision: string,
  path: string
): Promise<string> {
  return await invoke<string>('versioning_version_text', { workspace, revision, path });
}
