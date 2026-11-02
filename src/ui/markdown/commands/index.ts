/**
 * Markdown's command registration capability.
 *
 * Example: the editor calls `registerEditorCommands({...})` once during construction,
 * after which keyboard, toolbar, native-menu and agent clients dispatch the same ids.
 *
 * May import: the command capability's focused modules. Upholds: command ownership
 * has one explicit public entrypoint.
 */

export { registerEditorCommands } from './editor_commands';
export type { CommandHost } from './editor_commands';
