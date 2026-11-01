/**
 * Turns Pandoc implicit figures into Yi's block-level figure nodes.
 *
 * Pandoc treats a paragraph containing one non-empty-alt image as a figure.
 * Yi uses the same rule after its other parser repairs, then separates an
 * optional trailing image attribute block from visible paragraph text.
 *
 * May import: the shared Pandoc attribute syntax and mdast types. Upholds: one
 * fact about markdown syntax has one home and a block rendering is a pure
 * function of its own source.
 */

import type { Image, Paragraph, Root, RootContent } from 'mdast';
import { attributeBlockAtEnd, type PandocAttributeBlock } from './pandoc';

/** A block-level implicit figure. */
export interface FigureNode {
  type: 'figure';
  children: [Image];
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  attribute: PandocAttributeBlock | null;
  source: string;
  position?: Paragraph['position'];
}

/** Replace every paragraph that Pandoc would read as a figure. */
export function restoreFigures(tree: Root, markdown: string): void {
  visit(tree.children);

  function visit(children: RootContent[]): void {
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.type === 'paragraph') {
        const figure = figureFrom(child, markdown);
        if (figure) {
          children[index] = figure;
          continue;
        }
      }
      const nested = (child as { children?: RootContent[] }).children;
      if (Array.isArray(nested)) {
        visit(nested);
      }
    }
  }
}

/** One paragraph as an implicit figure, or null. */
function figureFrom(paragraph: Paragraph, markdown: string): FigureNode | null {
  const start = paragraph.position?.start.offset;
  const end = paragraph.position?.end.offset;
  if (start === undefined || end === undefined) {
    return null;
  }
  const image = paragraph.children.find((child) => child.type === 'image') as Image | undefined;
  if (!image || !String(image.alt ?? '').trim()) {
    return null;
  }
  const imageStart = image.position?.start.offset;
  const imageEnd = image.position?.end.offset;
  if (imageStart === undefined || imageEnd === undefined) {
    return null;
  }
  const source = markdown.slice(start, end);
  const before = markdown.slice(start, imageStart);
  if (before.trim() !== '') {
    return null;
  }
  const after = markdown.slice(imageEnd, end);
  const relative = attributeBlockAtEnd(after, after.length, false);
  const attribute = relative
    ? {
        ...relative,
        from: imageEnd + relative.from,
        to: imageEnd + relative.to,
        separatorFrom: imageEnd + relative.separatorFrom
      }
    : null;
  const attributeStart = attribute?.from ?? null;
  const trailing =
    attributeStart === null
      ? after
      : markdown.slice(imageEnd, attributeStart);
  const afterAttributes =
    attribute === null ? '' : markdown.slice(attribute.to, end);
  if (trailing.trim() !== '' || afterAttributes.trim() !== '') {
    return null;
  }

  return {
    type: 'figure',
    children: [image],
    id: attribute?.id ?? null,
    classes: attribute?.classes ?? [],
    attributes: attribute?.attributes ?? {},
    attribute,
    source,
    position: paragraph.position
  };
}
