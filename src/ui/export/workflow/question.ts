/**
 * Prepares everything the export card asks with, before the reader answers.
 *
 * Example: asking for `pdf` resolves that catalogue row, the remembered valid template, the
 * note's default target, and the fonts and picture diagnostics the card must show.
 *
 * May import: the export/template seams, session and config state, pure export diagnostics and
 * path rules. Upholds: preparing a question writes no file and starts no conversion.
 */

import { join } from '@tauri-apps/api/path';
import {
  exportFontFor,
  exportKinds,
  namedFonts,
  type ExportKindInfo
} from '../../../api/export';
import { exportTemplates, type TemplateSummary } from '../../../api/templates';
import { configManager } from '../../../services/config_manager';
import { documentSession } from '../../../services/session';
import type { SessionDocument } from '../../../services/session';
import type { ExportQuestion } from '../dialog';
import { noteName, targetFolder } from './paths';
import { uncoveredCharacters } from './font_hint';
import { destinationsThatNameNoImage } from '../assets/picture_hint';
import { offeredForKind } from '../templates/offering';

/** The question and the settled state needed to execute its answer without asking again. */
export interface PreparedExportQuestion {
  readonly kind: ExportKindInfo;
  readonly note: SessionDocument | null;
  readonly folder: string;
  readonly templates: TemplateSummary[];
  readonly question: ExportQuestion;
}

/**
 * Resolves the export kind and builds the card's complete question.
 *
 * Example: a request for `docx` with a remembered DOCX package selects it only when that package
 * is still readable and offered for DOCX; a remembered package for another kind is ignored.
 */
export async function prepareExportQuestion(
  text: string,
  asked: string | null
): Promise<PreparedExportQuestion | null> {
  const { pandoc, kinds } = await exportKinds();
  const kind = kinds.find((candidate) => candidate.kind === asked) ?? kinds[0];
  if (kind === undefined) {
    return null;
  }

  const note = documentSession.current();
  const templates = await exportTemplates();
  const rememberedTemplateId = configManager.get()?.export_templates?.[kind.kind] ?? null;
  const selectedTemplateId =
    rememberedTemplateId !== null &&
    templates.some(
      (summary) =>
        summary.id === rememberedTemplateId && offeredForKind(summary, kind.kind)
    )
      ? rememberedTemplateId
      : null;
  const folder = await targetFolder(note?.path ?? null);
  const baseTarget = await join(folder, noteName(note?.path ?? null, note?.title ?? null));

  const fonts = await namedFonts(kind.kind);
  const uncovered = uncoveredCharacters(text, fonts);
  const suggestedFont =
    uncovered.length === 0
      ? null
      : await exportFontFor([
          ...new Set(uncovered.map((character) => character.codePointAt(0) ?? 0))
        ]);
  const question: ExportQuestion = {
    kind,
    pandoc,
    baseTarget,
    uncovered,
    suggestedFont,
    unknownFonts: fonts.unknown_fonts,
    notPictures: destinationsThatNameNoImage(text),
    templates,
    selectedTemplateId
  };
  return { kind, note, folder, templates, question };
}
