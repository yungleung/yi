/**
 * Opening the tutorial: one document, read-only, in the reader's language.
 *
 * The tutorial is not a file in the workspace and is not the reader's note. It is opened pathless
 * with a stable frontmatter id, so the session knows it by the same name each time, and with
 * `readOnly: true`, so the editor refuses to write it and a later file replaces it without a
 * question. `services/session_rules.ts: openDecision` is where that last rule lives.
 *
 * The Help menu's item reaches this through the command registry (`menu.ts` names the command);
 * `main.ts` also calls `openTutorial` once on a first start with nothing restored.
 *
 * May import: the shared reference flow, the tutorial's text and the command registry. Upholds: one
 * way to open the tutorial, and no second copy of what it says.
 */

import { documentSession } from '../../services/session';
import { registerCommand } from '../markdown/commands/registry';
import { openReferenceDocument } from '../reference_document';
import { tutorialText } from './tutorial_text';
import { shouldOpenTutorial } from './tutorial_rules';

/** Puts the tutorial on screen. It is already open? Bringing it forward is the session's answer. */
export async function openTutorial(): Promise<void> {
  await openReferenceDocument(tutorialText());
}

/** The first-start half: a first start with nothing restored opens it, and nothing else does. */
export async function openTutorialForFirstStart(firstStart: boolean): Promise<void> {
  if (shouldOpenTutorial(firstStart, documentSession.current() !== null)) {
    await openTutorial();
  }
}

/** Registers the command the Help menu's *Open Tutorial* item names. */
export function registerTutorialCommand(): void {
  registerCommand({ id: 'help:tutorial', run: () => void openTutorial() });
}
