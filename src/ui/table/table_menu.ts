/**
 * The table's native context menu: builds the system menu the menu model describes, and runs the
 * command a chosen item names.
 *
 * May import: the command registry, the menu model and the menu API. Upholds: the menu is built from
 * the pure model (`table_menu_model.ts`), so what it offers and what it does cannot drift.
 */

import { runCommand } from '../../commands/runtime';
import type { TableCommand, TableTarget } from '../markdown/editing/table';
import type { TableMenuNode } from './table_menu_model';
import type { MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';

/**
 * Shows the native context menu for a table cell.
 *
 * The menu is rebuilt for every right-click, so its items are enabled exactly
 * as the table is at that moment. Choosing an item runs the command the item
 * names, passing the *captured* target: a native menu takes focus while it is
 * open, so the command must not read the live caret to find out what it acts
 * on.
 *
 * This is the only module that touches Tauri's menu API, and it does so inside
 * the function, so nothing else in the editor depends on it.
 */
export async function showTableMenu(
  nodes: TableMenuNode[],
  target: TableTarget,
  at: { x: number; y: number }
): Promise<void> {
  const { Menu } = await import('@tauri-apps/api/menu');
  const { LogicalPosition } = await import('@tauri-apps/api/dpi');
  const menu = await Menu.new({
    items: await Promise.all(nodes.map((node) => toNode(node, target)))
  });
  await menu.popup(new LogicalPosition(at.x, at.y));
}

/** One menu node as the Tauri API wants it. */
async function toNode(
  node: TableMenuNode,
  target: TableTarget
): Promise<MenuItem | Submenu | PredefinedMenuItem> {
  const { MenuItem, Submenu, PredefinedMenuItem } = await import('@tauri-apps/api/menu');
  if (node.kind === 'separator') {
    return PredefinedMenuItem.new({ item: 'Separator' });
  }
  if (node.kind === 'submenu') {
    return Submenu.new({
      text: node.label,
      items: await Promise.all(node.items.map((child) => toNode(child, target)))
    });
  }
  const command: TableCommand = node.command;
  return MenuItem.new({
    id: node.id,
    text: node.label,
    enabled: node.enabled,
    action: () => {
      runCommand(`table:${command}`, target, 'context-menu');
    }
  });
}
