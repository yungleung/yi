/**
 * The one reversible mapping from raw prose spaces to what HTML draws.
 *
 * HTML collapses a run of spaces and a space at the end of a text node. The
 * editor keeps every source character, but writes a no-break space for each
 * space the browser would otherwise lose. One source character still maps to
 * one rendered character, which is what lets a direct write keep the offsets.
 *
 * May import: nothing. Upholds: the displayed text is derived from the source
 * text without changing its length.
 */

const NON_BREAKING_SPACE = '\u00a0';

/** Makes every run and a trailing source space visible without changing its length. */
export function preserveSpaces(value: string): string {
  const kept = value.replace(
    / {2,}/g,
    (run) => ` ${NON_BREAKING_SPACE.repeat(run.length - 1)}`
  );
  return kept.endsWith(' ') ? `${kept.slice(0, -1)}${NON_BREAKING_SPACE}` : kept;
}
