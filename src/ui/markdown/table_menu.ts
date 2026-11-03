/**
 * The editor's request for the shell to show a native table menu.
 *
 * Example: a right-click sends the captured cell and menu nodes; the shell opens
 * the native menu without the Markdown module importing the menu API.
 *
 * May import: table menu DTO types only. Upholds: a menu acts on the table target
 * captured before focus moved, and an unregistered shell opens no menu.
 */

import type { TableMenuNode, TableTarget } from './editing/table';

/** A shell request to present table actions for an already captured cell. */
export interface TableMenuRequest {
  readonly nodes: readonly TableMenuNode[];
  readonly target: TableTarget;
  readonly at: { readonly x: number; readonly y: number };
}

/** The shell's table-menu presentation. */
export type TableMenuHandler = (request: TableMenuRequest) => void;

let handler: TableMenuHandler | null = null;

/** Installs this window's native table-menu presenter. */
export function setTableMenuHandler(next: TableMenuHandler | null): void {
  handler = next;
}

/** Asks the shell to present table actions at the captured cell. */
export function requestTableMenu(request: TableMenuRequest): void {
  handler?.(request);
}
