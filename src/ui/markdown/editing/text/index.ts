/**
 * The normal text-editing command domain.
 *
 * Example: `insertText`, `deleteText` and `insertNewline` are the ordinary typing path;
 * `insertCommitted` accepts IME text and `toggleTask` rewrites a rendered task marker.
 *
 * May import: the domain's insertion, deletion, newline, task and caret-context
 * modules. Upholds: text commands share one public surface while each operation
 * keeps its own focused implementation.
 */

export { deleteText } from './deletion';
export { insertCommitted, insertText } from './insertion';
export { insertNewline } from './newline';
export { toggleTask } from './task';
export { blockAtCaret } from './context';
