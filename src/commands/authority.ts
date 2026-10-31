/**
 * The closed vocabulary of command sources and the effects each source may use.
 *
 * Example: a toolbar may write while a writable document is on screen, but a
 * read-only tutorial gives `localAccess(false)` no `document.write` capability.
 *
 * May import: command effect types only. Upholds: authority is checked centrally
 * rather than reimplemented by each command trigger.
 */

import type { CommandEffect } from './contracts';

/** A source that can ask the app to run a command. */
export type CommandOriginKind =
  | 'keyboard'
  | 'toolbar'
  | 'native-menu'
  | 'context-menu'
  | 'builtin-agent'
  | 'mcp'
  | 'test';

/** One command request's source, retained for policy and future audit. */
export interface CommandOrigin {
  readonly kind: CommandOriginKind;
  readonly windowId?: string;
  readonly requestId?: string;
}

/** The effects one request may exercise. */
export interface CommandAccess {
  readonly effects: ReadonlySet<CommandEffect>;
}

const EFFECTS: readonly CommandEffect[] = [
  'document.write',
  'session.write',
  'workspace.write',
  'export.run',
  'version.write'
];

const LOCAL_ORIGINS = new Set<CommandOriginKind>([
  'keyboard',
  'toolbar',
  'native-menu',
  'context-menu'
]);

let writable = true;

/**
 * Returns the capabilities of a local UI while the current document is writable
 * or read-only.
 *
 * Example: `localAccess(false)` keeps save and export available but removes
 * `document.write`, so formatting cannot mutate a tutorial.
 */
export function localAccess(documentWritable: boolean): CommandAccess {
  return {
    effects: new Set(
      documentWritable
        ? EFFECTS
        : EFFECTS.filter((effect) => effect !== 'document.write')
    )
  };
}

/** Updates the current document's writability for later local dispatches. */
export function setDocumentWritable(next: boolean): void {
  writable = next;
}

/** Whether the current document accepts document-writing commands. */
export function documentWritable(): boolean {
  return writable;
}

/**
 * Resolves one origin to its current capabilities.
 *
 * Example: an unconfigured MCP client gets no effects. A future MCP adapter must
 * provide an explicit access resolver rather than inheriting the human UI's rights.
 */
export function accessForOrigin(origin: CommandOrigin): CommandAccess {
  return LOCAL_ORIGINS.has(origin.kind)
    ? localAccess(writable)
    : { effects: new Set() };
}
