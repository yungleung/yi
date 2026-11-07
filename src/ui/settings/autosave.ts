/**
 * Coalesces text-field edits into one ordered persistence run.
 *
 * Example: three keystrokes within 250 ms call `save` once; blur calls `flush`
 * and waits for that run, while another edit during it queues one later save.
 *
 * May import: nothing. Upholds: settings may save themselves without a button
 * and without allowing an older asynchronous write to finish after a newer one.
 */

export interface TextAutosave {
  /** Marks the field changed and schedules the next save. */
  schedule(): void;
  /** Saves pending text now and answers when the ordered queue is idle. */
  flush(): Promise<void>;
  /** Drops a pending save, for a Reset that persists its own value. */
  cancel(): void;
}

export function createTextAutosave(
  save: () => Promise<void>,
  delay = 250
): TextAutosave {
  let timer: number | null = null;
  let pending = false;
  let queue = Promise.resolve();

  const run = (): Promise<void> => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (!pending) {
      return queue;
    }
    pending = false;
    queue = queue.then(save, save);
    return queue;
  };

  return {
    schedule() {
      pending = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        timer = null;
        void run();
      }, delay);
    },
    flush() {
      return run();
    },
    cancel() {
      pending = false;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }
  };
}
