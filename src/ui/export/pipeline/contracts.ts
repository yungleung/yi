/**
 * Shared contracts for the export rewriting pipeline.
 *
 * Example: `ExportAnswers.kind === 'markdown'` selects processed-Markdown figure HTML, while a
 * LaTeX kind uses native image attributes; every focused rewrite reads the same answer object.
 *
 * May import: nothing. Upholds: the pipeline's cross-module shapes live in one dependency-free file,
 * so focused rewrites do not need to import the orchestrator.
 */

/** The title of the document a wikilink names, or null when nothing in the workspace answers. */
export type TitleLookup = (target: string) => Promise<string | null>;

/** Whether a path names a file that is there, asked of whatever the caller knows. */
export type FileExists = (path: string) => Promise<boolean>;

import type { ImageBases } from '../assets';

/** What the pre-process has to ask the app: the rules' answers, and nothing else. */
export interface ExportAnswers {
  /** The export kind whose portability rules this run follows. */
  kind: string;
  titleOf: TitleLookup;
  bases: ImageBases;
  exists: FileExists;
  /**
   * The local file a picture **on the web** has been fetched to, or null when it could not be. The
   * app fetches it rather than pandoc, because a pandoc built without HTTP support cannot fetch
   * anything at all — and a note's picture is something the page shows, which an export is owed.
   */
  fetchRemote: (url: string) => Promise<string | null>;
  /**
   * The PNG the app drew for a destination this kind cannot carry as it is — an SVG or a webp — or
   * null. Asked *first*: a picture survives as itself only where the output holds it.
   */
  rasterised?: (destination: string) => string | null;
  /**
   * The portable destination for the file an image resolved to. LaTeX source exports use this so
   * the `.tex` never contains a machine-specific absolute path; other kinds leave it undefined.
   */
  imageTarget?: (file: string, destination: string) => string;
  /**
   * How the citations are written, for kinds whose conversion is the app's own. Null leaves them
   * to pandoc and citeproc.
   */
  citations: CitationRendering | null;
}

/** The app rendering citations itself, and what the appended list is called. */
export interface CitationRendering {
  /** One citation's own source as the words it renders as. */
  render(source: string): string;
  /** The entries the works of these citations are listed under, or none. */
  references(sources: string[]): string[];
  /** The word the appended list is headed with, in the reader's language. */
  title: string;
}

/** One span of the document, and the text it is rewritten to. */
export interface Rewrite {
  start: number;
  end: number;
  text: string;
}
