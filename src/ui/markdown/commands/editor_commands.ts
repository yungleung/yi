/**
 * The commands this editor owns, registered by name.
 *
 * The editor wires the events and keeps the caret; what each command *does* is
 * a function under `editing/`, and this is the table that says which name
 * reaches which of them — filled once, in the one place
 * `commands/registry.ts` expects to be filled from, so a chord, a toolbar
 * button, a menu item and the keymap all land on the same code.
 *
 * May import: the registry, the editing rules the commands apply and the
 * variables those rules are enumerated from. Upholds: one command has one name,
 * one home and one way in — a second registration for an id throws in the
 * registry rather than quietly winning.
 */

import { FORMATTING_STYLES } from '../format';
import { LIST_COMMANDS, applyListCommand } from '../editing/lists';
import {
  TABLE_COMMANDS,
  insertTable,
  runTableCommand,
  type TableCommand,
  type TableTarget
} from '../editing/table';
import type { EditorContext } from '../editing/context';
import { cutSelection, selectAll } from '../editing/clipboard';
import { applyFormatting } from '../editing/formatting';
import { insertFootnote } from '../editing/footnotes';
import { insertThematicBreak } from '../editing/thematic_break';
import { registerCommand } from './registry';

/** What a command needs from the editor that registers it. */
export interface CommandHost {
  /** The document, the renderer and the scroll container. */
  readonly context: EditorContext;
  /** Opens the find bar, on the query field or on the replace field. */
  openFind(replace: boolean): void;
  closeFind(): void;
  /** Undo or redo, keeping the caret at its document offset. */
  applyHistory(direction: 'undo' | 'redo'): void;
}

/** Registers every command the editor owns against the registry. */
export function registerEditorCommands(host: CommandHost): void {
  const { context } = host;
  registerCommand({ id: 'history:undo', run: () => host.applyHistory('undo') });
  registerCommand({ id: 'history:redo', run: () => host.applyHistory('redo') });
  registerCommand({ id: 'edit:cut', run: () => void cutSelection(context) });
  registerCommand({ id: 'edit:selectAll', run: () => selectAll(context) });
  registerCommand({ id: 'edit:insertFootnote', run: () => insertFootnote(context) });
  registerCommand({ id: 'edit:insertRule', run: () => insertThematicBreak(context) });
  registerCommand({ id: 'find:open', run: () => host.openFind(false) });
  registerCommand({ id: 'find:replace', run: () => host.openFind(true) });
  registerCommand({ id: 'find:close', run: () => host.closeFind() });
  // One command per inline style, per list command and per table operation,
  // enumerated from the modules that own those lists: a button or a menu item
  // can only name a command that is registered here.
  for (const style of FORMATTING_STYLES) {
    registerCommand({ id: `format:${style}`, run: () => applyFormatting(context, style) });
  }
  for (const command of LIST_COMMANDS) {
    registerCommand({ id: `list:${command}`, run: () => applyListCommand(context, command) });
  }
  for (const command of TABLE_COMMANDS) {
    registerCommand({ id: `table:${command}`, run: (target) => runTableOperation(context, command, target) });
  }
  registerCommand({ id: 'table:insert', run: (size) => insertPickedTable(context, size) });
}

/**
 * Runs one table-menu operation on the cell the menu captured before it took
 * focus. The payload comes from a native menu, so it is checked, not trusted.
 */
function runTableOperation(context: EditorContext, command: TableCommand, payload: unknown): void {
  const target = payload as TableTarget | null;
  if (
    !target ||
    !Number.isFinite(target.lineStart) ||
    !Number.isFinite(target.row) ||
    !Number.isFinite(target.column)
  ) {
    return;
  }
  runTableCommand(context, target, command);
}

/** Creates the table of the size the picker handed over. */
function insertPickedTable(context: EditorContext, payload: unknown): void {
  const size = payload as { rows?: number; columns?: number } | null;
  if (size?.rows && size.columns) {
    insertTable(context, { rows: size.rows, columns: size.columns });
  }
}
