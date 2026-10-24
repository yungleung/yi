/**
 * Splits ordinary text nodes around Yi's textless automatic references.
 *
 * CommonMark already leaves `[#id]` as text, so this plugin runs after parsing
 * and changes only text leaves. It skips link labels to avoid constructing an
 * anchor inside another anchor.
 *
 * May import: the pure automatic-reference scanner and mdast types. Upholds:
 * the document text is the only source of truth — every replacement node keeps
 * the source offsets of the characters it represents.
 */

import type { PhrasingContent, Root, RootContent } from 'mdast';
import type { Point, Position } from 'unist';
import type { VFile } from 'vfile';
import { autoReferenceSpans } from '../syntax/auto_references';

/** A custom inline reference whose visible text comes from its target. */
export interface AutoReferenceNode {
  type: 'autoReference';
  id: string;
  value: string;
  position?: Position;
}

/** The remark plugin that replaces `[#id]` in text leaves. */
export function remarkAutoReferences() {
  return transform;
}

function transform(tree: Root, file: VFile): void {
  const value = (file as { value?: unknown }).value;
  const source = typeof value === 'string' ? value : String(file);
  const children = tree.children;
  for (let index = 0; index < children.length; index += 1) {
    children[index] = transformNode(children[index], false, source);
  }
}

/** Transform one node, replacing a text leaf with text/reference runs. */
function transformNode(node: RootContent, insideLink: boolean, source: string): RootContent {
  const children = (node as { children?: RootContent[] }).children;
  if (Array.isArray(children)) {
    const nestedLink =
      insideLink || node.type === 'link' || node.type === 'linkReference';
    for (let index = 0; index < children.length; index += 1) {
      if (children[index].type === 'text') {
        const replacements = splitText(children[index] as PhrasingContent, nestedLink, source);
        if (replacements.length !== 1 || replacements[0] !== children[index]) {
          children.splice(index, 1, ...(replacements.filter(Boolean) as RootContent[]));
          index += replacements.length - 1;
        }
      } else {
        children[index] = transformNode(children[index], nestedLink, source);
      }
    }
  }
  return node;
}

/**
 * The replacement runs for one text node. A result with one identical text
 * child means there was nothing to split.
 */
function splitText(
  node: PhrasingContent,
  insideLink: boolean,
  source: string
): (RootContent | null)[] {
  if (insideLink || node.type !== 'text') {
    return [node];
  }
  const sourceStart = node.position?.start.offset;
  const sourceEnd = node.position?.end.offset;
  const raw =
    sourceStart === undefined || sourceEnd === undefined
      ? node.value
      : source.slice(sourceStart, sourceEnd);
  // Escapes and character references make rendered text shorter than source.
  // Do not infer references from a leaf whose two forms disagree.
  if (raw !== node.value) {
    return [node];
  }
  const spans = autoReferenceSpans(raw);
  if (spans.length === 0) {
    return [node];
  }
  const result: RootContent[] = [];
  const start = node.position?.start;
  let cursor = 0;
  for (const span of spans) {
    if (span.from > cursor) {
      result.push(textNode(node.value.slice(cursor, span.from), start, cursor));
    }
    const reference: AutoReferenceNode = {
      type: 'autoReference',
      id: span.id,
      value: node.value.slice(span.from, span.to),
      position: positioned(start, span.from, span.to)
    };
    result.push(reference);
    cursor = span.to;
  }
  if (cursor < node.value.length) {
    result.push(textNode(node.value.slice(cursor), start, cursor));
  }
  return result;
}

/** A text node whose source starts at `relative` inside its original sibling. */
function textNode(value: string, start: Point | undefined, relative: number): PhrasingContent {
  return {
    type: 'text',
    value,
    ...(start ? { position: positioned(start, relative, relative + value.length) } : {})
  };
}

/** Point information sufficient for all document-offset readers. */
function positioned(start: Point | undefined, from: number, to: number): Position | undefined {
  if (start?.offset === undefined || start.line === undefined || start.column === undefined) {
    return undefined;
  }
  const begin = { ...start, offset: start.offset + from, column: start.column + from };
  return { start: begin, end: { ...begin, offset: start.offset + to, column: begin.column + to - from } };
}
