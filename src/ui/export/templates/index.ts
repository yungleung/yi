/**
 * The export-template package UI domain.
 *
 * Example: the export card and manager both use `TemplatePackageBrowser`; the editor opens
 * `templateEditorPanel` for package details and source files.
 *
 * May import: the package browser, lifecycle operations, rows, dialogs, file list, code editor and
 * package editor siblings. Upholds: one public surface for package selection and editing.
 */

export {
  TemplatePackageBrowser
} from './browser';
export type {
  PackageBrowserHandlers,
  PackageBrowserState
} from './browser';
export { removeTemplatePackage } from './operations';
export { createDefaultDialog, CreateDefaultDialog } from './create_default_dialog';
export type { DefaultTemplateAnswer } from './create_default_dialog';
export {
  TemplateDetailsDialog,
  showBrokenTemplateDetails,
  templateDetailsDialog
} from './details';
export { TemplateEditorPanel, templateEditorPanel } from './editor';
export {
  ImportProposalDialog,
  importProposalDialog
} from './import_dialog';
export { TEMPLATE_KINDS } from './kinds';
export {
  TemplateLibraryDialog,
  templateLibraryDialog
} from './library';
export type { TemplateChoice } from './library';
export { MANIFEST_SCHEMA, manifestShapeIssues } from './manifest_rules';
export { offeredForKind, offeredPackages } from './offering';
export {
  createDefaultPackageRow,
  createPackageRow
} from './rows';
export type { PackageRowState } from './rows';
export { renderTemplateFiles } from './file_list';
export type { TemplateFileActions } from './file_list';
