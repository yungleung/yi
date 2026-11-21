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

import { message } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { registerCommand } from '../../commands/runtime';
import { t } from '../../services/i18n';
import { showHint } from '../../services/hints';
import { showMessage } from '../../services/messages';
import {
  releaseNotesExcerpt,
  TauriUpdateBackend,
  UpdateController,
  type UpdatePresenter,
  type UpdateSummary
} from '../../services/updates';
import { prompt } from '../prompt';
import { drivenByTools } from '../under_test';

/** The update domain's reader-facing half. */
class HelpUpdatePresenter implements UpdatePresenter {
  /**
   * Shows release notes as an in-page question rather than a native alert.
   *
   * Example: a long GitHub release body scrolls inside the card while the install and decline
   * buttons remain visible.
   */
  async confirm(update: UpdateSummary): Promise<boolean> {
    const question = {
      title: t('update.available.title', { version: update.version }),
      message: t('update.available.message', {
        currentVersion: update.currentVersion,
        notes: releaseNotesExcerpt(update.notes, t('update.available.noNotes'))
      }),
      yes: t('update.available.yes'),
      no: t('update.available.no')
    };
    if (drivenByTools()) {
      return await prompt.ask(question);
    }
    const answer = await message(question.message, {
      title: question.title,
      kind: 'warning',
      buttons: {
        yes: question.yes,
        no: t('update.available.notes'),
        cancel: question.no
      }
    });
    if (answer === question.yes) {
      return true;
    }
    if (answer === t('update.available.notes')) {
      await openUrl(update.releaseUrl).catch(() => undefined);
    }
    return false;
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
