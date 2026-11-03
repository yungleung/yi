/**
 * The status-bar presentation domain.
 *
 * Example: the shell mounts `ui/status_bar.ts` separately and composes document, words,
 * layout, version and export status items from this collection.
 *
 * May import: the status item siblings. Upholds: addable items have one stable surface while
 * each retains its own state owner and update events.
 */

export { SavedStatus, StackStatus } from './document';
export { ExportProgressStatus } from './export_progress';
export { LayoutStatus } from './layout';
export { VersionStatus } from './version';
export { WordsCountStatus } from './words';
