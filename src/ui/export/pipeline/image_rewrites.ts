/**
 * Rewrites note images to local, portable destinations for export.
 *
 * Example: a relative picture with a space in its name becomes the percent-
 * encoded local file Pandoc can read; a web picture is fetched once.
 *
 * May import: image/span rules, path candidates and export answer types.
 * Upholds: parsing decides what is an image, and one remote URL is fetched once.
 */

import type { AstImage } from '../../markdown/ast';
import { destinationPaths } from '../../../services/workspace';
import { spansOfType, type Span, type Walkable } from '../pipeline/node_spans';
import { isWebDestination } from '../assets/picture_hint';
import { encodedPath } from './markdown_escaping';
import type { ExportAnswers, Rewrite } from '../pipeline/preprocess';

/**
 * Every image whose destination names a file that is there, as that file's own
 * absolute path. A web URL or missing file stays as written.
 */
export async function imageRewrites(
  tree: Walkable,
  answers: ExportAnswers,
  fetched: Map<string, string | null>,
  figures: readonly Span[],
  tables: readonly Span[]
): Promise<Rewrite[]> {
  const rewrites: Rewrite[] = [];
  for (const span of spansOfType(tree, 'image')) {
    if (figures.some((figure) => span.start >= figure.start && span.end <= figure.end)) {
      continue;
    }
    if (
      answers.kind === 'markdown' &&
      tables.some((table) => span.start >= table.start && span.end <= table.end)
    ) {
      continue;
    }
    const image = span.node as AstImage;
    const destination = await imageDestination(image, answers, fetched);
    if (destination !== null) {
      const target = answers.imageTarget?.(destination, image.url) ?? destination;
      rewrites.push({
        start: span.start,
        end: span.end,
        text: imageMarkdown(image, target)
      });
    }
  }
  return rewrites;
}

/** The local file an image resolves to, or null when its destination stays as written. */
export async function imageDestination(
  image: AstImage,
  answers: ExportAnswers,
  fetched: Map<string, string | null>
): Promise<string | null> {
  return (
    answers.rasterised?.(image.url) ??
    (await resolvedFile(image.url, answers)) ??
    (await remoteFile(image.url, answers, fetched))
  );
}

/** The local file a picture on the web was fetched to, or null. */
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

/** The file an image's destination names, or null when none is there. */
async function resolvedFile(
  destination: string,
  answers: ExportAnswers
): Promise<string | null> {
  const candidates = destinationPaths(
    destination,
    answers.bases.images,
    answers.bases.document
  );
  for (const candidate of candidates) {
    if (await answers.exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** The Markdown of an image whose destination is now a file path. */
export function imageMarkdown(image: AstImage, file: string): string {
  const alt = (image.alt ?? '').replace(/[[\]]/g, '\\$&');
  const title =
    image.title == null ? '' : ` "${image.title.replace(/"/g, '\\"')}"`;
  return `![${alt}](${encodedPath(file)}${title})`;
}

/** An image whose destination is already a readable Markdown destination. */
export function imageMarkdownUnchanged(
  image: AstImage,
  destination: string
): string {
  const alt = (image.alt ?? '').replace(/[[\]]/g, '\\$&');
  const title =
    image.title == null ? '' : ` "${image.title.replace(/"/g, '\\"')}"`;
  return `![${alt}](${destination}${title})`;
}
