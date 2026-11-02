/**
 * The editor lifecycle and interaction-adapter domain.
 *
 * Example: `markdown_editor.ts` composes keyboard adapters, page layout, render
 * context and remembered view state through this entrypoint.
 *
 * May import: the editor siblings. Upholds: one public surface for editor lifecycle adapters.
 */

export { applyEditorHistory } from './history';
export type { EditorHistoryHost } from './history';
export { handleArrowKey, handleEditorShortcut } from './keyboard';
export {
  EDITOR_LAYOUT_CHANGED,
  EditorPageLayout
} from './page_layout';
export type { EditorLayout } from './page_layout';
export { createEditorRenderContext } from './render_context';
export { EditorViewState } from './view_state';
export type { EditorViewDependencies } from './view_state';
