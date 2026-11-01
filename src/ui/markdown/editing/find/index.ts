/**
 * The find-and-replace UI domain.
 *
 * Example: `FindController` owns navigation and replacement state while `FindBar` renders the
 * query, match count and controls.
 *
 * May import: the domain's bar and controller. Upholds: find UI and command orchestration share one
 * explicit entrypoint.
 */

export { FindBar } from './bar';
export type { FindBarHandlers } from './bar';
export { FindController } from './controller';
