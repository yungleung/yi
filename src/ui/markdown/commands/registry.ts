/**
 * The one table of commands, and the one way to run one.
 *
 * A command is something the author asks for by name: bold the selection, insert
 * a table, open find. Everything that can ask for it — a key chord, a toolbar
 * button, the table menu, the native menu — resolves that name here, and the
 * module that owns the behaviour registers it. Before this, a toolbar button
 * emitted a Tauri event whose name it defined itself and the editor subscribed
 * to that name: one command, three files, two layers.
 *
 * The registry holds no editor state of its own. A command closes over whatever
 * it needs when it is registered, so running one is a plain call, and the ids are
 * a union type, so a typo is a compile error rather than a silent no-op.
 */

import type { FormattingStyle } from '../format';
import type { ListCommand } from '../editing/lists';
import type { TableCommand } from '../editing/table';

/** Every command the editor knows, by name. */
export type CommandId =
  | `format:${FormattingStyle}`
  | 'history:undo'
  | 'history:redo'
  | 'edit:cut'
  | 'edit:selectAll'
  | 'edit:insertFootnote'
  | 'find:open'
  | 'find:replace'
  | 'find:close'
  | `list:${ListCommand}`
  | 'table:insert'
  | `table:${TableCommand}`;

export interface Command {
  readonly id: CommandId;
  /** Does the work. A payload is the extra the trigger knows: a table's target, a size. */
  run(payload?: unknown): void;
  /** Whether the command can run right now; absent means always. */
  available?(): boolean;
}

const commands = new Map<CommandId, Command>();

/** Registers a command. Registering the same id twice is a bug, not a merge. */
export function registerCommand(command: Command): void {
  if (commands.has(command.id)) {
    throw new Error(`duplicate command: ${command.id}`);
  }
  commands.set(command.id, command);
}

/** Runs a command by name. Returns false when it is not registered or not available. */
export function runCommand(id: CommandId, payload?: unknown): boolean {
  const command = commands.get(id);
  if (!command || command.available?.() === false) {
    return false;
  }
  command.run(payload);
  return true;
}

/** The registered commands, in registration order — the editor's capability list. */
export function registeredCommands(): Command[] {
  return [...commands.values()];
}
