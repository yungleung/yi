/**
 * Clipboard editing inside the Markdown document.
 *
 * Example: Copy returns the selected raw Markdown, Cut writes it to the host
 * clipboard through the browser event, and Paste becomes one document edit.
 *
 * May import: the clipboard command module. Upholds: all clipboard actions map
 * raw document ranges; native host reads outside an event enter through
 * `MarkdownHost.clipboard`.
 */

export { copySelection, cutSelection, pasteText, selectAll } from './commands';
