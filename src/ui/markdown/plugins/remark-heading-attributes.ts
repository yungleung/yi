/**
 * Moves a heading's trailing Pandoc attributes out of its rendered children.
 *
 * The attribute source remains on the heading node so the renderer can reveal
 * it at the caret and the serializer can put it back exactly where the author
 * wrote it.
 *
 * May import: the pure heading-attribute rule and the unified tree types.
 * Upholds: one fact about markdown syntax has one home — this transformer
 * applies that rule to mdast without parsing the attributes again.
 */

import type { Heading, Root } from 'mdast';
import type { VFile } from 'vfile';
import { readHeadingAttributes } from '../syntax/heading_attributes';

/** The remark plugin that separates heading attributes from heading text. */
export function remarkHeadingAttributes() {
  return separateHeadingAttributes;
}

function separateHeadingAttributes(tree: Root, file: VFile): void {
  const value = (file as { value?: unknown }).value;
  const source = typeof value === 'string' ? value : String(file);
  visit(tree);

  function visit(node: Root | Heading | { children?: unknown[] }): void {
    if (!node || typeof node !== 'object') {
      return;
    }
    const children = (node as { children?: unknown[] }).children;
    if (!Array.isArray(children)) {
      return;
    }
    if ((node as { type?: string }).type === 'heading') {
      separate(node as Heading);
    }
    for (const child of children) {
      if (child && typeof child === 'object') {
        visit(child as { children?: unknown[] });
      }
    }
  }

  function separate(heading: Heading): void {
    const start = heading.position?.start.offset;
    const end = heading.position?.end.offset;
    if (start === undefined || end === undefined) {
      return;
    }
    const attributes = readHeadingAttributes(source.slice(start, end));
    if (attributes === null) {
      return;
    }
    heading.headingAttributes = attributes;
    removeTrailingText(heading, start + attributes.separatorFrom);
  }

  /**
   * Cut the attribute range out of the last text leaf. Heading attributes
   * follow inline content, so the leaf that ends at the heading's rendered end
   * is the one that holds their source.
   */
  function removeTrailingText(parent: { children?: unknown[] }, contentEnd: number): boolean {
    const children = parent.children;
    if (!Array.isArray(children)) {
      return false;
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index] as {
        type?: string;
        value?: string;
        children?: unknown[];
        position?: {
          start?: { offset?: number };
          end?: { offset?: number };
        };
      };
      if (Array.isArray(child.children) && removeTrailingText(child, contentEnd)) {
        return true;
      }
      const start = child.position?.start?.offset;
      const end = child.position?.end?.offset;
      if (start === undefined || end === undefined || end < contentEnd) {
        continue;
      }
      if (child.type === 'text') {
        child.value = String(child.value ?? '').slice(0, Math.max(0, contentEnd - start));
        if (child.position?.end) {
          child.position.end.offset = contentEnd;
        }
        if (child.value === '') {
          children.splice(index, 1);
        }
        return true;
      }
    }
    return false;
  }
}
