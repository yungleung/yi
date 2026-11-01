/**
 * The native menu's wire names and the command ids they request.
 *
 * Example: Rust emits `save_as`, and this adapter resolves it to
 * `file:saveAs`; the menu does not know the command implementation.
 *
 * May import: command ids and the app event-name type. Upholds: menu names
 * become command ids in one place.
 */

import type { AppEventName } from '../../services/events';
import type { CommandId } from '../contracts';

/** The menu event names the app sends, and the command each one runs. */
export const MENU_COMMANDS: Readonly<Partial<Record<AppEventName, CommandId>>> = {
  undo: 'history:undo',
  redo: 'history:redo',
  cut: 'edit:cut',
  select_all: 'edit:selectAll',
  tutorial: 'help:tutorial',
  documentation: 'help:documentation',
  new_markdown: 'file:newMarkdown',
  save: 'file:save',
  save_as: 'file:saveAs',
  export: 'file:export',
  manage_export_templates: 'export:manageTemplates',
  version_save: 'version:save',
  toggle_stack: 'session:toggleStack',
  next_stacked: 'session:nextStacked',
  previous_stacked: 'session:previousStacked',
  find: 'find:open',
  replace: 'find:replace'
};

/** The command a menu event runs, or null when the name is not a command. */
export function commandForMenuEvent(event: string): CommandId | null {
  return MENU_COMMANDS[event as AppEventName] ?? null;
}
