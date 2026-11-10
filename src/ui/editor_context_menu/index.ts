/**
 * The editor context-menu domain.
 *
 * Example: the main window installs its native presenter and uses the same
 * anchor for a table picker opened from a menu or titlebar.
 *
 * May import: this domain's model, native presenter and anchor rule. Upholds:
 * one public entrypoint for menu presentation and editor-action placement.
 */

export { showEditorContextMenu } from './menu';
export { documentCaretBox, documentSelectionBox, editorActionAnchor } from './anchor';
export { editorContextMenuModel } from './model';
export type {
  EditorContextMenuFacts,
  EditorContextMenuItem,
  EditorContextMenuNode,
  EditorContextMenuSeparator
} from './model';
