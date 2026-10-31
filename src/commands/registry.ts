/**
 * The registry of command implementations, keyed by the catalogue's typed ids.
 *
 * Example: registering `format:bold` twice throws, so a toolbar and a menu
 * cannot silently replace each other's behaviour.
 *
 * May import: command contracts. Upholds: one command id has one implementation.
 */

import type {
  CommandId,
  CommandInput,
  CommandOutput
} from './contracts';
import type { CommandContext } from './dispatch';

/** One command implementation. Input and output types come from the catalogue. */
export interface CommandDefinition<Id extends CommandId> {
  readonly id: Id;
  run(
    input: CommandInput<Id>,
    context: CommandContext
  ): CommandOutput<Id> | void | Promise<CommandOutput<Id> | void>;
  available?(context: CommandContext): boolean;
}

/** A registry that can be used by the app or isolated by a test. */
export class CommandRegistry {
  private readonly commands = new Map<CommandId, CommandDefinition<CommandId>>();

  /** Adds one implementation. A duplicate id is an application bug. */
  register<Id extends CommandId>(command: CommandDefinition<Id>): void {
    if (this.commands.has(command.id)) {
      throw new Error(`duplicate command: ${command.id}`);
    }
    this.commands.set(
      command.id,
      command as unknown as CommandDefinition<CommandId>
    );
  }

  /** Reads one implementation, typed by the catalogue. */
  get<Id extends CommandId>(id: Id): CommandDefinition<Id> | null {
    return (this.commands.get(id) as CommandDefinition<Id> | undefined) ?? null;
  }

  /** Every implementation, in registration order. */
  all(): readonly CommandDefinition<CommandId>[] {
    return [...this.commands.values()];
  }
}

/** The app-wide registry; tests create their own `CommandRegistry` instances. */
export const commandRegistry = new CommandRegistry();

/** Registers one implementation with the app-wide registry. */
export function registerCommand<Id extends CommandId>(
  command: CommandDefinition<Id>
): void {
  commandRegistry.register(command);
}

/** The registered commands, in registration order. */
export function registeredCommands(): readonly CommandDefinition<CommandId>[] {
  return commandRegistry.all();
}
