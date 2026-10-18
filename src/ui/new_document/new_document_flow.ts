/**
 * Making a new note: which folder it goes in, what it is called, and everything that follows.
 *
 * Two triggers ask for the same thing and are given the same answer. The native menu's *New
 * Markdown* asks where — it knows nothing about the workspace — so the card
 * (`new_document_dialog.ts`) puts the folders in front of the reader with the one they are
 * working in already chosen, and the generated id in the name field to type over. The tree's
 * own *New file* runs the same command with the row's folder in the payload: the place is
 * already known, and there is nothing to ask.
 *
 * Both then do the same four things, in this order, because each is observable on its own: the
 * file is created (an empty file the backend names and validates), the note's text is written
 * into it, the tree is told that folder changed, and the session opens the document — with the
 * title's value selected, so the reader types the word they mean instead of deleting the
 * default one character at a time.
 *
 * May import: the app's file commands, the note's own rules, the session, the tree's host, and
 * the card. Upholds: a new note is one command — `file:newMarkdown` — whichever trigger asked
 * for it, and nothing here is written by hand twice.
 */

import { createEntry, writeTextAtomically } from '../../api/files';
import { configManager } from '../../services/config_manager';
import {
  newDocumentDate,
  newDocumentId,
  newDocumentText,
  titleRange
} from '../../services/new_document';
import { documentSession } from '../../services/session';
import { documentManager } from '../../services/document_manager';
import { t } from '../../services/i18n';
import { notify } from '../../services/messages';
import { parentFolder, workspaceFolders } from '../../services/workspace_folders';
import { registerCommand } from '../markdown/commands/registry';
import { refreshTreeFolders } from '../workspace/tree_ops';
import { newDocumentDialog, type NewDocumentChooser } from './new_document_dialog';

/**
 * Registers the command the menu item names and the tree's *New file* runs.
 *
 * A payload carrying a folder is a trigger that already knows the place; without one the card
 * is asked.
 */
export function registerNewDocumentCommand(chooser: NewDocumentChooser = newDocumentDialog): void {
  registerCommand({
    id: 'file:newMarkdown',
    run: (payload) => {
      const folder = (payload as { folder?: unknown } | undefined)?.folder;
      void newDocument(typeof folder === 'string' ? folder : null, chooser);
    }
  });
}

/**
 * Makes a new note in `folder`, or asks the reader where and under what name when it is null.
 *
 * The id is made once and is both the default name and the note's own id, so a reader who
 * renames the file still gets a note whose frontmatter says when it was made.
 */
export async function newDocument(
  folder: string | null,
  chooser: NewDocumentChooser = newDocumentDialog
): Promise<void> {
  const id = newDocumentId();
  let place = folder;
  let name = id;
  if (place === null) {
    const root = configManager.get()?.workspace;
    if (!root) {
      notify('Making a new note', new Error(t('newNote.noWorkspace')));
      return;
    }
    // The reader is most likely working in the folder of the document on screen; when that
    // document is not in this workspace (or there is none), the root is where a note goes.
    const onScreen = documentSession.current()?.path;
    const answer = await chooser.choose({
      // The walk is the card's to ask for: a reader's own sheet brings its own way of choosing.
      folders: () => workspaceFolders(root),
      folder: (onScreen && parentFolder(onScreen)) || root,
      name: id
    });
    if (!answer) {
      return;
    }
    place = answer.folder;
    name = answer.name;
  }
  await create(place, name, id);
}

/** Creates the file, writes the note into it, shows it in the tree, and opens it. */
async function create(folder: string, name: string, id: string): Promise<void> {
  const made = await createFile(folder, name, id);
  if (!made) {
    return;
  }
  const content = newDocumentText({
    id: made.id,
    date: newDocumentDate(),
    // No template of the reader's means the app's own (`services/new_document.ts`).
    template: configManager.get()?.new_file_frontmatter ?? undefined
  });
  try {
    await writeTextAtomically(made.path, content);
  } catch (error) {
    // The file is there and empty. The note still opens holding what it was to hold — the
    // session's copy is the truth until it is saved — and the message says the write failed, so
    // nothing goes missing without the reader being told.
    notify('Making a new note', error);
  }
  // The note is on disk now, which is what the wikilink index reads: its next question must see
  // the file, not the catalogue that was built before it existed.
  documentManager.invalidate();
  await refreshTreeFolders([folder]);
  await documentSession.openFile({ path: made.path, content, select: titleRange(content) });
}

/**
 * Makes the file, and answers the path and the id it ended up stamped with — or null when the
 * backend refused, in which case the reader has been told why.
 *
 * The id names the file, so two notes made inside the same second want the same name. Then the
 * stamp moves to the next second rather than the note failing: it is still the note's own
 * stamp, and the reader asked for a note, not for fourteen particular digits. A name the
 * reader typed is theirs — offering them a second one would only fail the same way.
 */
async function createFile(
  folder: string,
  name: string,
  id: string
): Promise<{ path: string; id: string } | null> {
  const attempts = name === id ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // The stamp the note is made with, and the file name that goes with it: the reader's own
    // name when they gave one, and the stamp itself when the stamp had to move.
    const made = attempt === 0 ? id : newDocumentId(new Date(Date.now() + attempt * 1000));
    const candidate = attempt === 0 ? name : made;
    try {
      return { path: await createEntry(folder, candidate, true), id: made };
    } catch (error) {
      if (attempt + 1 === attempts || !String(error).includes('already exists')) {
        notify('Making a new note', error);
        return null;
      }
    }
  }
  return null;
}
