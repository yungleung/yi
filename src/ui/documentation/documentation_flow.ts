/**
 * Opening Documentation from the native Help menu.
 *
 * The menu item emits `documentation`; `src/commands/triggers/native_menu.ts` names
 * `help:documentation`; this module
 * owns the command and opens the bundled guide through the shared read-only reference flow.
 *
 * May import: the reference flow, the guide text and the command registry. Upholds: one way to
 * open Documentation, with no workspace, session stack or save path behind it.
 */

import { registerCommand } from '../../commands/runtime';
import { openReferenceDocument } from '../reference_document';
import { language } from '../../services/i18n';
import { documentationText } from './documentation_text';

export async function openDocumentation(): Promise<void> {
  await openReferenceDocument(documentationText(language()));
}

export function registerDocumentationCommand(): void {
  registerCommand({
    id: 'help:documentation',
    run: async () => {
      await openDocumentation();
      return null;
    }
  });
}
