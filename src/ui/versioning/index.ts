/**
 * The note-version UI domain.
 *
 * Example: the status bar mounts `VersionStatus`, which opens `VersionHistoryModal` and delegates
 * saving through `saveVersion`.
 *
 * May import: the version UI siblings. Upholds: version controls, history, diff and save keep one
 * public entrypoint.
 */

export { VersionCommentDialog, versionCommentDialog } from './comment_dialog';
export { VersionDiffView } from './diff_view';
export type { VersionToSee } from './diff_view';
export { VersionHistoryModal } from './history_modal';
export { VersionStatus } from './status';
export {
  VersioningDialog,
  versioningDialog
} from './dialog';
export type {
  VersioningChooser,
  VersioningQuestion
} from './dialog';
export { registerVersionCommand, saveVersion } from './save';
