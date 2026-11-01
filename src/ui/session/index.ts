/**
 * The session UI domain.
 *
 * Example: the app registers Save and Save As once, while the titlebar mounts the stack panel.
 *
 * May import: the session command and stack modules. Upholds: the shell depends on two named UI
 * capabilities, not the files that happen to implement them.
 */

export { registerSessionCommands } from './commands';
export { StackPopover } from './stack';
