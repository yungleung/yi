/**
 * What a run may read back as its own from the page's stash.
 *
 * The bridge gives one script five seconds, and a probe that outlives it keeps running — the
 * harness then polls the page for what that probe stashed (`window.__probeResult`, and every
 * `t.report` in `window.__probeSteps`) so a slow probe is still evidence rather than a hole.
 * The stash is *one slot for the whole page*, though, so a later run has to be able to tell
 * its own report from one a still-running earlier probe leaves behind. Measured without that
 * (a probe that stashes a result three seconds after its own run was read, then a probe that
 * outlives the bridge and never reports): the second run printed the first one's result as
 * *recovered*, and exited 0 — a pass on evidence that was never its own, and in a sweep a
 * false pass is worse than a failure.
 *
 * So each run stamps what it writes with the run it belongs to — the token is made where the
 * probe's own wrapper is built (`test/tauri-probe.mjs`) and captured in that script's own
 * scope, so a later run cannot relabel it — and only a frame whose token is the run's own is
 * read back.
 *
 * May import: nothing. Upholds: a probe's evidence is the run's own, or it is a failure.
 */

/** What a run writes into the page's stash: which run, and what it reported. */
export function frameFor(run, value) {
  return { run, value };
}

/**
 * The value a poll may read back as `run`'s own: the frame's value when the frame is that
 * run's, and `null` for anything else — another run's frame, a frame written before this
 * change existed, or nothing at all. `null` is also what an absent result reads as, which is
 * what the harness's poll already treats as "nothing to report yet".
 */
export function ownFrame(frame, run) {
  if (!frame || typeof frame !== 'object' || frame.run !== run) {
    return null;
  }
  return 'value' in frame ? frame.value : null;
}
