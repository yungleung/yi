/**
 * The number of exports currently running, owned independently of the status bar.
 *
 * Example: two exports begin and one finishes; listeners hear `{ active: 1 }`, then
 * `{ active: 0 }`, and the status item hides only after the last owner finishes.
 *
 * May import: the typed event manager. Upholds: every begin has an idempotent finish, and
 * conditional export UI derives from the announced active-owner count.
 */

import { eventManager } from './events';

export const EXPORT_ACTIVITY_CHANGED = 'export_activity_changed';

/** The state a status listener needs; ids stay private to the owner. */
export interface ExportActivityState {
  readonly active: number;
}

/** The narrow port an export run needs so it never knows where progress is drawn. */
export interface ExportProgress {
  begin(): () => void;
}

/** Tracks overlapping exports and announces each change to their active count. */
export class ExportActivity implements ExportProgress {
  private readonly active = new Set<symbol>();

  current(): ExportActivityState {
    return { active: this.active.size };
  }

  begin(): () => void {
    const owner = Symbol('export');
    this.active.add(owner);
    this.announce();
    return () => {
      if (this.active.delete(owner)) {
        this.announce();
      }
    };
  }

  private announce(): void {
    void eventManager.emit(EXPORT_ACTIVITY_CHANGED, this.current());
  }
}

/** The app-wide export activity state owner. */
export const exportActivity = new ExportActivity();
