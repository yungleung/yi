/**
 * The app's one command runtime: a registry, dispatcher, and local trigger facade.
 *
 * Example: a toolbar calls `runCommand('format:bold')`, while a native menu
 * passes its raw JSON payload through `dispatchRawCommand`; both reach the same
 * implementation and authority check.
 *
 * May import: command contracts, registry, dispatcher, and authority. Upholds:
 * there is one app-wide command table and one app-wide dispatch path.
 */

import { accessForOrigin, type CommandOrigin, type CommandOriginKind } from './authority';
import type { CommandId, CommandInput } from './contracts';
import {
  CommandDispatcher,
  type CommandResult,
  type DispatchOptions
} from './dispatch';
import {
  commandRegistry,
  registerCommand,
  registeredCommands,
  type CommandDefinition
} from './registry';

/** The command dispatcher used by the production app. */
export const commandDispatcher = new CommandDispatcher(
  commandRegistry,
  accessForOrigin
);

/** Registers one implementation in the app-wide registry. */
export { registerCommand };
export { registeredCommands };
export type { CommandDefinition };
export type { CommandId, CommandInput };

/** Runs one command with a typed input and receives its complete result. */
export function dispatchCommand<Id extends CommandId>(
  id: Id,
  input: CommandInput<Id>,
  origin: CommandOrigin,
  options?: DispatchOptions
): CommandResult | Promise<CommandResult> {
  return commandDispatcher.dispatch(id, input, origin, options);
}

/** Runs one command from an untrusted transport payload. */
export function dispatchRawCommand<Id extends CommandId>(
  id: Id,
  value: unknown,
  origin: CommandOrigin,
  options?: DispatchOptions
): CommandResult | Promise<CommandResult> {
  return commandDispatcher.dispatch(id, value, origin, options);
}

/** A no-input command may omit its input entirely. */
export function runCommand<Id extends CommandId>(
  id: Id,
  input?: null,
  originKind?: CommandOriginKind
): boolean;

/** A command with input still requires the typed value. */
export function runCommand<Id extends CommandId>(
  id: Id,
  input: CommandInput<Id>,
  originKind?: CommandOriginKind
): boolean;

/**
 * Runs a local command and reports only whether it was accepted.
 *
 * Example: `runCommand('format:bold', null, 'toolbar')` returns false without
 * editing when the current document is read-only.
 */
export function runCommand<Id extends CommandId>(
  id: Id,
  input?: CommandInput<Id>,
  originKind: CommandOriginKind = 'toolbar'
): boolean {
  const result = commandDispatcher.dispatch(
    id,
    input ?? null,
    { kind: originKind }
  );
  if (result instanceof Promise) {
    void result.then((settled) => {
      if (!settled.ok) {
        console.error(`command ${settled.commandId}: ${settled.message}`);
      }
    });
    return true;
  }
  return result.ok;
}
