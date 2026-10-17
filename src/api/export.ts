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
  /** What the output's name adds to the note's own (the markdown kind's `.processed`). */
  name_suffix: string;
  /**
   * Whether pandoc writes this kind. A kind that says no is written by the app itself, so it has no
   * defaults file (its `config_path` is the empty string) and no pandoc to run.
   */
  needs_pandoc: boolean;
  /** Whether the kind carries its own name, so the window hands it the note's. */
  takes_a_title: boolean;
  /** Whether the kind must declare a language, so the window hands it one. */
  needs_a_language: boolean;
  /**
   * Whether the kind's body keeps the note's own level-1 heading, its name standing in it when the
   * note writes none: the EPUB, which the window hands a body of its own (`ui/export/book_body.ts`).
   */
  names_its_body: boolean;
  /** Whether the kind's output can hold a picture as it is — an SVG or a webp; for the kinds that
   * cannot, the window draws a PNG itself (`ui/export/raster_picture.ts`). */
  carries_pictures: boolean;
  /** Whether the card offers a page size and an orientation for this kind. */
  takes_a_page_size: boolean;
  /**
   * The sizes the card offers, in order, each with the words a reader reads and the value that
   * travels back — one of these, or nothing at all for *the settings file's own*.
   */
  paper_sizes: { label: string; value: string }[];
  /** Where the reader's copy of the defaults file is. */
  config_path: string;
  /** Whether that copy has been written yet. */
  config_exists: boolean;
  /**
   * Whether that copy is the one this build ships, byte for byte — the card offers to replace it only
   * when it is not, so a reader is never invited to replace a file with what it already holds. A copy
   * that differs may be edited or written by an older build; the two cannot be told apart, so the card
   * says what the button does and lets the reader answer.
   */
  config_is_shipped: boolean;
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
  /** The page the reader asked for, for a kind that takes one: one of the kind's own sizes, or null
   * for whatever the settings file says. */
  paper: string | null;
  /** Which way up that page goes: true landscape, false portrait, null for the settings file's own. */
  landscape: boolean | null;
  /** Whether the reader asked for the citations resolved with **no reference list** at the end — for
   * the kinds pandoc writes, `suppress-bibliography` in the metadata; for the app's own hand, no list
   * is written at all. */
  suppress_references: boolean;
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
 * paths with. A kind with no file of its own — the one the app writes itself — refuses rather than
 * naming a path that will never be made, which is why the card asks `exportKinds` first.
 */
export async function exportConfigPath(kind: string): Promise<string> {
  return await invoke<string>('export_config_path', { kind });
}

/**
 * Writes the copy this build ships over the reader's own — what the card's *Replace with the shipped
 * file* button does, and only after the app's own question. Escape, or an answer of no, leaves the file
 * exactly as it was.
 */
export async function restoreExportConfig(kind: string): Promise<string> {
  return await invoke<string>('export_restore_config', { kind });
}

/**
 * What a kind's conversion settings name: whether the kind's output is typeset with those fonts, and
 * whether a font is named for the document as a whole or for CJK — the facts the card's font hint is
 * built from (`ui/export/font_hint.ts`, which owns the characters).
 */
export interface NamedFonts {
  needs_a_font: boolean;
  mainfont: boolean;
  /**
   * Whether a font is named for CJK. Han and kana are drawn with it, by the name the file gives — the
   * export's own header hands that name to the page (`src-tauri/src/export_fonts.rs`). Hangul is not
   * reached this way: it is drawn with the face this build ships, whatever the file names.
   */
  cjk_mainfont: boolean;
  /**
   * The code points the faces **this build ships** draw, as `[first, last]` ranges, read out of the
   * fonts themselves — empty for a kind whose page they do not draw. A character in here is one the
   * card stays quiet about: the export draws it with no line added to the settings file.
   */
  shipped: [number, number][];
  /**
   * The scripts the settings file names a face of its own for — its `yi-<script>-font` lines, as
   * `Hebrew`, `Thai`, … (`CJKmainfont` is not one of them: Han and kana are `cjk_mainfont` above).
   *
   * A script named there is drawn with **that** face, so the card's hint is as quiet about it as about
   * a named `mainfont`: the reader's font is taken to hold what they chose it for, and the app cannot
   * read a coverage out of a name.
   */
  named_scripts: string[];
  /**
   * The fonts the settings file names that **this machine does not have**, each once. XeTeX stops the
   * whole export on one of those rather than falling back, so the card says it while the reader is
   * looking at the file — a typo is otherwise a wall of engine output at the end of the run.
   */
  unknown_fonts: string[];
}

/**
 * What the kind's conversion settings name, read from the reader's own file — or from the copy this
 * build ships, when they have not exported that kind yet, which is what the app would write.
 */
export async function namedFonts(kind: string): Promise<NamedFonts> {
  return await invoke<NamedFonts>('export_named_fonts', { kind });
}

/**
 * The family name of a font **this machine has** that draws every one of these code points, or null —
 * asked only when the card has characters no font in the settings file can draw, so that the hint can
 * *name* one instead of telling a reader to go and find out what their machine has.
 *
 * The answer is checked against the font's own `cmap` (`system_fonts::covering`) rather than guessed
 * from a list of platform names: measured, the macOS `Songti SC` draws Han and kana and no Hangul at
 * all, which is exactly the trap a name-matching list falls into. It is a name to **type**, never a
 * choice the app makes — the reader writes the line, and may write any other.
 */
export async function exportFontFor(points: number[]): Promise<string | null> {
  return await invoke<string | null>('export_font_for', { points });
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
