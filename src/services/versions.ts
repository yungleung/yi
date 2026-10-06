/**
 * The versions of the document on screen: read from the repository, kept, and announced.
 *
 * The rules are pure (`services/versioning.ts`); this is the half that reads the disk and holds the
 * answer, the way `services/session.ts` is the living half of `session_rules.ts`. Two things
 * decide whether it reads at all: the reader's answer for *this* workspace — a workspace they said
 * no to is never read, so the button can be hidden from the config alone — and whether the document
 * on screen has a file to have a history. It reads when the document changes (the *path* is the
 * question, not the text, so a keystroke costs nothing), when the workspace or the answer changes,
 * and when something asks it to (`reread`: a panel opening, a version being saved).
 *
 * May import: the versioning seam, the config, the workspace's news, the session, the events, and
 * the pure rules. Upholds: one read per fact — the path it read for is remembered, and a read that
 * was overtaken by a newer one is dropped.
 */

import { versioningFacts, versioningHistory, versioningVersionText } from '../api/versioning';
import { configManager } from './config_manager';
import { eventManager } from './event_manager';
import { DOCUMENT_SESSION_CHANGED, documentSession } from './session';
import { WORKSPACE_CHANGED } from './workspace';
import { versionsState, versionsVisible, type Version, type VersionsState } from './versioning';

/** Emitted with the reading whenever it changes (a `VersionsReading`). */
export const VERSIONS_CHANGED = 'versions_changed';

/** How many versions one read asks for — the completion list's own cap. */
const VERSIONS = 50;

/** The three states the rule answers, and the one only a failed read can give. */
export type VersionsReading = VersionsState | { kind: 'unreadable'; message: string };

class VersionsOfDocument {
  private reading: VersionsReading = { kind: 'no-file' };
  private readFor: string | null = null;
  private run = 0;

  constructor() {
    for (const event of [DOCUMENT_SESSION_CHANGED, WORKSPACE_CHANGED, 'config_changed'] as const) {
      void eventManager.on(event, () => void this.refresh());
    }
  }

  /** What is known right now — the button and the panel draw from this and nothing else. */
  current(): VersionsReading {
    return this.reading;
  }

  /** The newest version, when there is one. */
  latest(): Version | null {
    return this.reading.kind === 'ready' ? (this.reading.versions[0] ?? null) : null;
  }

  /** Reads, unless this list was already read for the document on screen. */
  async refresh(): Promise<void> {
    const config = configManager.get();
    const workspace = config?.workspace ?? null;
    const path = documentSession.current()?.path ?? null;
    if (config === null || workspace === null || !versionsVisible(config, workspace)) {
      // No workspace, or none the reader agreed to: nothing here touches git.
      this.remember({ kind: 'no-file' }, null);
      return;
    }
    if (path === null) {
      this.remember({ kind: 'no-file' }, null);
      return;
    }
    if (path === this.readFor) {
      return;
    }
    await this.read(workspace, path);
  }

  /** Reads again, whatever the reason — the same document, a fresh answer. */
  async reread(): Promise<void> {
    this.readFor = null;
    await this.refresh();
  }

  private async read(workspace: string, path: string): Promise<void> {
    const mine = ++this.run;
    this.readFor = path;
    try {
      const facts = await versioningFacts(workspace);
      const repository = facts.repository.here || facts.repository.above;
      if (!repository) {
        this.remember({ kind: 'no-repository' }, path);
        return;
      }
      const versions = await versioningHistory(workspace, path, VERSIONS);
      // The newest version's own text, so the button can say whether what is on screen is in a
      // version at all — one more read of the same file, at the same moment.
      const newest = versions[0] ?? null;
      const newestText =
        newest === null
          ? null
          : await versioningVersionText(workspace, newest.hash, newest.path).catch(() => null);
      if (mine === this.run) {
        this.remember(versionsState({ path, repository, versions, newestText }), path);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Reading the versions of this note:', error);
      if (mine === this.run) {
        this.remember({ kind: 'unreadable', message }, path);
      }
    }
  }

  private remember(reading: VersionsReading, path: string | null): void {
    this.readFor = path;
    const changed = JSON.stringify(reading) !== JSON.stringify(this.reading);
    this.reading = reading;
    if (changed) {
      void eventManager.emit(VERSIONS_CHANGED, reading);
    }
  }
}

/** The app's versions of the document on screen. One per app. */
export const versionsOfDocument = new VersionsOfDocument();
