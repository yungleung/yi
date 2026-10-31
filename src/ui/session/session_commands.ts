/**
 * The commands the session owns, registered by name.
 *
 * The session is not the editor, so its commands are registered here rather than in
 * `markdown/commands/editor_commands.ts` — but they are the same kind of thing to everything
 * that triggers one: the titlebar's stack buttons, the popover's rows, and the *Save* and
 * *Save As* items at the top of the native menu, which reach the webview as the events
 * `src/commands/triggers/native_menu.ts` maps here.
 *
 * May import: the registry and the session. Upholds: one command has one name, one home and one
 * way in — a second registration for an id throws in the registry rather than quietly winning.
 */

import { registerCommand } from '../../commands/runtime';
import { documentSession } from '../../services/session';

/** Registers every command the session owns. */
export function registerSessionCommands(): void {
  registerCommand({
    id: 'file:save',
    run: async () => {
      await documentSession.save();
      return null;
    }
  });
  registerCommand({
    id: 'file:saveAs',
    run: async () => {
      await documentSession.saveAs();
      return null;
    }
  });
  registerCommand({
    id: 'session:toggleStack',
    run: () => {
      documentSession.toggleStack();
      return null;
    }
  });
  registerCommand({
    id: 'session:nextStacked',
    run: () => {
      documentSession.navigateStack(1);
      return null;
    }
  });
  registerCommand({
    id: 'session:previousStacked',
    run: () => {
      documentSession.navigateStack(-1);
      return null;
    }
  });
  registerCommand({
    id: 'session:restore',
    run: (documentId) => {
      documentSession.restore(documentId);
      return null;
    }
  });
  registerCommand({
    id: 'session:drop',
    run: async (documentId) => {
      await documentSession.drop(documentId);
      return null;
    }
  });
}
