/**
 * The editor's request for the shell to present its native context menu.
 *
 * Example: a right-click captures the pointer position and whether selected
 * text or a caret exists; the shell builds the menu and dispatches commands.
 *
 * May import: nothing. Upholds: Markdown owns editor semantics while the shell
 * owns native menu presentation.
 */

/** The editor facts a native context menu is built from. */
export interface EditorMenuRequest {
  readonly at: { readonly x: number; readonly y: number };
  readonly readOnly: boolean;
  readonly hasSelection: boolean;
  readonly hasCaret: boolean;
}

/** The shell's editor-menu presentation. */
export type EditorMenuHandler = (request: EditorMenuRequest) => void;

let handler: EditorMenuHandler | null = null;

/** Installs this window's native editor-menu presenter. */
export function setEditorMenuHandler(next: EditorMenuHandler | null): void {
  handler = next;
}

/** Asks the shell to present the editor menu at the captured point. */
export function requestEditorMenu(request: EditorMenuRequest): void {
  handler?.(request);
}
