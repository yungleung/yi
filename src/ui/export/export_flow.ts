/**
 * The File menu's export command: ask the reader, then hand the confirmed request to the runner.
 *
 * Example: the menu emits `pdf`; this module prepares the PDF question, waits for the card, and
 * starts the confirmed export only when the reader submits rather than cancels.
 *
 * May import: export planning, confirmed execution, the export card and the command registry.
 * Upholds: one command has one name, one home and one way in — every trigger reaches the same
 * `file:export` implementation.
 */

import { registerCommand } from '../../commands/runtime';
import { exportDialog } from './export_dialog';
import type { ExportProgress } from './export_progress';
import { prepareExportQuestion } from './export_question';
import { runConfirmedExport } from './export_request';

/** What the export needs from the editor that owns the note on screen. */
export interface ExportHost {
  /** The text on screen: the editor's own, which is never older than the session's copy of it. */
  text(): string;
  /** The status bar's progress port, held for exactly as long as this export runs. */
  progress: ExportProgress;
}

/** Registers the File menu's *Export* submenu: one command, and the kind travels as its payload. */
export function registerExportCommand(host: ExportHost): void {
  registerCommand({
    id: 'file:export',
    run: async (kind) => {
      await exportNote(host.text(), kind, host.progress);
      return null;
    }
  });
}

/**
 * Asks how the text goes out, and runs only the answer the reader confirms.
 *
 * `asked` is the kind the menu item names, or null when nothing named one. The fallback preserves
 * the pre-submenu behaviour: an export command without a payload uses the first shipped kind.
 */
export async function exportNote(
  text: string,
  asked: string | null = null,
  progress: ExportProgress | null = null
): Promise<void> {
  const prepared = await prepareExportQuestion(text, asked);
  if (prepared === null) {
    return;
  }
  const answer = await exportDialog.ask(prepared.question);
  if (answer === null) {
    return;
  }
  await runConfirmedExport({
    text,
    kind: prepared.kind,
    note: prepared.note,
    folder: prepared.folder,
    templates: prepared.templates,
    answer,
    progress
  });
}
