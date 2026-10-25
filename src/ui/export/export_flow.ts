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
import {
  exportFetchImage,
  exportFontFor,
  exportKinds,
  namedFonts,
  runExport,
  type NoteAsset
} from '../../api/export';
import { readBibliography } from '../../api/bibliography';
import { exportTemplates, readTemplateFile, type TemplateSummary } from '../../api/templates';
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
import { bodyWithItsName } from './book_body';
import { exportDialog } from './export_dialog';
import { uncoveredCharacters } from './font_hint';
import {
  destinationsThatNameNoImage,
  imageDestinations,
  isWebDestination
} from './picture_hint';
import { exportSource } from './preprocess';
import { forgetRasters, rasterPictures } from './raster_picture';
import { portableLatexImage } from './latex_images';
import { referenceHeader } from './reference_header';
import {
  citedKeys,
  nativeBibliographyTarget,
  packageCitedBibliography
} from './native_bibliography';

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
  const templates = await exportTemplates();
  const selectedTemplateId =
    configManager.get()?.export_templates?.[first.kind] ?? null;
  const folder = await targetFolder(note?.path ?? null);
  // The note's own path with no extension: the card adds the chosen kind's name suffix and
  // extension to it, because the *kind* is what the card knows and this is what it is asked with.
  const baseTarget = await join(folder, noteName(note?.path ?? null, note?.title ?? null));

  // What the card needs to know before it is drawn: whether this note is written in characters the
  // kind's conversion settings name no font for. The app reads the *file* (`api/export.ts:
  // namedFonts`) and the window walks the *parse* (`font_hint.ts`), because a formula is not a
  // paragraph — `$\le$` draws where a bare `≤` does not.
  const fonts = await namedFonts(first.kind);
  // And when those settings cannot draw something, the *name* to write is this machine's to answer —
  // `system_fonts::covering` reads the machine's own fonts' `cmap`s for it — so the hint can name one
  // instead of telling the reader to go and find out what their machine has. Asked only in that case:
  // it is the one question here that reads font files.
  const uncovered = uncoveredCharacters(text, fonts);
  const suggestedFont =
    uncovered.length === 0
      ? null
      : await exportFontFor([
          ...new Set(uncovered.map((character) => character.codePointAt(0) ?? 0))
        ]);
  // And the other thing the note itself can say that no conversion can honour: a destination that is
  // not a picture. A `data:` URL is the one whose kind the note writes down, so it is the one the app
  // can be sure of (`picture_hint.ts`); the card says which, before anything is written.
  const answer = await exportDialog.ask({
    kind: first,
    pandoc,
    baseTarget,
    uncovered,
    suggestedFont,
    unknownFonts: fonts.unknown_fonts,
    notPictures: destinationsThatNameNoImage(text),
    templates,
    selectedTemplateId
  });
  if (answer === null) {
    return;
  }
  const outputPath = answer.outputPath;
  const selectedBibliography = await bibliographyPath();
  // The card may create or import a package after it opened, so its answer is resolved against
  // the library as it stands now rather than the list the card first drew.
  const selectedTemplates = answer.templateId === null ? templates : await exportTemplates();
  const selectedPackage = selectedTemplates.find(
    (candidate) => candidate.manifest?.id === answer.templateId
  );
  const noteAssets: NoteAsset[] = [];
  const imageTargets = new Map<string, string>();
  const imageTarget =
    first.kind === 'latex'
      ? (file: string, destination: string) => {
          const plan = portableLatexImage({
            destination,
            resolved: file,
            outputPath,
            packageRoot: selectedPackage?.path ?? null,
            packageAssets: selectedPackage?.manifest?.assets ?? [],
            targets: imageTargets
          });
          if (plan.asset !== null) {
            noteAssets.push(plan.asset);
          }
          return plan.path;
        }
      : undefined;

  /** The pictures this run could not fetch: the reader is told their URLs, in the app's own words. */
  const unfetched: string[] = [];
  try {
    // The pre-process is the one step every kind shares, and the parser is what says where the
    // wikilinks and the images *are* — a `[[…]]` in a fence, or an image's destination in a code
    // span, is code and stays exactly as written. What it answers with is the app's own reading of
    // the note: the titles a wikilink renders as, and the file each picture is found at — the same
    // folders the renderer resolves a relative destination against, so what goes into the file is
    // what the reader saw.
    // A picture on the web is fetched first, once, for the kinds pandoc writes: whether it survives
    // as it is is the same *kind's* answer as a local one — a page and a book carry an SVG or a webp,
    // and a Word file, an OpenDocument file, a TeX page and its `.tex` get the PNG the webview draws
    // (`raster_picture.ts`). Fetching here rather than inside the pre-process is what lets the fetched
    // file be drawn before it is handed over.
    const destinations = imageDestinations(text);
    const fetched = new Map<string, string | null>();
    // The kind the app writes itself keeps the note's URL: a processed markdown is the reader's own
    // file, and a copy in this run's folder would be a path that is taken away when the run ends. The
    // kinds pandoc writes need the file, because pandoc may not be built to fetch one.
    // HTML keeps a web picture as the URL the author wrote: a self-contained page can leave it
    // remote, and a non-self-contained one should not point at an app temporary that is deleted
    // after this run. The other kinds still need a local file for pandoc or the TeX engine.
    if (first.needs_pandoc && first.kind !== 'html') {
      for (const destination of destinations) {
        if (isWebDestination(destination) && !fetched.has(destination)) {
          fetched.set(destination, await fetchedPicture(destination, unfetched));
        }
      }
    }
    const pictures = [
      ...destinations,
      ...[...fetched.values()].filter((path): path is string => path !== null)
    ];
    const drawn = first.carries_pictures
      ? new Map<string, string>()
      : await rasterPictures(pictures, { bases: imageBases(), exists: fileExists });
    // The note names the URL, so an answer is keyed by the URL as well as by the file it was fetched
    // to: the pre-process asks about the destination it read from the note.
    for (const [url, file] of fetched) {
      const png = file === null ? undefined : drawn.get(file);
      if (png !== undefined) {
        drawn.set(url, png);
      }
    }
    const prepared = await exportSource(text, {
      kind: first.kind,
      titleOf: (target) => documentManager.getTitle(target),
      bases: imageBases(),
      exists: fileExists,
      fetchRemote: async (url) => {
        if (first.kind === 'html') {
          return null;
        }
        if (!first.needs_pandoc) {
          return null;
        }
        if (fetched.has(url)) {
          return fetched.get(url) ?? null;
        }
        return fetchedPicture(url, unfetched);
      },
      rasterised: (destination) => drawn.get(destination) ?? null,
      imageTarget,
      // Pandoc's citeproc renders the citations of every kind it writes; the kind the app writes
      // itself has none, so for it the app renders what it already knows — the words a citation
      // reads as in the page (`bibliography.format`) — and lists the works it names under them.
      citations: first.needs_pandoc
        ? null
        : {
            render: (source) => bibliographyManager.format(source),
            // A list is what this kind appends when a note cites works — unless the reader asked for
            // no list, which is nothing to list: the pre-process writes no heading for none.
            references: (sources) =>
              answer.suppressReferences ? [] : bibliographyManager.referenceList(sources),
            title: t('export.references')
          }
    });
    // What the note is *called*, and the language it is in. The kind's own row decides whether it
    // uses them (a book's title page and its required language, a page's `<title>`), and a kind
    // whose body already opens with the note's own heading takes neither.
    const title = documentTitle(text, note?.path ?? null);
    // And what one kind is *handed* rather than told: a book's body keeps the note's own level-1
    // heading, the note's name standing in it when the note writes none (`book_body.ts`). Every
    // other kind's body is the note's own text.
    const body = first.names_its_body ? bodyWithItsName(prepared, title) : prepared;
    const nativeBibliography = await nativeBibliographyFor(
      first.kind,
      answer.templateId,
      selectedTemplates,
      text,
      selectedBibliography
    );
    const outcome = await runExport({
      kind: first.kind,
      text: body,
      output_path: outputPath,
      resource_paths: await resourcePaths(folder),
      source_dir: note?.path ? parentFolder(note.path) : null,
      bibliography: selectedBibliography,
      csl: bibliographyManager.cslForExport(),
      references: t('export.references'),
      title,
      language: readFrontmatterLang(text) ?? language(),
      // The page the reader chose on the card, for the one kind that takes one: a size of the kind's
      // own, and which way up — or nothing at all, which is the settings file's own page.
      paper: answer.paper,
      landscape: answer.landscape,
      // The citations resolved either way: this is only about the list at the end of the document.
      suppress_references: answer.suppressReferences,
      template_id: answer.templateId,
      self_contained: answer.selfContained,
      native_bibliography:
        nativeBibliography === null
          ? null
          : { path: nativeBibliography.path, text: nativeBibliography.text },
      note_assets: noteAssets,
      reference_header:
        first.kind === 'latex' || first.kind === 'pdf' ? referenceHeader(text) : ''
    });
    const written = fileName(outputPath);
    showHint(
      first.kind === 'html'
        ? t('export.doneFolder', { folder: outputPath })
        : t('export.done', { file: written }),
      null
    );
    // A picture the *app* could not fetch, in the app's own words — before pandoc's warning about
    // it, which blames pandoc for its own missing HTTP support and would leave the reader none the
    // wiser about which URL is missing from the document they are holding.
    if (unfetched.length > 0) {
      notify(
        'Export',
        new Error(unfetched.slice(0, 4).map((url) => t('export.pictureNotFetched', { url })).join('\n'))
      );
    }
    if (nativeBibliography !== null && nativeBibliography.missing.length > 0) {
      outcome.warnings.push(
        t('export.bibliographyMissing', { keys: nativeBibliography.missing.join(', ') })
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
  } finally {
    // The pictures this run drew are the run's files and nothing else's: pandoc has read them by now.
    await forgetRasters();
  }
}

interface NativeBibliographyPlan {
  path: string;
  text: string;
  missing: string[];
}

/**
 * A selected LaTeX package can ask the app for portable BibTeX instead of citeproc. Its defaults
 * opt in, the Markdown says which keys are cited, and the selected citation library is authoritative.
 */
async function nativeBibliographyFor(
  kind: string,
  templateId: string | null,
  templates: TemplateSummary[],
  markdown: string,
  selected: string | null
): Promise<NativeBibliographyPlan | null> {
  if (kind !== 'latex' || templateId === null) {
    return null;
  }
  const template = templates.find((candidate) => candidate.manifest?.id === templateId);
  if (template === undefined) {
    return null;
  }
  const names = new Set(template.files.map((file) => file.name));
  const defaultsName = ['export.yaml', 'defaults.yaml'].find((name) => names.has(name));
  if (defaultsName === undefined) {
    return null;
  }
  const target = nativeBibliographyTarget(await readTemplateFile(templateId, defaultsName));
  if (target === null) {
    return null;
  }
  const keys = citedKeys(markdown);
  if (selected === null) {
    if (keys.length > 0) {
      throw new Error(t('export.bibliographyRequired'));
    }
    return { path: target, text: '', missing: [] };
  }
  const packaged = packageCitedBibliography(await readBibliography(), keys);
  return { path: target, text: packaged.text, missing: packaged.missing };
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
