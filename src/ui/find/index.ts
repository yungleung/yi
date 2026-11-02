/**
 * The shell-owned find and replace interface.
 *
 * Example: the editor panel creates a `FindBar` and `FindController`; the
 * controller drives Markdown through its public search API.
 *
 * May import: the bar and controller siblings. Upholds: all translated controls
 * and presentation stay outside the Markdown domain.
 */

export { FindBar } from './bar';
export type { FindBarHandlers } from './bar';
export { FindController } from './controller';
