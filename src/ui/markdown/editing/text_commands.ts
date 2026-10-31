/**
 * The stable public text-path facade for typing, deleting, Enter and task
 * checkboxes.
 *
 * Example: callers keep importing `insertText` or `insertNewline` from this
 * module; insertion, deletion and line continuation can evolve behind it
 * without changing the key path's imports.
 *
 * May import: the focused command modules. Upholds: these are the same four
 * text-path entry points every key and input-method path used before.
 */

export { insertCommitted, insertText } from './text_insertion';
export { deleteText } from './text_deletion';
export { insertNewline } from './text_newline';
export { toggleTask } from './task_command';
