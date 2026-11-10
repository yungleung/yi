/**
 * The editor context menu as data: its command groups, wording and enabled state.
 *
 * Example: a writable document with a selection enables Cut and Copy, while a
 * read-only document leaves Copy and Select All available and removes writes.
 *
 * May import: the command-id contract. Upholds: every menu item names one app
 * command, so the native menu has no private implementation of an editor action.
 */

import type { CommandId } from '../../commands/contracts';

/** The editor facts that decide which menu commands are available. */
export interface EditorContextMenuFacts {
  readonly readOnly: boolean;
  readonly hasSelection: boolean;
  readonly hasCaret: boolean;
  readonly hasDocument: boolean;
  readonly stacked: boolean;
}

/** One command item in the menu. */
export interface EditorContextMenuItem {
  readonly kind: 'item';
  readonly id: string;
  readonly labelKey: string;
  readonly command: CommandId;
  readonly accelerator: string | null;
  readonly enabled: boolean;
}

/** A visual separator between command groups. */
export interface EditorContextMenuSeparator {
  readonly kind: 'separator';
}

export type EditorContextMenuNode =
  | EditorContextMenuItem
  | EditorContextMenuSeparator;

const item = (
  id: string,
  labelKey: string,
  command: CommandId,
  enabled: boolean,
  accelerator: string | null = null
): EditorContextMenuItem => ({
  kind: 'item',
  id,
  labelKey,
  command,
  accelerator,
  enabled
});

const separator = (): EditorContextMenuSeparator => ({ kind: 'separator' });

/**
 * Builds the context menu for the editor under the pointer.
 *
 * Example: `{ hasSelection: false, stacked: true, ... }` disables Cut and Copy
 * while the session item reads "Take out of the stack".
 */
export function editorContextMenuModel(
  facts: EditorContextMenuFacts
): readonly EditorContextMenuNode[] {
  const writable = !facts.readOnly && facts.hasCaret;
  const session = facts.hasDocument;
  return [
    item('cut', 'menu.edit.cut', 'edit:cut', writable && facts.hasSelection, 'CmdOrCtrl+X'),
    item('copy', 'menu.edit.copy', 'edit:copy', facts.hasSelection, 'CmdOrCtrl+C'),
    item('paste', 'menu.edit.paste', 'edit:paste', writable, 'CmdOrCtrl+V'),
    item('select-all', 'menu.edit.selectAll', 'edit:selectAll', facts.hasDocument, 'CmdOrCtrl+A'),
    separator(),
    item('bold', 'toolbar.bold', 'format:bold', writable, 'CmdOrCtrl+B'),
    item('italic', 'toolbar.italic', 'format:italic', writable, 'CmdOrCtrl+I'),
    item(
      'strike',
      'toolbar.strikethrough',
      'format:strikethrough',
      writable,
      'CmdOrCtrl+Shift+X'
    ),
    item('code', 'toolbar.inlineCode', 'format:inlineCode', writable, 'CmdOrCtrl+E'),
    separator(),
    item('link', 'toolbar.link', 'edit:insertLink', writable, 'CmdOrCtrl+K'),
    item('image', 'toolbar.image', 'edit:insertImage', writable, 'CmdOrCtrl+Shift+I'),
    item(
      'footnote',
      'toolbar.footnote',
      'edit:insertFootnote',
      writable,
      'CmdOrCtrl+Alt+F'
    ),
    item('table', 'toolbar.table', 'table:choose', writable),
    separator(),
    item('ordered', 'toolbar.orderedList', 'list:ordered', writable),
    item('bullet', 'toolbar.bulletList', 'list:bullet', writable),
    item('task', 'toolbar.taskList', 'list:task', writable),
    item('indent', 'toolbar.indentItem', 'list:indent', writable),
    separator(),
    item(
      'session-toggle',
      facts.stacked ? 'session.pop' : 'session.push',
      'session:toggleStack',
      session
    ),
    item('session-open', 'session.open', 'session:openStack', session)
  ];
}
