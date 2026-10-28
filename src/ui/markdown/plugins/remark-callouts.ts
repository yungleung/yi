/**
 * Restores GitHub-alert and fenced-Div callouts from the parser's ordinary nodes.
 *
 * Fenced-Div openings are transformed into same-length directive syntax before
 * parsing; this module uses the node's source position to recover the original
 * callout and replace that parser node with the editor's semantic callout node.
 *
 * May import: the pure callout grammar and mdast types. Upholds: both source
 * forms become one model, marker text never appears in the visible body, and
 * every retained node keeps its original document offsets.
 */

import type { Paragraph, Parent, Root, RootContent, Text } from 'mdast';
import type { Point, Position } from 'unist';
import type { VFile } from 'vfile';
import { readCallout, type CalloutSource } from '../syntax/callouts';

/** A block-level callout normalized from GitHub or Pandoc source. */
export interface CalloutNode extends Parent {
  type: 'callout';
  callout: CalloutSource;
  children: RootContent[];
}

/** The remark transformer that normalizes both callout source forms. */
export function remarkCallouts() {
  return (tree: Root, file: VFile): void => {
    const markdown =
      typeof file.data.calloutSource === 'string'
        ? file.data.calloutSource
        : String(file);
    visit(
      tree.children,
      (node) => restoreNode(node, markdown) ?? restoreDirectiveLiteral(node, markdown)
    );
  };
}

/**
 * Applies one replacement to every node that is not already a callout body.
 * A callout directive is kept so the later pass can restore its metadata.
 */
function visit(
  children: RootContent[],
  restore: (node: RootContent & {
    type: string;
    children?: RootContent[];
    position?: Position;
  }) => RootContent | null
): void {
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index] as RootContent & {
      type: string;
      children?: RootContent[];
      position?: Position;
    };
    const restored = restore(node);
    if (restored !== null) {
      children[index] = restored;
      const restoredChildren = (restored as { children?: RootContent[] }).children;
      if (Array.isArray(restoredChildren)) {
        visit(restoredChildren, restore);
      }
      continue;
    }
    if (Array.isArray(node.children)) {
      visit(node.children, restore);
    }
  }
  mergeText(children);
}

/** Rejoin adjacent text leaves split by directive syntax before later scanners run. */
function mergeText(children: RootContent[]): void {
  for (let index = children.length - 2; index >= 0; index -= 1) {
    const left = children[index];
    const right = children[index + 1];
    if (left.type !== 'text' || right.type !== 'text') {
      continue;
    }
    left.value += right.value;
    if (left.position?.end && right.position?.end) {
      left.position.end = right.position.end;
    }
    children.splice(index + 1, 1);
  }
}

/** One parser node as a callout, or null when its source is not a callout. */
function restoreNode(
  node: RootContent & {
    type: string;
    children?: RootContent[];
    position?: Position;
  },
  markdown: string
): CalloutNode | null {
  const start = node.position?.start.offset;
  if (start === undefined || !Array.isArray(node.children)) {
    return null;
  }
  if (node.type === 'blockquote' && node.children[0]?.type !== 'paragraph') {
    return null;
  }
  if (
    node.type !== 'blockquote' &&
    node.type !== 'containerDirective'
  ) {
    return null;
  }

  const callout = readCallout(markdown.slice(start));
  if (
    callout === null ||
    callout.to !== (node.position?.end.offset ?? -1) - start ||
    (node.type === 'blockquote' && callout.form !== 'alert') ||
    (node.type === 'containerDirective' && callout.form !== 'div')
  ) {
    return null;
  }

  const absolute = shiftCallout(callout, start, markdown);
  const children =
    callout.form === 'alert'
      ? alertChildren(node.children, absolute, markdown)
      : [...node.children];

  return {
    type: 'callout',
    callout: absolute,
    children,
    position: node.position
  };
}

/** Restore directive syntax that is not one of our callouts to its source text. */
function restoreDirectiveLiteral(
  node: RootContent & {
    type: string;
    position?: Position;
  },
  markdown: string
): RootContent | null {
  if (
    node.type !== 'textDirective' &&
    node.type !== 'leafDirective' &&
    node.type !== 'containerDirective'
  ) {
    return null;
  }
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) {
    return null;
  }
  if (node.type === 'containerDirective') {
    const callout = readCallout(markdown.slice(start));
    if (
      callout?.form === 'div' &&
      callout.to === end - start
    ) {
      return null;
    }
  }
  const text: Text = {
    type: 'text',
    value: markdown.slice(start, end),
    position: node.position
  };
  if (node.type === 'textDirective') {
    return text;
  }
  return {
    type: 'paragraph',
    children: [text],
    position: node.position
  };
}

/** Remove the marker line or marker prefix from the GitHub alert's body. */
function alertChildren(
  children: RootContent[],
  callout: CalloutSource,
  markdown: string
): RootContent[] {
  const first = children[0];
  if (first?.type !== 'paragraph') {
    return children;
  }
  const markerEnd = callout.markerTo;
  const firstEnd = first.position?.end.offset;
  if (firstEnd === undefined) {
    return children;
  }
  if (firstEnd <= markerEnd) {
    return children.slice(1);
  }

  const paragraph = first as Paragraph;
  const marker = markdown.slice(callout.markerFrom, callout.markerTo);
  const firstText = paragraph.children[0];
  if (firstText?.type !== 'text') {
    return children;
  }
  const text = firstText as Text;
  const sourceStart = text.position?.start.offset;
  if (sourceStart === undefined || sourceStart > callout.markerFrom) {
    return children;
  }
  const offset = callout.markerFrom - sourceStart;
  if (text.value.slice(offset, offset + marker.length) !== marker) {
    return children;
  }
  let body = text.value.slice(offset + marker.length);
  body = body.replace(/^\r?\n/, '');

  if (body !== '') {
    const start = pointAt(markdown, callout.bodyFrom);
    text.value = body;
    text.position = {
      start,
      end: text.position?.end ?? start
    };
    paragraph.position = {
      start,
      end: paragraph.position?.end ?? start
    };
    return children;
  }
  paragraph.children.splice(0, 1);
  if (paragraph.children.length === 0) {
    return children.slice(1);
  }
  const start = pointAt(markdown, callout.bodyFrom);
  paragraph.position = {
    start,
    end: paragraph.position?.end ?? start
  };
  return children;
}

/** Callout ranges from a source slice, moved back into document coordinates. */
function shiftCallout(
  callout: CalloutSource,
  start: number,
  markdown: string
): CalloutSource {
  return {
    ...callout,
    from: callout.from + start,
    to: callout.to + start,
    markerFrom: callout.markerFrom + start,
    markerTo: callout.markerTo + start,
    bodyFrom: callout.bodyFrom + start,
    bodyTo: callout.bodyTo + start,
    source: markdown.slice(start, start + callout.to)
  };
}

/** A complete source point at a document offset. */
function pointAt(source: string, offset: number): Point {
  const before = source.slice(0, offset);
  const line = 1 + (before.match(/\n/g)?.length ?? 0);
  const lastBreak = source.lastIndexOf('\n', Math.max(0, offset - 1));
  return { line, column: offset - lastBreak, offset };
}
