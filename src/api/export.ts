/**
 * Exporting a note, through the app's own commands: the kinds it ships, the run itself, and the
 * two seams a test drives it at.
 *
 * May import: the app's own command seam (`invoke`). Upholds: one call per export fact — the
 * window never learns where a config file lives, which pandoc was found, or how pandoc is
 * invoked, because all of that is `src-tauri/src/export.rs`'s.
 */

import { invoke } from '@tauri-apps/api/core';

/** One kind of export the app ships, as the dialog offers it. */
export interface ExportKindInfo {
  kind: string;
  extension: string;
  /** Whether the conversion is pandoc's; PDF will answer no, since the app can write it itself. */
  needs_pandoc: boolean;
  /** Where the reader's copy of the defaults file is. */
  config_path: string;
  /** Whether that copy has been written yet. */
  config_exists: boolean;
}

/** The kinds, and the pandoc the app would run — null when the machine has none. */
export interface ExportKinds {
  pandoc: string | null;
  kinds: ExportKindInfo[];
}

/** One export to run: the note's text, the kind, and where the output goes. */
export interface ExportRequest {
  kind: string;
  text: string;
  output_path: string;
  /** The folders a relative destination in the note is resolved against, in order. */
  resource_paths: string[];
  /** The note's own folder, when it has one: pandoc is run there, so its paths mean what they say. */
  source_dir: string | null;
}

/** The kinds this build ships, and where pandoc is. Reads only: nothing is written by asking. */
export async function exportKinds(): Promise<ExportKinds> {
  return await invoke<ExportKinds>('export_kinds');
}

/** Runs one export. Answers nothing; a refusal comes back as the reader-facing sentence. */
export async function runExport(request: ExportRequest): Promise<void> {
  await invoke<void>('run_export', { request });
}

/**
 * Where a kind's defaults file is, writing it from the shipped copy first when it is not there yet.
 * Opening it is the window's call: it is a file path, and the opener plugin is what the app opens
 * paths with.
 */
export async function exportConfigPath(kind: string): Promise<string> {
  return await invoke<string>('export_config_path', { kind });
}

/**
 * Points the app at another pandoc — `YI_PANDOC`, as a call, for a probe that cannot change the
 * environment of the app it drives. `null` puts it back to looking for one.
 */
export async function pointAtPandoc(pandoc: string | null): Promise<void> {
  await invoke('export_use_pandoc', { pandoc });
}
