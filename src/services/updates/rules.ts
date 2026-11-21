/**
 * The compact release facts the native update prompt can show safely.
 *
 * Example: a 700-line GitHub body becomes five non-empty lines plus the stable release-page URL.
 *
 * May import: nothing. Upholds: native dialogs receive bounded text and an address the app can
 * open without guessing from the update payload.
 */

/** The number of non-empty release-note lines offered in the native prompt. */
export const RELEASE_NOTE_LINES = 5;

/** The first few meaningful lines of a release body, or the app's no-notes sentence. */
export function releaseNotesExcerpt(notes: string | null, noNotes: string): string {
  const lines = (notes ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? noNotes : lines.slice(0, RELEASE_NOTE_LINES).join('\n');
}

/** The GitHub release page for a version reported by the updater. */
export function releasePageUrl(version: string): string {
  const tag = version.trim().replace(/^v/, '');
  return `https://github.com/yungleung/yi/releases/tag/v${tag}`;
}
