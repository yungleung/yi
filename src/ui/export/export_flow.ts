/**
 * Exporting the note on screen: the question, the pre-process, the run, and the news.
 *
 * The order is the whole module, and it is the order Zettlr uses: ask how and where, prepare the
 * text every kind shares (`preprocess.ts` — a wikilink written as the words it renders as, an image
 * as the file it names, and a citation as the words it reads as for the kind the app writes itself),
 * run it, and then say what happened. The *asking* is the card's (`export_dialog.ts`) and the *doing*
 * is Rust's (`src-tauri/src/export.rs`), so what is left here is the joining of the two and the two
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
import { exportFetchImage, exportKinds, namedFonts, runExport } from '../../api/export';
import { bibliographyManager } from '../../services/bibliography';
import { configManager } from '../../services/config_manager';
import { documentTitle, readFrontmatterLang } from '../../services/document_identity';
import { documentManager } from '../../services/document_manager';
import { showHint } from '../../services/hints';
import { language, t } from '../../services/i18n';
import { notify } from '../../services/messages';
import { documentSession } from '../../services/session';
import { bibliographyPath, homeFolderPath, imageFolderPath } from '../../services/settings_paths';
import { fileName, parentFolder } from '../../services/workspace_folders';
import { imageBases } from '../image/image_urls';
import { registerCommand } from '../markdown/commands/registry';
import { exportDialog } from './export_dialog';
import { uncoveredCharacters } from './font_hint';
import { exportSource } from './preprocess';

/** What the export needs from the editor that owns the note on screen. */
export interface ExportHost {
  /** The text on screen: the editor's own, which is never older than the session's copy of it. */
  text(): string;
}

/** Registers the File menu's *Export* submenu: one command, and the kind travels as its payload. */
export function registerExportCommand(host: ExportHost): void {
  registerCommand({
    id: 'file:export',
    run: (payload) => void exportNote(host.text(), typeof payload === 'string' ? payload : null)
  });
}

/**
 * Asks how the text goes out, prepares it if the reader answers, and says what happened.
 *
 * `asked` is the kind the menu item names, or null when nothing named one — a command run without a
 * payload exports the first kind, which is what the app did before the menu had a submenu.
 */
export async function exportNote(text: string, asked: string | null = null): Promise<void> {
  const { pandoc, kinds } = await exportKinds();
  const first = kinds.find((kind) => kind.kind === asked) ?? kinds[0];
  if (first === undefined) {
    return;
  }
  const note = documentSession.current();
  const folder = await targetFolder(note?.path ?? null);
  // The note's own path with no extension: the card adds the chosen kind's name suffix and
  // extension to it, because the *kind* is what the card knows and this is what it is asked with.
  const baseTarget = await join(folder, noteName(note?.path ?? null, note?.title ?? null));

  // What the card needs to know before it is drawn: whether this note is written in characters the
  // kind's conversion settings name no font for. The app reads the *file* (`api/export.ts:
  // namedFonts`) and the window walks the *parse* (`font_hint.ts`), because a formula is not a
  // paragraph — `$\le$` draws where a bare `≤` does not.
  const answer = await exportDialog.ask({
    kind: first,
    pandoc,
    baseTarget,
    uncovered: uncoveredCharacters(text, await namedFonts(first.kind))
  });
  if (answer === null) {
    return;
  }
  const outputPath = answer.outputPath;

  /** The pictures this run could not fetch: the reader is told their URLs, in the app's own words. */
  const unfetched: string[] = [];
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
      fetchRemote: (url) => fetchedPicture(url, unfetched),
      // Pandoc's citeproc renders the citations of every kind it writes; the kind the app writes
      // itself has none, so for it the app renders what it already knows — the words a citation
      // reads as in the page (`bibliography.format`) — and lists the works it names under them.
      citations: first.needs_pandoc
        ? null
        : {
            render: (source) => bibliographyManager.format(source),
            references: (sources) => bibliographyManager.referenceList(sources),
            title: t('export.references')
          }
    });
    const outcome = await runExport({
      kind: first.kind,
      text: prepared,
      output_path: outputPath,
      resource_paths: await resourcePaths(folder),
      source_dir: note?.path ? parentFolder(note.path) : null,
      bibliography: await bibliographyPath(),
      csl: bibliographyManager.cslForExport(),
      references: t('export.references'),
      // What the note is *called*, and the language it is in. The kind's own row decides whether it
      // uses them (a book's title page and its required language, a page's `<title>`), and a kind
      // whose body already opens with the note's own heading takes neither.
      title: documentTitle(text, note?.path ?? null),
      language: readFrontmatterLang(text) ?? language()
    });
    showHint(t('export.done', { file: fileName(outputPath) }), null);
    // A picture the *app* could not fetch, in the app's own words — before pandoc's warning about
    // it, which blames pandoc for its own missing HTTP support and would leave the reader none the
    // wiser about which URL is missing from the document they are holding.
    if (unfetched.length > 0) {
      notify(
        'Export',
        new Error(unfetched.slice(0, 4).map((url) => t('export.pictureNotFetched', { url })).join('\n'))
      );
    }
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
async function fetchedPicture(url: string, unfetched: string[]): Promise<string | null> {
  try {
    return await exportFetchImage(url);
  } catch (error) {
    console.error('Export could not fetch a picture:', error);
    unfetched.push(url);
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
