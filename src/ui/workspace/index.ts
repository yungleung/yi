/**
 * The workspace tree domain.
 *
 * Example: the shell mounts `WorkspaceTree` from this entrypoint and reacts to `DOCUMENT_OPENED`
 * when a row chooses a note.
 *
 * May import: the tree implementation. Upholds: workspace UI has one public entrypoint.
 */

export {
  DOCUMENT_OPENED,
  refreshTreeFolders,
  WorkspaceTree
} from './tree';
export type {
  DropDecision,
  RenameTarget,
  TreeEntry,
  TreeHost,
  TreeMenuAction,
  TreeMenuEntry,
  TreeMenuNode
} from './tree';
