/**
 * Connects the update domain to the Help menu, prompt, hint and message
 * surfaces.
 *
 * Example: the native `check_for_updates` event reaches
 * `help:checkForUpdates`, and an available release asks before installation.
 *
 * May import: the update service, reader surfaces, i18n and command registry.
 * Upholds: one command runs checks, and every reader-facing sentence is
 * translated.
 */

import { registerCommand } from '../../commands/runtime';
import { t } from '../../services/i18n';
import { showHint } from '../../services/hints';
import { showMessage } from '../../services/messages';
import {
  TauriUpdateBackend,
  UpdateController,
  type UpdatePresenter,
  type UpdateSummary
} from '../../services/updates';
import { prompt } from '../prompt';

/** The update domain's reader-facing half. */
class HelpUpdatePresenter implements UpdatePresenter {
  async confirm(update: UpdateSummary): Promise<boolean> {
    const notes = update.notes?.trim() || t('update.available.noNotes');
    return await prompt.ask({
      title: t('update.available.title', { version: update.version }),
      message: t('update.available.message', {
        currentVersion: update.currentVersion,
        notes
      }),
      yes: t('update.available.yes'),
      no: t('update.available.no')
    });
  }

  current(): void {
    showHint(t('update.current'), null);
  }

  failed(message: string): void {
    showMessage(t('update.failed', { message }));
  }
}

/** The app's updater and the command that exposes a manual check. */
export interface Updates {
  readonly controller: UpdateController;
  register(): void;
}

/** Builds the updater once so startup and the Help menu share its state. */
export function createUpdates(): Updates {
  const controller = new UpdateController(new TauriUpdateBackend(), new HelpUpdatePresenter());
  return {
    controller,
    register() {
      registerCommand({
        id: 'help:checkForUpdates',
        run: async () => {
          await controller.check('manual');
          return null;
        }
      });
    }
  };
}
