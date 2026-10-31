/**
 * The native menu, in one place.
 *
 * The app menu lives on the Rust side, so its items reach the webview as Tauri
 * events named by strings. Rather than each of those names appearing as a
 * literal somewhere in the editor, they are mapped here, once, to command ids —
 * and this is the only module that may name them.
 *
 * May import: the command ids (`./registry`). Upholds: an event name reaches the
 * editor as a command id in one place, so no other module has to know what the
 * native menu calls things.
 */
import type { CommandId } from './registry';

/** The menu event names the app sends, and the command each one runs. */
export const MENU_COMMANDS: Readonly<Record<string, CommandId>> = {
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
  return MENU_COMMANDS[event] ?? null;
}
