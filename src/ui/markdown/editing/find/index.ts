/**
 * Search and replacement over the Markdown document.
 *
 * Example: the shell find bar calls `search`, `next` and `replaceAll` through
 * `MarkdownFindApi`, while owning every word and control it draws.
 *
 * May import: the find session only. Upholds: the public API returns counts,
 * not localized UI text.
 */

export { MarkdownFindSession } from './session';
export type { FindSummary, MarkdownFindApi } from './session';
