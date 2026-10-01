/**
 * What the app should do about versions, given what is true of the machine and the reader's answer.
 *
 * The reader's rules, in one place: a version exists only when they ask for one, so nothing here
 * decides *when*; a repository they already have is theirs to keep, whether it is in this folder or
 * one above it; a folder a cloud drive could reach keeps its git directory outside the folder; and
 * without git there is nothing to do but say so. The facts come from the backend
 * (`src-tauri/src/versioning.rs`) and the answer from the config, so the whole decision is pure and
 * the check beside this file walks the table.
 *
 * May import: nothing. Upholds: one home for "may we run git here, and where does it live".
 */

/** Where a workspace stands with cloud storage, as far as the machine can say. */
export type CloudKind =
  | 'none'
  | 'cloud-storage'
  | 'icloud'
  | 'onedrive'
  | 'mount'
  | 'unknown';

/** The repository the workspace is in, if any. A worktree writes `.git` as a file, not a directory. */
export interface RepositoryShape {
  /** A `.git` (directory or file) inside the workspace itself. */
  here: boolean;
  /** A repository somewhere above it — the workspace is *inside* one, which is never nested into. */
  above: boolean;
  /** The repository's root, when there is one. */
  toplevel: string | null;
}

/** Everything the decision needs, gathered by the backend. */
export interface VersioningFacts {
  /** The git the app may run, or null when the machine has none. */
  git: string | null;
  repository: RepositoryShape;
  cloud: CloudKind;
}

/** The reader's answer for this workspace. */
export type Consent = 'unasked' | 'yes' | 'no';

/** What to do, and what to say first. */
export interface VersioningPlan {
  /** `theirs` is the repository they already have; `init` makes one; `none` touches nothing. */
  use: 'none' | 'theirs' | 'init';
  /** Whether the git directory we make lives outside the workspace (the cloud-synced case). */
  separateGitDir: boolean;
  /** Something to say before acting: ask for consent, or warn about a synced folder. */
  ask: 'consent' | 'cloud-risk' | null;
  /** Why nothing can be done, when nothing can. */
  blocked: 'no-git' | null;
}

/**
 * The plan. Consent comes first — nothing is read or run before the reader has answered — and the
 * rest follows the rules: their repository as it stands, never nested, a separate git directory
 * where a cloud drive could otherwise reach `.git` (or where we cannot tell whether it could, since
 * the separate directory costs nothing in the local case: the reader's own git still works through
 * the one-line `.git` pointer file).
 */
export function versioningPlan(facts: VersioningFacts, consent: Consent): VersioningPlan {
  if (consent === 'unasked') {
    return { use: 'none', separateGitDir: false, ask: 'consent', blocked: null };
  }
  if (consent === 'no') {
    return { use: 'none', separateGitDir: false, ask: null, blocked: null };
  }
  // The reader has said yes: a machine without git is the one thing that stops us, and it is worth
  // saying rather than failing in the middle of a save.
  if (facts.git === null) {
    return { use: 'none', separateGitDir: false, ask: null, blocked: 'no-git' };
  }
  const synced = facts.cloud !== 'none';
  if (facts.repository.here || facts.repository.above) {
    // Their repository, as it is. We cannot move a `.git` they own, so a synced folder is warned
    // about rather than rearranged.
    return { use: 'theirs', separateGitDir: false, ask: synced ? 'cloud-risk' : null, blocked: null };
  }
  return { use: 'init', separateGitDir: synced, ask: synced ? 'cloud-risk' : null, blocked: null };
}
