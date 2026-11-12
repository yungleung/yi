/**
 * The updater's state owner: one check at a time, consent before install, and
 * one relaunch after a successful install.
 *
 * Example: two quick Help-menu presses share one GitHub request instead of
 * offering the same release twice.
 *
 * May import: updater contracts only. Upholds: Tauri and reader UI stay behind
 * the injected ports.
 */

import type {
  UpdateBackend,
  UpdateMode,
  UpdatePresenter,
  UpdateResult
} from './contracts';

/** Turns any thrown value into the sentence a manual check can show. */
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs the update decision once and shares it with concurrent callers. */
export class UpdateController {
  private running: Promise<UpdateResult> | null = null;

  constructor(
    private readonly backend: UpdateBackend,
    private readonly presenter: UpdatePresenter
  ) {}

  /**
   * Checks for a release and, with consent, installs and relaunches.
   *
   * Example: `check('startup')` stays silent when offline, while
   * `check('manual')` explains the failure.
   */
  check(mode: UpdateMode): Promise<UpdateResult> {
    if (this.running) {
      return this.running;
    }
    this.running = this.runCheck(mode).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runCheck(mode: UpdateMode): Promise<UpdateResult> {
    try {
      const update = await this.backend.check();
      if (!update) {
        if (mode === 'manual') {
          this.presenter.current();
        }
        return 'current';
      }
      if (!(await this.presenter.confirm(update))) {
        // The reader's answer is already final; failing to release the transient
        // resource must not turn a successful decline into a visible error.
        await update.discard().catch(() => {});
        return 'declined';
      }
      await update.install();
      await this.backend.relaunch();
      return 'installed';
    } catch (error) {
      if (mode === 'manual') {
        this.presenter.failed(failureMessage(error));
      }
      return 'failed';
    }
  }
}
