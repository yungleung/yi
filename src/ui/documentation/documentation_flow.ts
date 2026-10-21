/**
 * Opening Documentation from the native Help menu.
 *
 * The menu item emits `documentation`; `commands/menu.ts` names `help:documentation`; this module
 * owns the command and opens the bundled guide through the shared read-only reference flow.
 *
 * May import: the reference flow, the guide text and the command registry. Upholds: one way to
 * open Documentation, with no workspace, session stack or save path behind it.
 */

import { registerCommand } from '../markdown/commands/registry';
import { openReferenceDocument } from '../reference_document';
import { documentationText } from './documentation_text';

export async function openDocumentation(): Promise<void> {
  await openReferenceDocument(documentationText());
}

export function registerDocumentationCommand(): void {
  registerCommand({ id: 'help:documentation', run: () => void openDocumentation() });
}
