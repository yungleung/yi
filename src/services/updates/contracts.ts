/**
 * The updater's ports: what a release provides, how the app installs it, and
 * how the reader hears the result. No Tauri or DOM type crosses this boundary.
 *
 * May import: nothing. Upholds: backend and presentation dependencies are
 * interfaces, so the flow stays testable without Tauri or a page.
 */

/** The reader-facing facts about one release, before it is installed. */
export interface UpdateSummary {
  readonly version: string;
  readonly currentVersion: string;
  readonly notes: string | null;
  readonly date: string | null;
}

/** A release the backend knows how to install. */
export interface RemoteUpdate extends UpdateSummary {
  install(): Promise<void>;
  /** Releases the backend's temporary update resource when installation is declined. */
  discard(): Promise<void>;
}

/** The platform work an update check needs. */
export interface UpdateBackend {
  check(): Promise<RemoteUpdate | null>;
  relaunch(): Promise<void>;
}

/** Whether a check came from launch or from the Help menu. */
export type UpdateMode = 'startup' | 'manual';

/** What the update flow concluded. */
export type UpdateResult = 'available' | 'current' | 'declined' | 'installed' | 'failed';

/** How the flow asks the reader and reports quiet outcomes. */
export interface UpdatePresenter {
  confirm(update: UpdateSummary): Promise<boolean>;
  current(): void;
  failed(message: string): void;
}
