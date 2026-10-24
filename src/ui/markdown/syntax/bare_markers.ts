/**
 * A bare block marker is text.
 *
 * markdown reads `-` as an item on its own — the marker needs no delimiter space when it is the
 * whole line — and reads it as a setext heading's underline when a paragraph line sits above it,
 * which folds that paragraph into a heading. The author typing `-` is writing the character: the
 * item begins at the space that follows it (`- `), and until then what the rendering shows has to
 * be the character itself. This repair says so, for the two shapes markdown makes of it: the list
 * of one empty item becomes a paragraph holding the marker, the heading a bare underline made of
 * the paragraph above it becomes that paragraph plus the marker's own text, and an ATX heading
 * marker without its delimiter space is the `#` characters the author is typing.
 *
 * May import: the marker rules (`./markers`) and the line spans beside them (`./lines`). Upholds:
 * one fact about markdown syntax has one home — that marker-only lines need their delimiter space
 * before they become a list or ATX heading, and that a bare `-` under a paragraph is not a setext
 * underline — so typing a marker never hides the characters being typed.
 */

import type { Root } from 'mdast';
import { bareHeadingLine, bareMarkerLine } from './markers';
import { lineSpanAt } from './lines';

/** A node that may hold block children, with the position the repair needs. */
interface Container {
  type?: string;
  children?: Container[];
  position?: { start: Point; end: Point };
}

/** A position inside the parsed markdown. */
interface Point {
  offset: number;
  line: number;
  column: number;
}

/** The bare marker line a node is, or holds as its last line. */
interface MarkerText {
  /** Offset of the line's first character, and just past its last. */
  start: number;
  end: number;
  /** The marker's own text (`-`, `1.`), with the indentation in front of it dropped. */
  marker: string;
  /** Where the paragraph markdown folded into a heading ends, or null for a list of its own line. */
  paragraphEnd: number | null;
}

/** Rewrites every bare marker line markdown read as a list item or a setext heading. */
export function restoreBareMarkers(root: Root, markdown: string): void {
  repairContainer(root as unknown as Container, markdown);
}

/** Bottom-up: repair a container once its own children are repaired. */
function repairContainer(container: Container, markdown: string): void {
  const children = container.children;
  if (!children) {
    return;
  }
  for (const child of children) {
    repairContainer(child, markdown);
  }
  for (let index = 0; index < children.length; index += 1) {
    const line = markerTextLine(markdown, children[index]);
    if (line) {
      children.splice(index, 1, ...textNodes(children[index], line));
    }
  }
}

/**
 * The bare marker line the node is, or null when it is not one: either a list whose whole source
 * is the line — markdown's reading of a marker alone — or a heading whose last line is the line,
 * the setext underline it became.
 */
function markerTextLine(markdown: string, node: Container): MarkerText | null {
  const position = node.position;
  if (!position) {
    return null;
  }
  const start = Math.max(0, Math.min(position.start.offset, markdown.length));
  const end = Math.max(start, Math.min(position.end.offset, markdown.length));
  if (node.type === 'list') {
    const text = markdown.slice(start, end);
    return bareMarkerLine.test(text)
      ? { start, end, marker: text.trimStart(), paragraphEnd: null }
      : null;
  }
  if (node.type !== 'heading') {
    return null;
  }
  const headingText = markdown.slice(start, end).replace(/\r?\n$/, '');
  if (bareHeadingLine.test(headingText)) {
    return {
      start,
      end: start + headingText.length,
      marker: headingText.trimStart(),
      paragraphEnd: null
    };
  }
  const line = lineSpanAt(markdown, Math.max(0, end - 1));
  // The heading has to keep some content above the marker line: that text is what markdown
  // folded into the heading, and it becomes the paragraph the marker held apart.
  if (line.start <= start || !bareMarkerLine.test(markdown.slice(line.start, line.end))) {
    return null;
  }
  return {
    start: line.start,
    end: line.end,
    marker: markdown.slice(line.start, line.end).trimStart(),
    paragraphEnd: line.start - 1
  };
}

/**
 * What the node becomes: the marker as text, and — for a heading — the paragraph markdown folded
 * into it, which keeps its own inline content and ends above the marker's line.
 */
function textNodes(node: Container, line: MarkerText): Container[] {
  const position = node.position!;
  const text: Container = {
    type: 'paragraph',
    children: [
      {
        type: 'text',
        value: line.marker,
        position: {
          start: { ...position.start, offset: line.start },
          end: { ...position.end, offset: line.end }
        }
      } as Container
    ],
    position: {
      start: { ...position.start, offset: line.start },
      end: { ...position.end, offset: line.end }
    }
  };
  if (line.paragraphEnd === null) {
    return [text];
  }
  return [
    {
      type: 'paragraph',
      children: node.children ?? [],
      position: { start: position.start, end: { ...position.start, offset: line.paragraphEnd } }
    },
    text
  ];
}
