/**
 * The one command path: parse input, authorize its effect, check availability, run it.
 *
 * Example: an agent asking to format a read-only tutorial receives `forbidden`;
 * malformed table dimensions receive `invalid-input`; neither reaches editing code.
 *
 * May import: the command catalogue, registry and authority types. Upholds: every
 * command returns a success or a typed failure, and no external input is trusted.
 */

import { accessForOrigin, type CommandAccess, type CommandOrigin } from './authority';
import {
  commandContracts,
  parseCommandInput,
  type CommandId,
  type CommandInput,
  type CommandOutput
} from './contracts';
import type { CommandRegistry } from './registry';

/** Context every command implementation may inspect without reaching for globals. */
export interface CommandContext {
  readonly origin: CommandOrigin;
  readonly access: CommandAccess;
  readonly correlationId: string;
}

/** A command that completed successfully. */
export interface CommandSuccess<Output = unknown> {
  readonly ok: true;
  readonly commandId: CommandId;
  readonly correlationId: string;
  readonly value: Output;
}

/** Why a command was refused or failed. */
export type CommandFailureCode =
  | 'not-found'
  | 'unavailable'
  | 'forbidden'
  | 'invalid-input'
  | 'failed';

/** A command that did not complete successfully. */
export interface CommandFailure {
  readonly ok: false;
  readonly commandId: CommandId;
  readonly correlationId: string;
  readonly code: CommandFailureCode;
  readonly message: string;
}

/** The one result shape every command source receives. */
export type CommandResult<Output = unknown> =
  | CommandSuccess<Output>
  | CommandFailure;

/** Options a transport adapter can attach to one request. */
export interface DispatchOptions {
  readonly correlationId?: string;
}

let requestSequence = 0;

/** Creates an id that ties a command result to its future event facts. */
function nextCorrelationId(): string {
  requestSequence += 1;
  return `command-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

/** Converts an implementation exception into a stable failure reason. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether a command returned work that has not settled yet. */
function isPromise<Output>(
  value: Output | Promise<Output>
): value is Promise<Output> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Promise<Output>).then === 'function'
  );
}

/** Builds a refused result without repeating the result shape. */
function failure(
  commandId: CommandId,
  correlationId: string,
  code: CommandFailureCode,
  message: string
): CommandFailure {
  return { ok: false, commandId, correlationId, code, message };
}

/**
 * Dispatches commands through one registry and one authority resolver.
 *
 * Example: a test can inject a registry and an access resolver, while the app
 * uses one shared registry and the current document's writability.
 */
export class CommandDispatcher {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly resolveAccess: (
      origin: CommandOrigin
    ) => CommandAccess = accessForOrigin
  ) {}

  /**
   * Runs one command from raw transport input.
   *
   * Example: `dispatch('table:insert', { rows: 2, columns: 3 }, origin)`
   * reports a direct result; dispatching `file:save` reports a Promise.
   */
  dispatch<Id extends CommandId>(
    id: Id,
    input: unknown,
    origin: CommandOrigin,
    options: DispatchOptions = {}
  ):
    | CommandResult<CommandOutput<Id> | null>
    | Promise<CommandResult<CommandOutput<Id> | null>> {
    const correlationId = options.correlationId ?? nextCorrelationId();
    const command = this.registry.get(id);
    if (command === null) {
      return failure(id, correlationId, 'not-found', `command is not registered: ${id}`);
    }

    let parsed: unknown;
    try {
      parsed = parseCommandInput(id, input);
    } catch (error) {
      return failure(id, correlationId, 'invalid-input', errorMessage(error));
    }

    let access: CommandAccess;
    try {
      access = this.resolveAccess(origin);
    } catch (error) {
      return failure(id, correlationId, 'forbidden', errorMessage(error));
    }

    const contract = commandContracts[id];
    if (contract.effect !== 'none' && !access.effects.has(contract.effect)) {
      return failure(
        id,
        correlationId,
        'forbidden',
        `${origin.kind} may not use ${contract.effect}`
      );
    }

    const context: CommandContext = { origin, access, correlationId };
    try {
      if (command.available?.(context) === false) {
        return failure(id, correlationId, 'unavailable', `${id} is not available here`);
      }
      const output = command.run(parsed as CommandInput<Id>, context);
      if (isPromise(output)) {
        return Promise.resolve(output)
          .then((value) => ({
            ok: true as const,
            commandId: id,
            correlationId,
            value: value ?? null
          }))
          .catch((error: unknown) =>
            failure(id, correlationId, 'failed', errorMessage(error))
          );
      }
      return { ok: true, commandId: id, correlationId, value: output ?? null };
    } catch (error) {
      return failure(id, correlationId, 'failed', errorMessage(error));
    }
  }
}
