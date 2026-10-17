/**
 * The note as an export reads it: the rewrites every kind of export shares, before pandoc is handed
 * anything.
 *
 * Three rules, one step, and every one of them is the *app's* own answer rather than the converting
 * side's guess:
 *
 * - **a wikilink is written as the words it renders as** — the title after the `|`, the title of
 *   the document the target names, or the target itself when no note answers to it;
 * - **an image's destination is written as the file it names**, as an absolute path, because the
 *   page may show a picture pandoc would fail to find: the two folders a relative destination is
 *   read from (`services/workspace_folders.ts: destinationPaths`) and the spellings a copied path
 *   may use are the renderer's rules, and a hand-written `../` or a name with a space in it is
 *   exactly what an export has to get right. It is one path per image, so what the docx embeds is
 *   what the reader saw;
 * - **a citation is written as the words it reads as, and the works it names are listed under them**
 *   — for the kind the app writes itself, whose conversion is this pre-process and which has no
 *   citeproc behind it. Which kinds those are is the caller's answer (`ExportAnswers.citations`),
 *   because it is a fact about the *conversion* and not about the note: a kind pandoc writes leaves
 *   `[@key]` exactly as the author wrote it and lets citeproc render it.
 *
 * What a wikilink says is `syntax/wikilink_text.ts`'s rule and what a wikilink *is* is the parser's
 * construct, so this walks the parse instead of scanning for brackets: a `[[…]]` inside a code
 * fence, an inline code span or frontmatter is not a wikilink to the parser, and so it is not one
 * in an export either. An image's destination is read the same way — from the node the parser
 * built, never from the characters — and so is a citation, which is why a `[@key]` in a fence stays
 * the characters it was written as.
 *
 * Resolving a title and finding a file are the app's answers rather than this module's — both are
 * arguments — which is what keeps this a rule about text, testable in Node, and what lets a caller
 * with no workspace (or no file system) write the targets and the destinations themselves.
 *
 * May import: the parser pipeline, the wikilink rule, the path rule and the span walk the hint beside
 * it asks the same parse for, and that hint's web-destination rule. Upholds: one fact about markdown
 * syntax has one home, and the document text stays the only source of truth — this reads the text and
 * answers a new text, it never edits the note.
 */

import type { AstCitation, AstImage, AstWikilink } from '../markdown/ast';
import { destinationPaths } from '../../services/workspace_folders';
import { parseMarkdown } from '../markdown/syntax/parser';
import { wikilinkParts, wikilinkText } from '../markdown/syntax/wikilink_text';
import { spansOfType, type Walkable } from './node_spans';
import { isWebDestination } from './picture_hint';

/** The title of the document a wikilink names, or null when nothing in the workspace answers. */
export type TitleLookup = (target: string) => Promise<string | null>;

/** Whether a path names a file that is there, asked of whatever the caller knows. */
export type FileExists = (path: string) => Promise<boolean>;

/** The two folders a relative destination is read from — the renderer's own answers. */
export interface ImageBases {
  /** The folder of the document being exported, or null when it has no file yet. */
  document: string | null;
  /** The folder the settings name for images, or null when the reader named none. */
  images: string | null;
}

/** What the pre-process has to ask the app: the rules' answers, and nothing else. */
export interface ExportAnswers {
  titleOf: TitleLookup;
  bases: ImageBases;
  exists: FileExists;
  /**
   * The local file a picture **on the web** has been fetched to, or null when it could not be. The
   * app fetches it rather than pandoc (`src-tauri/src/export.rs: export_fetch_image`), because a
   * pandoc built without HTTP support cannot fetch anything at all — and a note's picture is
   * something the page shows, which is what an export is owed.
   */
  fetchRemote: (url: string) => Promise<string | null>;
  /**
   * The PNG the app drew for a destination this kind cannot carry as it is — an SVG or a webp — or
   * null. Asked *first*: a picture survives as itself only where the output holds it
   * (`raster_picture.ts`).
   */
  rasterised?: (destination: string) => string | null;
  /**
   * How the citations are written, for kinds whose conversion is the app's *own* (`markdown`): every
   * other kind leaves `[@key]` as written and lets pandoc's citeproc render it, and such a kind has
   * no citeproc behind it. So the app renders what it already knows how to render — the words a
   * citation reads as in the page (`bibliography.format`), and the works it names listed under them
   * (`bibliography.referenceList`). Null means *leave them to pandoc*.
   */
  citations: CitationRendering | null;
}

/** The app rendering citations itself, and what the appended list is called. */
export interface CitationRendering {
  /** One citation's own source (`@key`, `[@key, p. 45]`) as the words it renders as. */
  render(source: string): string;
  /** The entries the works of these citations are listed under, or none. */
  references(sources: string[]): string[];
  /** The word the appended list is headed with, in the reader's language. */
  title: string;
}

/** One span of the document, and the text it is rewritten to. */
interface Rewrite {
  start: number;
  end: number;
  text: string;
}

/**
 * The note as pandoc should read it: every wikilink written as the words it renders as, every
 * image's destination written as the file it names. Everything else in the document is left
 * exactly as it was written, character for character.
 */
