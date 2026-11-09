/**
 * The table context-menu domain.
 *
 * Example: the Markdown table domain computes menu availability, while
 * `showTableMenu` renders and dispatches the chosen command for the shell.
 *
 * May import: the Markdown table types and native-menu adapter. Upholds: only
 * native menu presentation lives here; command availability stays in Markdown.
 */

export { showTableMenu } from './menu';
export { TablePicker, registerTablePickerCommand } from './picker';
export type { TableSize } from './picker';
