/**
 * The note as an export reads it: the rewrites every kind of export shares, before pandoc is handed
 * anything.
 *
 * Two rules, one step, and both of them are the *app's* own answers rather than pandoc's guesses:
 *
 * - **a wikilink is written as the words it renders as** — the title after the `|`, the title of
 *   the document the target names, or the target itself when no note answers to it;
 * - **an image's destination is written as the file it names**, as an absolute path, because the
 *   page may show a picture pandoc would fail to find: the two folders a relative destination is
 *   read from (`services/workspace_folders.ts: destinationPaths`) and the spellings a copied path
 *   may use are the renderer's rules, and a hand-written `../` or a name with a space in it is
 *   exactly what an export has to get right. It is one path per image, so what the docx embeds is
 *   what the reader saw.
 *
 * What a wikilink says is `syntax/wikilink_text.ts`'s rule and what a wikilink *is* is the parser's
 * construct, so this walks the parse instead of scanning for brackets: a `[[…]]` inside a code
 * fence, an inline code span or frontmatter is not a wikilink to the parser, and so it is not one
 * in an export either. An image's destination is read the same way — from the node the parser
 * built, never from the characters.
 *
 * Resolving a title and finding a file are the app's answers rather than this module's — both are
 * arguments — which is what keeps this a rule about text, testable in Node, and what lets a caller
 * with no workspace (or no file system) write the targets and the destinations themselves.
 *
 * May import: the parser pipeline, the wikilink rule and the path rule. Upholds: one fact about
 * markdown syntax has one home, and the document text stays the only source of truth — this reads
 * the text and answers a new text, it never edits the note.
 */

import type { Position } from 'unist';
import type { AstImage, AstNode, AstWikilink } from '../markdown/ast';
import { destinationPaths } from '../../services/workspace_folders';
import { parseMarkdown } from '../markdown/syntax/parser';
import { wikilinkParts, wikilinkText } from '../markdown/syntax/wikilink_text';

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

/** What the pre-process has to ask the app: the two rules' answers, and nothing else. */
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
  return applyRewrites(text, [
    ...(await wikilinkRewrites(tree, answers.titleOf)),
    ...(await imageRewrites(tree, answers))
  ]);
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
    const file = (await resolvedFile(image.url, answers)) ?? (await remoteFile(image.url, answers, fetched));
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
  if (!/^https?:\/\//i.test(url)) {
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

/** One node of the parse, and where it stands in the text it was parsed from. */
interface Span {
  start: number;
  end: number;
  node: PositionedNode;
}

/**
 * A node of a parse, and where it stands. mdast sets a position on every node it builds from a
 * token, but the custom constructs the editor's plugins add declare only what a *component* reads
 * (`plugins/remark-wikilink`, `plugins/remark-citation`), so the position is asked for here —
 * which is what a reader that rewrites the text needs and a renderer never does.
 */
type PositionedNode = AstNode & { position?: Position };

/**
 * Every node of one type, in the order they are written, by their document offsets. A node the
 * parser gave no position is skipped: it cannot be pointed at in the text, so there is nowhere to
 * write its answer.
 */
function spansOfType(tree: Walkable, type: AstNode['type']): Span[] {
  const spans: Span[] = [];
  visit(tree, (node) => {
    if (node.type !== type) {
      return;
    }
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) {
      return;
    }
    spans.push({ start, end, node });
  });
  return spans;
}

/** `text` with the rewrites made, from the end back, so none of them moves another's span. */
function applyRewrites(text: string, rewrites: Rewrite[]): string {
  let rewritten = text;
  for (const rewrite of [...rewrites].sort((one, other) => other.start - one.start)) {
    rewritten = rewritten.slice(0, rewrite.start) + rewrite.text + rewritten.slice(rewrite.end);
  }
  return rewritten;
}

/** A node of a parse, as much of it as walking needs. */
interface Walkable {
  children?: Walkable[];
}

/** Every node of a parse, parents before children. */
function visit(node: Walkable, at: (node: PositionedNode) => void): void {
  at(node as unknown as PositionedNode);
  for (const child of node.children ?? []) {
    visit(child, at);
  }
}