export async function exportSource(text: string, answers: ExportAnswers): Promise<string> {
  const tree = parseMarkdown(text) as unknown as Walkable;
  const cited = answers.citations === null ? null : spansOfType(tree, 'citation');
  const sources = [...new Set((cited ?? []).map((span) => (span.node as AstCitation).value))];
  const rewritten = applyRewrites(text, [
    ...(await wikilinkRewrites(tree, answers.titleOf)),
    ...(await imageRewrites(tree, answers)),
    ...(cited ?? []).map((span) => ({
      start: span.start,
      end: span.end,
      text: answers.citations!.render((span.node as AstCitation).value)
    }))
  ]);
  if (answers.citations === null || sources.length === 0) {
    return rewritten;
  }
  const entries = answers.citations.references(sources);
  if (entries.length === 0) {
    return rewritten;
  }
  // The list the works are listed under, as markdown: a heading under the note's own, and one bullet
  // per work. A kind that gets this is one pandoc is not rendering, so nothing else will add it.
  return `${rewritten.trimEnd()}\n\n## ${answers.citations.title}\n\n${entries
    .map((entry) => `- ${entry}`)
    .join('\n')}\n`;
}

/**
 * Every wikilink, as the words it renders as. Only the links that need an answer are asked about:
 * one that names its own text has its answer already, and a target the workspace holds no note for
 * is asked once, not once a link.
 */
async function wikilinkRewrites(tree: Walkable, titleOf: TitleLookup): Promise<Rewrite[]> {
  const spans = spansOfType(tree, 'wikilink').map((span) => ({
    ...span,
    parts: wikilinkParts((span.node as AstWikilink).value)
  }));
  const titles = new Map<string, string | null>();
  await Promise.all(
    [
      ...new Set(
        spans
          .filter((span) => span.parts.title === null && span.parts.target !== '')
          .map((span) => span.parts.target)
      )
    ].map(async (target) => {
      // An empty answer is no answer: a title that is the empty string would write nothing at all.
      titles.set(target, (await titleOf(target)) || null);
    })
  );
  return spans.map((span) => ({
    start: span.start,
    end: span.end,
    text: wikilinkText(span.parts, titles.get(span.parts.target) ?? null)
  }));
}

/**
 * Every image whose destination names a file that is there, as that file's own absolute path. A
 * destination that names no *file* (a web URL, a scheme of its own) is left as written, and so is
 * one whose file cannot be found: pandoc says so itself, and a note that shows a broken image
 * exports as a broken image rather than as something the app invented.
 */
async function imageRewrites(tree: Walkable, answers: ExportAnswers): Promise<Rewrite[]> {
  const rewrites: Rewrite[] = [];
  // One URL is one download, however many times a note names it.
  const fetched = new Map<string, string | null>();
  for (const span of spansOfType(tree, 'image')) {
    const image = span.node as AstImage;
    const file =
      answers.rasterised?.(image.url) ??
      (await resolvedFile(image.url, answers)) ??
      (await remoteFile(image.url, answers, fetched));
    if (file !== null) {
      rewrites.push({ start: span.start, end: span.end, text: imageMarkdown(image, file) });
    }
  }
  return rewrites;
}

/** The local file a picture on the web was fetched to, or null when it names no such picture. */
async function remoteFile(
  destination: string,
  answers: ExportAnswers,
  fetched: Map<string, string | null>
): Promise<string | null> {
  const url = destination.trim();
  if (!isWebDestination(url)) {
    return null;
  }
  const known = fetched.get(url);
  if (known !== undefined) {
    return known;
  }
  const file = await answers.fetchRemote(url);
  fetched.set(url, file);
  return file;
}

/** The file an image's destination names, or null when it names none that is there. */
async function resolvedFile(destination: string, answers: ExportAnswers): Promise<string | null> {
  const candidates = destinationPaths(destination, answers.bases.images, answers.bases.document);
  for (const candidate of candidates) {
    if (await answers.exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** The markdown of an image whose destination is now a file path: `![alt](path "title")`. */
function imageMarkdown(image: AstImage, file: string): string {
  const alt = (image.alt ?? '').replace(/[[\]]/g, '\\$&');
  const title = image.title == null ? '' : ` "${image.title.replace(/"/g, '\\"')}"`;
  return `![${alt}](${encodedPath(file)}${title})`;
}

/**
 * A path written so markdown reads it as itself, and pandoc fetches the file it names: every
 * character a destination could mean something else by is percent-encoded (a space, a `#`, a `(`,
 * a `"`, a `%` itself), and pandoc decodes them again when it goes to fetch the picture — measured,
 * with a file for each of those characters in its name.
 */
function encodedPath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/** `text` with the rewrites made, from the end back, so none of them moves another's span. */
function applyRewrites(text: string, rewrites: Rewrite[]): string {
  let rewritten = text;
  for (const rewrite of [...rewrites].sort((one, other) => other.start - one.start)) {
    rewritten = rewritten.slice(0, rewrite.start) + rewrite.text + rewritten.slice(rewrite.end);
  }
  return rewritten;
}
