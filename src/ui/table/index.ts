/**
 * The table context-menu domain.
 *
 * Example: a right-click asks `tableMenuModel` what actions are available, then `showTableMenu`
 * renders and dispatches one against the captured cell.
 *
 * May import: the pure model and native-menu adapter. Upholds: menu presentation and availability
 * share one entrypoint.
 */

export { showTableMenu } from './menu';
export { tableMenuModel } from './model';
export type { TableMenuNode } from './model';
