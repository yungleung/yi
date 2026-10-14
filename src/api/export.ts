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
  /** Whether the kind carries its own name, so the window hands it the note's. */
  takes_a_title: boolean;
  /** Whether the kind must declare a language, so the window hands it one. */
  needs_a_language: boolean;
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

/** What an export did: what pandoc said on the way, which is why a document may be missing a piece. */
export interface ExportOutcome {
  warnings: string[];
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
  /** The library the citations were formatted from, so pandoc can append their references. */
  bibliography: string | null;
  /** The CSL style the page showed, so the appended reference list is that style. */
  csl: { name: string; xml: string } | null;
  /** What that list is called in the reader's language — pandoc leaves it unnamed without one. */
  references: string | null;
  /** What the note is called, and the language it is in: the kinds that carry their own name use
   * them, and the kinds whose body already says the name ignore them. */
  title: string | null;
  language: string | null;
}

/** The kinds this build ships, and where pandoc is. Reads only: nothing is written by asking. */
export async function exportKinds(): Promise<ExportKinds> {
  return await invoke<ExportKinds>('export_kinds');
}

/**
 * Runs one export. A refusal comes back as the reader-facing sentence; what pandoc warned about on
 * the way comes back in the outcome, so the window can say it.
 */
export async function runExport(request: ExportRequest): Promise<ExportOutcome> {
  return await invoke<ExportOutcome>('run_export', { request });
}

/**
 * Fetches a picture from the web for one export, and answers the local file it was written to.
 * A URL that cannot be fetched, or that is not a picture a Word file can hold, throws.
 */
export async function exportFetchImage(url: string): Promise<string> {
  return await invoke<string>('export_fetch_image', { url });
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

/**
 * Points the app at another curl — `YI_CURL`, as a call, for a probe that cannot change the
 * environment of the app it drives. `null` puts it back to looking for one.
 */
export async function pointAtCurl(curl: string | null): Promise<void> {
  await invoke('export_use_curl', { curl });
}
