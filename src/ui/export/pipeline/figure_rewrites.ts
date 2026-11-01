/**
 * Figure rewrites for processed Markdown, Pandoc Markdown and LaTeX exports.
 *
 * Example: a labeled figure becomes `<figure id="fig:demo">…</figure>` for Markdown and a
 * `::: {#fig:demo}` image wrapper for Pandoc without changing the image destination rule.
 *
 * May import: parsed figure/image nodes, shared pipeline contracts, image resolution, escaping and
 * the LaTeX kind rule. Upholds: one figure produces one rewrite and preserves its target and caption.
 */

import type { AstImage } from '../../markdown/ast';
import type { FigureNode } from '../../markdown/syntax/figures';
import type { ReferenceEntry } from '../../markdown/document/reference_index';
import { referenceLabel } from '../../markdown/document/reference_index';
import type { Span } from '../node_spans';
import type { ExportAnswers, Rewrite } from './contracts';
import { isLatexKind } from '../kind_family';
import { escapeHtml, htmlAttributeName } from './html';
import {
  imageDestination,
  imageMarkdown,
  imageMarkdownUnchanged
} from './image_rewrites';
import { attributeValue, encodedPath } from './markdown_escaping';

export async function figureRewrites(
  figures: readonly Span[],
  references: readonly ReferenceEntry[],
  answers: ExportAnswers,
  fetched: Map<string, string | null>
): Promise<Rewrite[]> {
  const rewrites: Rewrite[] = [];
  for (const span of figures) {
    const figure = span.node as unknown as FigureNode;
    const image = figure.children[0];
    const destination = await imageDestination(image, answers, fetched);
    const target =
      destination === null
        ? image.url
        : answers.imageTarget?.(destination, image.url) ?? destination;
    const entry = references.find(
      (candidate) => candidate.kind === 'figure' && candidate.from === span.start
    );
    const label = entry === undefined ? null : referenceLabel(entry);
    if (answers.kind === 'markdown') {
      rewrites.push({
        start: span.start,
        end: span.end,
        text: figureHtml(figure, image, target, label)
      });
      continue;
    }
    const caption =
      label === null || isLatexKind(answers.kind)
        ? image.alt ?? ''
        : `${label}. ${image.alt ?? ''}`;
    const imageText =
      destination === null
        ? imageMarkdownUnchanged({ ...image, alt: caption }, target)
        : imageMarkdown({ ...image, alt: caption }, target);
    const markdown =
      imageText + figureAttributes(figure, isLatexKind(answers.kind));
    rewrites.push({
      start: span.start,
      end: span.end,
      text:
        figure.id && !isLatexKind(answers.kind)
          ? `::: {#${figure.id}}\n${markdown}\n:::`
          : markdown
    });
  }
  return rewrites;
}

function figureHtml(
  figure: FigureNode,
  image: AstImage,
  destination: string,
  label: string | null
): string {
  const attributes = [
    ...(figure.id === null ? [] : [`id="${escapeHtml(figure.id)}"`]),
    ...(figure.classes.length === 0
      ? []
      : [`class="${escapeHtml(figure.classes.join(' '))}"`]),
    ...Object.entries(figure.attributes).map(
      ([key, value]) => `data-${htmlAttributeName(key)}="${escapeHtml(value)}"`
    )
  ];
  const imageUrl = /^[a-z][a-z0-9+.-]*:/i.test(destination)
    ? escapeHtml(destination)
    : escapeHtml(encodedPath(destination));
  const title = image.title == null ? '' : ` title="${escapeHtml(image.title)}"`;
  const caption =
    label === null
      ? String(image.alt ?? '')
      : `${label}. ${String(image.alt ?? '')}`;
  return [
    `<figure${attributes.length === 0 ? '' : ` ${attributes.join(' ')}`}>`,
    `  <img src="${imageUrl}" alt="${escapeHtml(image.alt ?? '')}"${title}>`,
    `  <figcaption>${escapeHtml(caption)}</figcaption>`,
    '</figure>'
  ].join('\n');
}

function figureAttributes(figure: FigureNode, includeId: boolean): string {
  const tokens = [
    ...(includeId && figure.id !== null ? [`#${figure.id}`] : []),
    ...figure.classes.map((name) => `.${name}`),
    ...Object.entries(figure.attributes).map(
      ([key, value]) => `${key}="${attributeValue(value)}"`
    )
  ];
  return tokens.length === 0
    ? ''
    : `${figure.attribute?.separator ?? ''}{${tokens.join(' ')}}`;
}
