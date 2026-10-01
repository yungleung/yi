/**
 * The facts the versioning decision needs, asked of the backend.
 *
 * `src-tauri/src/versioning.rs` gathers them — which git may be run, whether the folder is in a
 * repository, whether a cloud drive could reach it — and this is the one way the frontend reads
 * them. Nothing here decides anything: the rule is `src/services/versioning.ts`, and it is pure.
 */

import { invoke } from '@tauri-apps/api/core';
import type { VersioningReport } from '../services/versioning';

/** What is true of the machine and `workspace` right now. */
export async function versioningFacts(workspace: string): Promise<VersioningReport> {
  return await invoke<VersioningReport>('versioning_facts', { workspace });
}
