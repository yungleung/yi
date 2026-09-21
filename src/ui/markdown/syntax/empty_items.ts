/**
 * Restores the empty list items markdown reads as setext headings.
 *
 * A line holding nothing but a list marker (`- `, `  - `, `1. `) is an empty
 * list item to the author, but when it directly follows a paragraph line
 * markdown reads it as a setext heading underline. Emptying a nested item
 * would then turn the line above it into a heading and the item itself would
 * disappear — deleting an item's text could rewrite the paragraph above it.
 *
 * This repair undoes that reading wherever it happens: the heading becomes a
 * paragraph again and the marker line becomes an empty item, either added to
 * the list that follows it or wrapped in a list of its own. It only touches
 * headings whose last line is a bare marker, so real setext headings (`===`,
 * `---`, `Title\n- `) are left alone unless they are exactly that shape.
 *
 * May import: the line helpers beside it (`./lines`). Upholds: one fact about
 * markdown syntax has one home — that a bare marker under a paragraph is a setext
 * heading, and how to write it so markdown reads the item instead.
 */

import type { Root } from 'mdast';
import { isBlankItemLine } from './lines';

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

/** A line holding nothing but a list marker. */
interface EmptyItemLine {
  /** Offset of the line's first character. */
  start: number;
  /** Offset just past the line's last character (before its newline). */
  end: number;
  /** Offset of the list marker itself. */
  marker: number;
}

/**
 * Rewrites every empty list item the parser turned into a setext heading.
 * The document text is read only to tell a marker line from heading text.
 */
export function restoreEmptyItems(root: Root, markdown: string): void {
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
    const line = emptyItemLine(markdown, children[index]);
    if (!line) {
      continue;
    }
    const [paragraph, item] = restoreItem(children[index], line);
    const following = children[index + 1];
    if (following?.type === 'list' && following.children) {
      // The marker line also opened the list below it, so the item belongs
      // there as the first entry rather than in a list of its own.
      following.children.unshift(item);
      children.splice(index, 1, paragraph);
      continue;
    }
    children.splice(index, 1, paragraph, {
      type: 'list',
      children: [item],
      position: item.position
    });
  }
}

/**
 * The marker line of a heading that is really an empty item, or null when the
 * heading is not of that shape.
 */
function emptyItemLine(markdown: string, heading: Container): EmptyItemLine | null {
  const position = heading.position;
  if (heading.type !== 'heading' || !position) {
    return null;
  }
  const end = Math.min(position.end.offset, markdown.length);
  const start = markdown.lastIndexOf('\n', Math.max(0, end - 1)) + 1;
  // The heading has to keep some content above the marker line: that text is
  // the paragraph markdown folded into the heading.
  if (start <= position.start.offset || !isBlankItemLine(markdown.slice(start, end))) {
    return null;
  }
  const marker = start + /^\s*/.exec(markdown.slice(start, end))![0].length;
  return { start, end, marker };
}

/**
 * The paragraph markdown folded into the heading, plus the item it swallowed:
 * the paragraph keeps the inline content, the item owns the marker line.
 */
function restoreItem(heading: Container, line: EmptyItemLine): [Container, Container] {
  const position = heading.position!;
  const paragraph: Container = {
    type: 'paragraph',
    children: heading.children ?? [],
    position: {
      start: position.start,
      end: { ...position.start, offset: line.start - 1 }
    }
  };
  const item: Container = {
    type: 'listItem',
    children: [],
    position: {
      start: { ...position.start, offset: line.marker },
      end: { ...position.start, offset: line.end }
    }
  };
  return [paragraph, item];
}
