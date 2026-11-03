/**
 * The status-bar presentation domain.
 *
 * Example: the shell mounts the generic `StatusBar` container and composes document, words,
 * layout, version and export status items from this one entrypoint.
 *
 * May import: the container and its status item siblings. Upholds: callers see one stable
 * status-bar surface while each item retains its own state owner and update events.
 */

export { StatusBar } from './bar';
export { SavedStatus, StackStatus } from './document';
export { ExportProgressStatus } from './export_progress';
export { LayoutStatus } from './layout';
export { VersionStatus } from './version';
export { WordsCountStatus } from './words';
