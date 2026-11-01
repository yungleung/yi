/**
 * The first-start workspace setup domain.
 *
 * Example: startup asks `workspaceSetupDialog` for an answer and passes it to `runWorkspaceSetup`,
 * which creates or opens the folder through the workspace manager.
 *
 * May import: the setup dialog and flow siblings. Upholds: one setup question and one setup flow.
 */

export {
  WorkspaceSetupDialog,
  workspaceSetupDialog
} from './dialog';
export type {
  WorkspaceChooser,
  WorkspaceSetupAnswer,
  WorkspaceSetupRequest
} from './dialog';
export { runWorkspaceSetup } from './flow';
