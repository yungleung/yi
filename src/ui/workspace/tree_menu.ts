/**
 * The workspace tree's context menu, as a native menu.
 *
 * It is the same shape as the table's (`table/index.ts`): rebuilt for every
 * right-click from the model (`tree_menu_model.ts`), so its items are exactly right for
 * what was clicked, popped up at the pointer, and each item's action runs the command the
 * model names for the entry that was captured before the menu took focus.
 *
 * This is the only module in the tree that touches Tauri's menu API, and it does so inside
 * the function, so nothing else depends on it.
 *
 * May import: the model (`./tree_menu_model`). Upholds: what a menu offers is the model's
 * answer, and the entry an item acts on is the one that was clicked.
 */

import type { TreeMenuAction, TreeMenuEntry } from './tree_menu_model';
import { treeMenuNodes } from './tree_menu_model';

/** Shows the menu for `entry` at a point on screen; `onAction` runs what was chosen. */
export async function showTreeMenu(
  entry: TreeMenuEntry,
  at: { x: number; y: number },
  onAction: (action: TreeMenuAction) => void
): Promise<void> {
  const { Menu, MenuItem, PredefinedMenuItem } = await import('@tauri-apps/api/menu');
  const { LogicalPosition } = await import('@tauri-apps/api/dpi');
  const items = await Promise.all(
    treeMenuNodes(entry).map(async (node) =>
      node.kind === 'separator'
        ? await PredefinedMenuItem.new({ item: 'Separator' })
        : await MenuItem.new({
            id: node.id,
            text: node.label,
            action: () => onAction(node.id)
          })
    )
  );
  const menu = await Menu.new({ items });
  await menu.popup(new LogicalPosition(at.x, at.y));
}
