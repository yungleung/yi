/**
 * The editor's native context menu: builds system menu items from the pure model.
 *
 * Example: right-clicking outside a table offers Copy and formatting; choosing
 * Bold dispatches the same `format:bold` command as its titlebar button.
 *
 * May import: the command runtime, translations, the session and the menu API.
 * Upholds: menu presentation never edits the document directly and table cells
 * never reach this menu.
 */

import { runCommand } from '../../commands/runtime';
import { t } from '../../services/i18n';
import { documentSession } from '../../services/session';
import type { EditorMenuRequest } from '../markdown/editor_menu';
import {
  editorContextMenuModel,
  type EditorContextMenuNode
} from './model';
import type {
  MenuItem as NativeMenuItem,
  PredefinedMenuItem as NativePredefinedMenuItem
} from '@tauri-apps/api/menu';

/** Shows the editor menu at the point captured before native focus moved. */
export async function showEditorContextMenu(request: EditorMenuRequest): Promise<void> {
  const { Menu } = await import('@tauri-apps/api/menu');
  const { LogicalPosition } = await import('@tauri-apps/api/dpi');
  const document = documentSession.current();
  const nodes = editorContextMenuModel({
    readOnly: request.readOnly,
    hasSelection: request.hasSelection,
    hasCaret: request.hasCaret,
    hasDocument: document !== null,
    stacked: document?.stacked === true
  });
  const menu = await Menu.new({
    items: await Promise.all(nodes.map((node) => toNode(node)))
  });
  await menu.popup(new LogicalPosition(request.at.x, request.at.y));
}

async function toNode(
  node: EditorContextMenuNode
): Promise<NativeMenuItem | NativePredefinedMenuItem> {
  if (node.kind === 'separator') {
    const { PredefinedMenuItem } = await import('@tauri-apps/api/menu');
    return PredefinedMenuItem.new({ item: 'Separator' });
  }
  const { MenuItem } = await import('@tauri-apps/api/menu');
  return MenuItem.new({
    id: node.id,
    text: t(node.labelKey),
    enabled: node.enabled,
    accelerator: node.accelerator ?? undefined,
    action: () => {
      runCommand(node.command, null, 'context-menu');
    }
  });
}
