/**
 * The commands the session owns, registered by name.
 *
 * The session is not the editor, so its commands are registered here rather than in
 * `markdown/commands/editor_commands.ts` — but they are the same kind of thing to everything
 * that triggers one: the titlebar's stack buttons, the popover's rows, and the *Save* and
 * *Save As* items at the top of the native menu, which reach the webview as the events
 * `commands/menu.ts` maps here.
 *
 * May import: the registry and the session. Upholds: one command has one name, one home and one
 * way in — a second registration for an id throws in the registry rather than quietly winning.
 */

import { registerCommand } from '../markdown/commands/registry';
import { documentSession } from '../../services/session';

/** Registers every command the session owns. */
export function registerSessionCommands(): void {
  registerCommand({ id: 'file:save', run: () => void documentSession.save() });
  registerCommand({ id: 'file:saveAs', run: () => void documentSession.saveAs() });
  registerCommand({ id: 'session:toggleStack', run: () => documentSession.toggleStack() });
  registerCommand({
    id: 'session:nextStacked',
    run: () => documentSession.navigateStack(1)
  });
  registerCommand({
    id: 'session:previousStacked',
    run: () => documentSession.navigateStack(-1)
  });
  registerCommand({
    id: 'session:restore',
    run: (payload) => documentSession.restore(String(payload))
  });
  registerCommand({
    id: 'session:drop',
    run: (payload) => void documentSession.drop(String(payload))
  });
}
