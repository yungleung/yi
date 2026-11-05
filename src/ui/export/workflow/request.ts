/**
 * Executing one export after the reader has confirmed the card.
 *
 * Example: a confirmed PDF answer prepares images and citations, runs Pandoc, reports warnings,
 * and removes the raster files this run drew even when the conversion fails.
 *
 * May import: the export/BibTeX seams, authoritative document metadata, image preparation,
 * source pre-processing, result reporting and path rules. Upholds: no file conversion starts
 * before an answer, and temporary run assets are removed on every exit path.
 */

import {
  exportFetchImage,
  runExport,
  type ExportKindInfo,
  type NoteAsset
} from '../../../api/export';
import { exportTemplates, type TemplateSummary } from '../../../api/templates';
import { bibliographyManager } from '../../../services/bibliography';
import { documentTitle, readFrontmatterLang } from '../../../services/documents';
import { documentManager } from '../../../services/documents';
import { language, t } from '../../../services/i18n';
import type { ExportProgress } from '../../../services/export_activity';
import { notify } from '../../../services/messages';
import type { SessionDocument } from '../../../services/session';
import { bibliographyPath } from '../../../services/settings_paths';
import { parentFolder } from '../../../services/workspace';
import { imageBases } from '../../image/index';
import { bodyWithItsName } from './body';
import type { ExportAnswer } from '../dialog';
import { nativeBibliographyFor } from './bibliography';
import { reportExport } from './notice';
import { fileExists, resourcePaths } from './paths';
import { isLatexKind } from '../kind_family';
import {
  forgetRasters,
  imageDestinations,
  isWebDestination,
  portableLatexImage,
  rasterPictures
} from '../assets';
import { exportSource } from '../pipeline';
import { referenceHeader } from '../reference';

/** The confirmed state needed to perform one export without reopening the question. */
export interface ConfirmedExportRequest {
  readonly text: string;
  readonly kind: ExportKindInfo;
  readonly note: SessionDocument | null;
  readonly folder: string;
  readonly templates: TemplateSummary[];
  readonly answer: ExportAnswer;
  /** The activity owner, or null when a caller runs without status presentation. */
  readonly progress: ExportProgress | null;
}

/**
 * Prepares and performs one confirmed export.
 *
 * Example: an HTML answer with self-contained off keeps web pictures remote, copies local pictures
 * through the shared pre-process, and reports the bundle folder only after Pandoc succeeds.
 */
export async function runConfirmedExport(request: ConfirmedExportRequest): Promise<void> {
  const { text, kind, note, folder, templates, answer, progress } = request;
  const finishProgress = progress?.begin();
  try {
    const outputPath = answer.outputPath;
    const selectedBibliography = await bibliographyPath();
    const selectedTemplates =
      answer.templateId === null ? templates : await exportTemplates();
    const selectedPackage = selectedTemplates.find(
      (candidate) => candidate.manifest?.id === answer.templateId
    );
    const noteAssets: NoteAsset[] = [];
    const imageTargets = new Map<string, string>();
    const imageTarget =
      kind.kind === 'latex'
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

    const unfetched: string[] = [];
    const destinations = imageDestinations(text);
    const fetched = new Map<string, string | null>();
    const keepPicturesRemote =
      kind.kind === 'html' ||
      (kind.kind === 'revealjs' && answer.revealjsRemotePictures);
    if (kind.needs_pandoc && !keepPicturesRemote) {
      for (const destination of destinations) {
        if (isWebDestination(destination) && !fetched.has(destination)) {
          const file = await fetchedPicture(destination, unfetched);
          if (file === null && kind.kind === 'revealjs') {
            throw new Error(t('export.revealPictureFailed', { url: destination }));
          }
          fetched.set(destination, file);
        }
      }
    }
    const pictures = [
      ...destinations,
      ...[...fetched.values()].filter((path): path is string => path !== null)
    ];
    const drawn = kind.carries_pictures
      ? new Map<string, string>()
      : await rasterPictures(pictures, { bases: imageBases(), exists: fileExists });
    for (const [url, file] of fetched) {
      const png = file === null ? undefined : drawn.get(file);
      if (png !== undefined) {
        drawn.set(url, png);
      }
    }

    const prepared = await exportSource(text, {
      kind: kind.kind,
      titleOf: (target) => documentManager.getTitle(target),
      bases: imageBases(),
      exists: fileExists,
      fetchRemote: async (url) => {
        if (keepPicturesRemote || !kind.needs_pandoc) {
          return null;
        }
        if (fetched.has(url)) {
          return fetched.get(url) ?? null;
        }
        return fetchedPicture(url, unfetched);
      },
      rasterised: (destination) => drawn.get(destination) ?? null,
      imageTarget,
      citationKeys: new Set(
        bibliographyManager.entries().map((entry) => entry.key)
      ),
      citations: kind.needs_pandoc
        ? null
        : {
            render: (source) => bibliographyManager.format(source),
            references: (sources) =>
              answer.suppressReferences ? [] : bibliographyManager.referenceList(sources),
            title: t('export.references')
          }
    });

    const title = documentTitle(text, note?.path ?? null);
    const body = kind.names_its_body ? bodyWithItsName(prepared, title) : prepared;
    const nativeBibliography = await nativeBibliographyFor(
      kind.kind,
      answer.templateId,
      selectedTemplates,
      text,
      selectedBibliography
    );
    const outcome = await runExport({
      kind: kind.kind,
      text: body,
      output_path: outputPath,
      resource_paths: await resourcePaths(folder),
      source_dir: note?.path ? parentFolder(note.path) : null,
      bibliography: selectedBibliography,
      csl: bibliographyManager.cslForExport(),
      references: t('export.references'),
      title,
      language: readFrontmatterLang(text) ?? language(),
      paper: answer.paper,
      landscape: answer.landscape,
      suppress_references: answer.suppressReferences,
      template_id: answer.templateId,
      self_contained: answer.selfContained,
      revealjs_remote_js: answer.revealjsRemoteJs,
      native_bibliography:
        nativeBibliography === null
          ? null
          : { path: nativeBibliography.path, text: nativeBibliography.text },
      note_assets: noteAssets,
      reference_header: isLatexKind(kind.kind) ? referenceHeader(text) : ''
    });
    finishProgress?.();
    reportExport({ kind: kind.kind, outputPath, unfetched, nativeBibliography, outcome });
  } catch (error) {
    finishProgress?.();
    notify('Export', error);
  } finally {
    try {
      await forgetRasters();
    } finally {
      finishProgress?.();
    }
  }
}

/**
 * A picture the note names on the web, fetched for this export.
 *
 * A URL the app cannot fetch answers null and joins `unfetched`; the destination remains exactly
 * as the note wrote it for Pandoc to try and warn about itself.
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
