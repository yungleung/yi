/**
 * Registers the editor's commands and connects every native-menu event to one dispatch.
 *
 * Example: `history:undo` is registered once with the editor's replay port, while a native menu
 * event named `undo` reaches that same command through the typed dispatcher.
 *
 * May import: the editor command table, the command runtime, native-menu mappings and the editing
 * context. Upholds: a menu event dispatches by command id and never calls editing behaviour directly.
 */

import type { AppEventName } from '../../services/events';
import { eventManager } from '../../services/events';
import {
  dispatchRawCommand,
  type CommandId
} from '../../commands/runtime';
import { MENU_COMMANDS } from '../../commands/triggers/native_menu';
import {
  registerEditorCommands,
  type CommandHost
} from './commands/editor_commands';
import type { EditorContext } from './editing/context';
import type { EditorLayout } from './editor_page_layout';

/** What the command layer needs from the editor that owns it. */
export interface EditorCommandWiringHost {
  readonly context: EditorContext;
  openFind(replace: boolean): void;
  closeFind(): void;
  applyHistory(direction: 'undo' | 'redo'): void;
  layout(): EditorLayout;
  setLayout(layout: EditorLayout): void;
}

/**
 * Installs the editor's command definitions and the native-menu bridge.
 *
 * Example: the menu's Undo event dispatches `history:undo`; an unsuccessful result is logged with
 * the command id, while the editor itself never learns the menu event's name.
 */
export function installEditorCommandWiring(host: EditorCommandWiringHost): void {
  const commands: CommandHost = {
    context: host.context,
    openFind: (replace) => host.openFind(replace),
    closeFind: () => host.closeFind(),
    applyHistory: (direction) => host.applyHistory(direction),
    toggleLayout: () => host.setLayout(host.layout() === 'page' ? 'auto' : 'page')
  };
  registerEditorCommands(commands);

  for (const [event, command] of Object.entries(MENU_COMMANDS) as Array<
    [AppEventName, CommandId]
  >) {
    void eventManager.on(event, (menuEvent) => {
      const settled = dispatchRawCommand(command, menuEvent.payload, {
        kind: 'native-menu'
      });
      void Promise.resolve(settled).then((result) => {
        if (!result.ok) {
          console.error(`command ${result.commandId}: ${result.message}`);
        }
      });
    });
  }
}
