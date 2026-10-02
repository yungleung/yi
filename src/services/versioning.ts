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
  /**
   * Where a repository of ours keeps its git directory — the app's own data folder, named after the
   * workspace — or null when there is no folder to put one in. This is the path the words about a
   * synced folder name, and the one `init_workspace_repository` is given.
   */
  separate_git_dir: string | null;
}

/** The facts, plus what a person may want to see about them (what the backend reports). */
export interface VersioningReport extends VersioningFacts {
  // The two multi-word fields keep the backend's own names, as every wire struct in this app does
  // (`src/api/files.ts: is_file`, `src/api/settings.ts: config_version`): one spelling, one home.
  /** Where git was found — "env" is the test seam, "clt" the system one behind xcode-select. */
  git_source: string;
  /** The path shape, refusal or attribute the cloud answer was read from. */
  cloud_evidence: string;
  /** What the repository has configured, for a commit that must use the reader's own name. */
  identity: GitIdentity;
}

/** The name and address a commit carries. */
export interface GitIdentity {
  name: string | null;
  email: string | null;
}

/** The name and address a commit carries in a repository the app made itself. */
export const APP_IDENTITY: GitIdentity = { name: 'Yi', email: 'yi@localhost' };

/** One version of a file: a commit that touched it, as the backend reports it. */
export interface Version {
  hash: string;
  /** Unix seconds, the author's date. */
  at: number;
  subject: string;
  body: string;
  /** The name the file had *at this commit*, repo-relative — what reading this version needs. */
  path: string;
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

/**
 * The reader's answer as the config holds it. An answer given for another folder is no answer:
 * consent belongs to a workspace, and a reader who keeps versions of their notes has not agreed to
 * keep them of a folder they open next.
 */
export function consentFrom(stored: StoredConsent, workspace: string): Consent {
  if (stored.versioning_workspace !== workspace) {
    return 'unasked';
  }
  return stored.versioning ? 'yes' : 'no';
}

/** What the config remembers of the reader's answer: the answer, and the workspace it was for. */
export interface StoredConsent {
  versioning: boolean;
  versioning_workspace: string | null;
}

/**
 * Where the versions live, for the words that name it: the repository they already have, or the
 * git directory we would keep outside a folder a cloud drive could reach.
 */
export function versionLocation(facts: VersioningFacts, plan: VersioningPlan): string | null {
  if (plan.use === 'theirs') {
    return facts.repository.toplevel;
  }
  if (plan.use === 'init') {
    // A repository made in the workspace itself is the ordinary thing — there is no surprising
    // path to name — and one whose git directory lives elsewhere is exactly what a reader wants to
    // see written out.
    return plan.separateGitDir ? facts.separate_git_dir : null;
  }
  return null;
}

/** When a version was made, as `YYYY-MM-DD HH:MM` in the reader's own time. */
export function versionStamp(at: number): string {
  const when = new Date(at * 1000);
  const two = (value: number) => String(value).padStart(2, '0');
  const date = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`;
  return `${date} ${two(when.getHours())}:${two(when.getMinutes())}`;
}

/**
 * The message a version carries: the note's own name and the minute it was asked for as the
 * subject — so `git log --oneline` reads like the reader's own list of notes, and the app's own
 * list reads the same — and the reader's comment as the body when they gave one.
 */
export function versionMessage(
  name: string,
  at: Date,
  comment: string
): { subject: string; body: string | null } {
  const said = comment.trim();
  return {
    subject: `${name} · ${versionStamp(Math.floor(at.getTime() / 1000))}`,
    body: said === '' ? null : said
  };
}

/** What the status bar's versions button and its panel have to say: nothing, and why. */
export type VersionsState =
  | { kind: 'no-file' }
  | { kind: 'no-repository' }
  | { kind: 'ready'; path: string; versions: Version[]; newestText: string | null };

/**
 * Whether the text on screen is what the newest version holds — the one thing that says the reader's
 * work is in a version rather than only in the file. `null` is *no version at all*, which is not a
 * version either.
 */
export function versionedNow(newestText: string | null, content: string): boolean {
  return newestText !== null && newestText === content;
}

/**
 * Whether the versions button belongs in the status bar at all: the reader's answer for *this*
 * folder, and nothing else — read from the config, so a workspace they said no to never runs git.
 */
export function versionsVisible(stored: StoredConsent, workspace: string): boolean {
  return consentFrom(stored, workspace) === 'yes';
}

/**
 * What the list is, from the three things that decide it: whether the document on screen has a file,
 * whether anything has made a repository to read, and the versions themselves (which may be none).
 * The fourth state — a read that failed — is not derived from anything; only a failed read can say
 * it, and `services/versions.ts` is where that happens.
 */
export function versionsState(input: {
  path: string | null;
  repository: boolean;
  versions: Version[];
  newestText: string | null;
}): VersionsState {
  if (input.path === null) {
    return { kind: 'no-file' };
  }
  if (!input.repository) {
    return { kind: 'no-repository' };
  }
  return {
    kind: 'ready',
    path: input.path,
    versions: input.versions,
    newestText: input.newestText
  };
}
