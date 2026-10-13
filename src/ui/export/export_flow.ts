/**
 * Exporting the note on screen: the question, the pre-process, the run, and the news.
 *
 * The order is the whole module, and it is the order Zettlr uses: ask how and where, prepare the
 * text every kind shares (`preprocess.ts` — a wikilink written as the words it renders as), run it,
 * and then say what happened. The *asking* is the card's (`export_dialog.ts`) and the *doing* is
 * Rust's (`src-tauri/src/export.rs`), so what is left here is the joining of the two and the two
 * kinds of news the app has: a hint for something that worked, which the reader only has to notice,
 * and a message for a failure, which waits for them (`services/hints.ts`, `services/messages.ts`).
 *
 * The note's text comes from the editor rather than from the session's copy of it: the session
 * captures a document on a debounce, and a reader who exports a sentence they have just written
 * means that sentence. Its *folder* comes from the session, because that is what knows whether the
 * document has a file at all — and an unsaved note can be exported like any other.
 *
 * May import: the registry, the session, the app's own answers (config, images, titles), the export
 * seam and the dialog. Upholds: one command has one name, one home and one way in — the File menu's
 * *Export* reaches this through `commands/menu.ts` and `registry.ts` like every other command.
 */

import { join } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';
import { exportFetchImage, exportKinds, runExport } from '../../api/export';
import { bibliographyManager } from '../../services/bibliography';
import { configManager } from '../../services/config_manager';
import { documentManager } from '../../services/document_manager';
import { showHint } from '../../services/hints';
import { t } from '../../services/i18n';
import { notify } from '../../services/messages';
import { documentSession } from '../../services/session';
import { bibliographyPath, homeFolderPath, imageFolderPath } from '../../services/settings_paths';
import { fileName, parentFolder } from '../../services/workspace_folders';
import { imageBases } from '../image/image_urls';
import { registerCommand } from '../markdown/commands/registry';
import { exportDialog } from './export_dialog';
import { exportSource } from './preprocess';

/** What the export needs from the editor that owns the note on screen. */
export interface ExportHost {
  /** The text on screen: the editor's own, which is never older than the session's copy of it. */
  text(): string;
}

/** Registers the File menu's *Export*. */
export function registerExportCommand(host: ExportHost): void {
  registerCommand({ id: 'file:export', run: () => void exportNote(host.text()) });
}

/** Asks how the text goes out, prepares it if the reader answers, and says what happened. */
export async function exportNote(text: string): Promise<void> {
  const { pandoc, kinds } = await exportKinds();
  const first = kinds[0];
  if (first === undefined) {
    return;
  }
  const note = documentSession.current();
  const folder = await targetFolder(note?.path ?? null);
  const target = await join(folder, `${noteName(note?.path ?? null, note?.title ?? null)}.${first.extension}`);

  const answer = await exportDialog.ask({ kinds, pandoc, defaultTarget: target });
  if (answer === null) {
    return;
  }

  try {
    // The pre-process is the one step every kind shares, and the parser is what says where the
    // wikilinks and the images *are* — a `[[…]]` in a fence, or an image's destination in a code
    // span, is code and stays exactly as written. What it answers with is the app's own reading of
    // the note: the titles a wikilink renders as, and the file each picture is found at — the same
    // folders the renderer resolves a relative destination against, so what goes into the file is
    // what the reader saw.
    const prepared = await exportSource(text, {
      titleOf: (target) => documentManager.getTitle(target),
      bases: imageBases(),
      exists: fileExists,
      fetchRemote: fetchedPicture
    });
    const outcome = await runExport({
      kind: answer.kind,
      text: prepared,
      output_path: answer.outputPath,
      resource_paths: await resourcePaths(folder),
      source_dir: note?.path ? parentFolder(note.path) : null,
      bibliography: await bibliographyPath(),
      csl: bibliographyManager.cslForExport(),
      references: t('export.references')
    });
    showHint(t('export.done', { file: fileName(answer.outputPath) }), null);
    // Pandoc's own warnings, in its own words: what it could not fetch, what it could not resolve.
    // A document that is missing a piece is not a failure — the file is there — but the reader is
    // owed the reason rather than the hole.
    if (outcome.warnings.length > 0) {
      notify('Export', new Error(outcome.warnings.slice(0, 4).join('\n')));
    }
  } catch (error) {
    notify('Export', error);
  }
}

/**
 * A picture the note names on the web, fetched for this export. A URL the app cannot fetch answers
 * null and the destination is left exactly as the note wrote it: pandoc is then asked for it, and
 * its warning about it is one of the warnings the reader is told.
 */
async function fetchedPicture(url: string): Promise<string | null> {
  try {
    return await exportFetchImage(url);
  } catch (error) {
    console.error('Export could not fetch a picture:', error);
    return null;
  }
}

/**
 * Whether a path names a file that is there. The file plugin reads only what it is scoped to
 * (`$HOME/**`), and a refusal is an answer like any other: an image outside that scope is left as
 * the author wrote it, for pandoc to try for itself.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}

/** Where an output goes when nothing else says: the note's folder, the workspace, the home folder. */
async function targetFolder(path: string | null): Promise<string> {
  const beside = path ? parentFolder(path) : null;
  return beside ?? configManager.get()?.workspace ?? (await homeFolderPath()) ?? '';
}

/** The name the output starts from: the note's own file name, or what an unsaved one is called. */
function noteName(path: string | null, title: string | null): string {
  if (path) {
    return fileName(path).replace(/\.(md|markdown)$/i, '');
  }
  // A title is prose, and prose may hold a character a file name may not: the separators and the
  // newlines that would turn one name into a path or two.
  return (title ?? 'untitled').replace(/[/\\:\n\r]/g, '-').trim() || 'untitled';
}

/** The folders a relative destination in the note is resolved against, in the order they are tried. */
async function resourcePaths(folder: string): Promise<string[]> {
  const images = await imageFolderPath();
  return [...new Set([folder, images ?? ''].filter((path) => path !== ''))];
}
